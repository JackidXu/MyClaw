import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';

import {
  MarkFileSyncedParams,
  SECOND_BRAIN_MAX_FILE_SIZE,
  SECOND_BRAIN_SUPPORTED_EXTENSIONS,
  SECOND_BRAIN_SYNC_INTERVAL_MS,
  SecondBrainAutoUploadConfig,
  SecondBrainAutoUploadIpc,
  SecondBrainAutoUploadStatus,
  SecondBrainPendingItem,
} from '../../shared/secondBrain/constants';
import type { SqliteStore } from '../sqliteStore';

/** 忽略的目录黑名单 */
const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.vscode',
  '.idea',
  '.svn',
  '$RECYCLE.BIN',
  'System Volume Information',
]);

export class SecondBrainAutoUploadService {
  private store: SqliteStore | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  /** 初始化服务并挂载数据库 */
  public initialize(store: SqliteStore): void {
    this.store = store;
    this.ensureDatabaseTable();

    const config = this.getConfig();
    if (config.watchDir) {
      console.log(`[SecondBrainAutoUpload] Initialized with watchDir="${config.watchDir}", scheduling timer`);
      this.startTimer();
      // 启动就绪 5 秒后首次触发同步
      setTimeout(() => {
        this.notifyRendererSync();
      }, 5000);
    }
  }

  /** 清理定时器 */
  public dispose(): void {
    this.stopTimer();
    this.store = null;
  }

  /** 确保 SQLite 防重表存在 */
  private ensureDatabaseTable(): void {
    if (!this.store) return;
    try {
      const db = this.store.getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS second_brain_synced_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL UNIQUE,
          file_name TEXT NOT NULL,
          file_hash TEXT NOT NULL DEFAULT '',
          file_size INTEGER NOT NULL DEFAULT 0,
          mtime_ms INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'success',
          error_msg TEXT,
          uploaded_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_second_brain_synced_path ON second_brain_synced_files(file_path);
      `);
      // 动态平滑补充 status 字段（若老表缺少）
      const tableInfo = db.prepare('PRAGMA table_info(second_brain_synced_files)').all() as Array<{ name: string }>;
      const hasStatus = tableInfo.some((col) => col.name === 'status');
      if (!hasStatus) {
        db.exec("ALTER TABLE second_brain_synced_files ADD COLUMN status TEXT DEFAULT 'success';");
      }
      // 清理已废弃的 kv 键
      this.store.delete('secondBrain.autoUpload.enabled');
    } catch (error) {
      console.error('[SecondBrainAutoUpload] Failed to ensure database table:', error);
    }
  }

  /** 读取配置 */
  public getConfig(): SecondBrainAutoUploadConfig {
    if (!this.store) {
      return { watchDir: '' };
    }
    const watchDir = (this.store.get<string>('secondBrain.autoUpload.watchDir') || '').trim();
    return { watchDir };
  }

  /** 更新配置 */
  public setConfig(config: Partial<SecondBrainAutoUploadConfig>): SecondBrainAutoUploadConfig {
    if (!this.store) {
      return { watchDir: '' };
    }

    const current = this.getConfig();
    const nextWatchDir = config.watchDir !== undefined ? config.watchDir.trim() : current.watchDir;

    this.store.set('secondBrain.autoUpload.watchDir', nextWatchDir);
    this.store.delete('secondBrain.autoUpload.enabled');

    console.log(`[SecondBrainAutoUpload] Config updated: watchDir="${nextWatchDir}"`);

    if (nextWatchDir) {
      this.startTimer();
      this.notifyRendererSync();
    } else {
      this.stopTimer();
      this.broadcastStatus();
    }

    return { watchDir: nextWatchDir };
  }

  /** 获取状态 */
  public getStatus(): SecondBrainAutoUploadStatus {
    const config = this.getConfig();
    return {
      watchDir: config.watchDir,
      isSyncing: this.isSyncing,
    };
  }

  /** 广播状态变更通知至渲染窗口 */
  public broadcastStatus(): void {
    const status = this.getStatus();
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(SecondBrainAutoUploadIpc.StatusChanged, status);
      }
    });
  }

  /** 启动 5 分钟定时器 */
  private startTimer(): void {
    this.stopTimer();
    this.intervalTimer = setInterval(() => {
      this.notifyRendererSync();
    }, SECOND_BRAIN_SYNC_INTERVAL_MS);
    console.log(`[SecondBrainAutoUpload] Timer scheduled every ${SECOND_BRAIN_SYNC_INTERVAL_MS / 1000}s`);
  }

  /** 停止定时器 */
  private stopTimer(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /** 通知渲染进程执行自动同步 */
  public notifyRendererSync(): void {
    const config = this.getConfig();
    if (!config.watchDir) return;

    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(SecondBrainAutoUploadIpc.TriggerSyncRequested);
      }
    });
  }

  /** 递归扫描指定目录并筛选出未同步文件列表 */
  public async scanPendingFiles(): Promise<SecondBrainPendingItem[]> {
    const config = this.getConfig();
    const targetDir = config.watchDir.trim();
    const pendingItems: SecondBrainPendingItem[] = [];

    if (!targetDir || !fs.existsSync(targetDir) || !this.store) {
      return pendingItems;
    }

    const db = this.store.getDatabase();
    const selectStmt = db.prepare(
      "SELECT mtime_ms FROM second_brain_synced_files WHERE file_path = ? AND status = 'success'",
    );

    const scanRecursively = (dir: string) => {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (err) {
        console.warn(`[SecondBrainAutoUpload] Failed to read directory "${dir}":`, err);
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // 1. 目录处理：跳过黑名单目录与隐藏目录
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || IGNORED_DIR_NAMES.has(entry.name)) {
            continue;
          }
          scanRecursively(fullPath);
          continue;
        }

        // 2. 文件过滤：仅支持 .docx/.md/.txt，过滤临时文件和隐藏文件
        if (!entry.isFile()) continue;
        if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue;

        const ext = path.extname(entry.name).toLowerCase() as any;
        if (!SECOND_BRAIN_SUPPORTED_EXTENSIONS.includes(ext)) {
          continue;
        }

        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }

        // 3. 大小检查：不超过 2MB
        if (stat.size > SECOND_BRAIN_MAX_FILE_SIZE) {
          continue;
        }

        const currentMtime = Math.round(stat.mtimeMs);
        const existing = selectStmt.get(fullPath) as { mtime_ms: number } | undefined;

        // 4. 防重检查：如果该文件已经成功同步过且修改时间未变，则跳过
        if (existing && existing.mtime_ms === currentMtime) {
          continue;
        }

        pendingItems.push({
          filePath: fullPath,
          fileName: entry.name,
          mtimeMs: currentMtime,
        });
      }
    };

    scanRecursively(targetDir);
    console.log(`[SecondBrainAutoUpload] scanPendingFiles on "${targetDir}" found ${pendingItems.length} new item(s)`);
    return pendingItems;
  }

  /** 读取本地文件二进制内容 */
  public readLocalFile(filePath: string): Buffer | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      return fs.readFileSync(filePath);
    } catch (error) {
      console.warn(`[SecondBrainAutoUpload] Failed to read local file "${filePath}":`, error);
      return null;
    }
  }

  /** 记录文件同步完成入 SQLite */
  public markFileSynced(params: MarkFileSyncedParams): void {
    if (!this.store) return;
    try {
      const db = this.store.getDatabase();
      const fileName = path.basename(params.filePath);
      let fileSize = 0;
      try {
        if (fs.existsSync(params.filePath)) {
          fileSize = fs.statSync(params.filePath).size;
        }
      } catch {
        // ignore
      }

      db.prepare(`
        INSERT INTO second_brain_synced_files (
          file_path, file_name, file_hash, file_size, mtime_ms, status, uploaded_at
        )
        VALUES (?, ?, '', ?, ?, 'success', ?)
        ON CONFLICT(file_path) DO UPDATE SET
          file_name = excluded.file_name,
          file_size = excluded.file_size,
          mtime_ms = excluded.mtime_ms,
          status = 'success',
          uploaded_at = excluded.uploaded_at
      `).run(params.filePath, fileName, fileSize, params.mtimeMs, Date.now());
      console.log(`[SecondBrainAutoUpload] Successfully marked file synced: "${params.filePath}"`);
    } catch (error) {
      console.error(`[SecondBrainAutoUpload] Failed to mark file synced "${params.filePath}":`, error);
      throw error;
    }
  }
}

export const secondBrainAutoUploadService = new SecondBrainAutoUploadService();
