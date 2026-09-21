import crypto from 'crypto';
import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';

import {
  MarkFileFailedParams,
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
    this.backfillMissingHashes();

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

  /** 计算文件或数据内容的 MD5 哈希值（100% 复用 Node 原生 crypto） */
  public computeHash(input: { filePath?: string; buffer?: Uint8Array | Buffer }): string | null {
    try {
      if (input.buffer) {
        return crypto.createHash('md5').update(input.buffer).digest('hex');
      }
      if (input.filePath && fs.existsSync(input.filePath)) {
        const content = fs.readFileSync(input.filePath);
        return crypto.createHash('md5').update(content).digest('hex');
      }
      return null;
    } catch (error) {
      console.warn('[SecondBrainAutoUpload] Failed to compute hash:', error);
      return null;
    }
  }

  /** 计算本地文件内容的 MD5 哈希值 */
  public computeFileHash(filePath: string): string | null {
    return this.computeHash({ filePath });
  }

  /** 对历史存量中 file_hash 为空的已同步记录执行一次性哈希修补 */
  private backfillMissingHashes(): void {
    if (!this.store) return;
    try {
      const db = this.store.getDatabase();
      const rows = db
        .prepare(
          "SELECT id, file_path FROM second_brain_synced_files WHERE (file_hash IS NULL OR file_hash = '') AND status = 'success'",
        )
        .all() as Array<{ id: number; file_path: string }>;

      if (rows.length === 0) return;
      console.log(`[SecondBrainAutoUpload] Backfilling hash for ${rows.length} legacy synced file(s)...`);

      const updateStmt = db.prepare('UPDATE second_brain_synced_files SET file_hash = ? WHERE id = ?');
      const updateMany = db.transaction((items: Array<{ id: number; hash: string }>) => {
        for (const item of items) {
          updateStmt.run(item.hash, item.id);
        }
      });

      const updates: Array<{ id: number; hash: string }> = [];
      for (const row of rows) {
        const hash = this.computeFileHash(row.file_path);
        if (hash) {
          updates.push({ id: row.id, hash });
        }
      }

      if (updates.length > 0) {
        updateMany(updates);
        console.log(`[SecondBrainAutoUpload] Successfully backfilled ${updates.length} file hash(es)`);
      }
    } catch (error) {
      console.warn('[SecondBrainAutoUpload] Failed to backfill legacy file hashes:', error);
    }
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
        CREATE INDEX IF NOT EXISTS idx_second_brain_synced_hash ON second_brain_synced_files(file_hash);
      `);
      // 动态平滑补充 status 与 error_msg 字段（若老表缺少）
      const tableInfo = db.prepare('PRAGMA table_info(second_brain_synced_files)').all() as Array<{ name: string }>;
      const hasStatus = tableInfo.some((col) => col.name === 'status');
      if (!hasStatus) {
        db.exec("ALTER TABLE second_brain_synced_files ADD COLUMN status TEXT DEFAULT 'success';");
      }
      const hasErrorMsg = tableInfo.some((col) => col.name === 'error_msg');
      if (!hasErrorMsg) {
        db.exec('ALTER TABLE second_brain_synced_files ADD COLUMN error_msg TEXT;');
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

    if (!targetDir || !fs.existsSync(targetDir) || !this.store) {
      return [];
    }

    const db = this.store.getDatabase();
    const selectByPathStmt = db.prepare(
      "SELECT id, mtime_ms, file_hash FROM second_brain_synced_files WHERE file_path = ? AND status = 'success'",
    );
    const selectByHashStmt = db.prepare(
      "SELECT id, file_path, mtime_ms FROM second_brain_synced_files WHERE file_hash = ? AND status = 'success'",
    );
    const selectFailedStmt = db.prepare(
      "SELECT id, file_hash, uploaded_at FROM second_brain_synced_files WHERE file_path = ? AND status = 'failed'",
    );
    const updateRecordStmt = db.prepare(
      'UPDATE second_brain_synced_files SET file_path = ?, file_name = ?, mtime_ms = ?, file_size = ? WHERE id = ?',
    );

    interface CandidateItem {
      item: SecondBrainPendingItem;
      isPendingRetry: boolean;
      failedAt: number;
    }
    const candidates: CandidateItem[] = [];

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
        const existingByPath = selectByPathStmt.get(fullPath) as
          | { id: number; mtime_ms: number; file_hash: string }
          | undefined;

        // 4. 第一级防重（极速路径）：路径相同且修改时间未变，判为相同文件直接跳过（零 I/O 开销）
        if (existingByPath && existingByPath.mtime_ms === currentMtime) {
          continue;
        }

        // 5. 第二级防重（内容哈希比对）：路径不匹配或修改时间已变（如被网盘同步/触摸），计算文件内容哈希
        const fileHash = this.computeFileHash(fullPath);
        if (!fileHash) {
          continue;
        }

        const existingByHash = selectByHashStmt.get(fileHash) as
          | { id: number; file_path: string; mtime_ms: number }
          | undefined;

        if (existingByHash) {
          // 哈希命中：说明文件内容 100% 相同（仅路径或修改时间发生变动），更新本地记录并跳过上传
          try {
            updateRecordStmt.run(fullPath, entry.name, currentMtime, stat.size, existingByHash.id);
          } catch {
            // ignore update failure
          }
          continue;
        }

        // 6. 检查是否为历史失败待重试文件（曾失败且内容哈希未变）
        const failedRecord = selectFailedStmt.get(fullPath) as
          | { id: number; file_hash: string; uploaded_at: number }
          | undefined;
        const isPendingRetry = Boolean(failedRecord && failedRecord.file_hash === fileHash);
        const failedAt = isPendingRetry ? (failedRecord?.uploaded_at ?? 0) : 0;

        // 两级均未命中，推入候选待同步列表
        candidates.push({
          item: {
            filePath: fullPath,
            fileName: entry.name,
            mtimeMs: currentMtime,
            fileHash,
          },
          isPendingRetry,
          failedAt,
        });
      }
    };

    scanRecursively(targetDir);

    // 智能优先级排序（根除队头阻塞）：全新未失败文件排在队头优先处理；曾失败文件沉底排在队尾
    candidates.sort((a, b) => {
      if (a.isPendingRetry !== b.isPendingRetry) {
        return a.isPendingRetry ? 1 : -1;
      }
      if (a.isPendingRetry && b.isPendingRetry) {
        return a.failedAt - b.failedAt;
      }
      return 0;
    });

    const pendingItems = candidates.map((c) => c.item);
    console.log(`[SecondBrainAutoUpload] scanPendingFiles on "${targetDir}" found ${pendingItems.length} item(s)`);
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

      const fileHash = params.fileHash || this.computeFileHash(params.filePath) || '';

      db.prepare(`
        INSERT INTO second_brain_synced_files (
          file_path, file_name, file_hash, file_size, mtime_ms, status, error_msg, uploaded_at
        )
        VALUES (?, ?, ?, ?, ?, 'success', NULL, ?)
        ON CONFLICT(file_path) DO UPDATE SET
          file_name = excluded.file_name,
          file_hash = excluded.file_hash,
          file_size = excluded.file_size,
          mtime_ms = excluded.mtime_ms,
          status = 'success',
          error_msg = NULL,
          uploaded_at = excluded.uploaded_at
      `).run(params.filePath, fileName, fileHash, fileSize, params.mtimeMs, Date.now());
      console.log(`[SecondBrainAutoUpload] Successfully marked file synced: "${params.filePath}" (hash=${fileHash})`);
    } catch (error) {
      console.error(`[SecondBrainAutoUpload] Failed to mark file synced "${params.filePath}":`, error);
      throw error;
    }
  }

  /** 记录文件同步失败入 SQLite（沉底至队尾消除队头阻塞） */
  public markFileFailed(params: MarkFileFailedParams): void {
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

      const fileHash = params.fileHash || this.computeFileHash(params.filePath) || '';

      db.prepare(`
        INSERT INTO second_brain_synced_files (
          file_path, file_name, file_hash, file_size, mtime_ms, status, error_msg, uploaded_at
        )
        VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
          file_name = excluded.file_name,
          file_hash = excluded.file_hash,
          file_size = excluded.file_size,
          mtime_ms = excluded.mtime_ms,
          status = 'failed',
          error_msg = excluded.error_msg,
          uploaded_at = excluded.uploaded_at
      `).run(params.filePath, fileName, fileHash, fileSize, params.mtimeMs, params.errorMsg || '上传失败', Date.now());
      console.warn(`[SecondBrainAutoUpload] Marked file failed: "${params.filePath}" (reason: ${params.errorMsg})`);
    } catch (error) {
      console.error(`[SecondBrainAutoUpload] Failed to mark file failed "${params.filePath}":`, error);
      throw error;
    }
  }
}

export const secondBrainAutoUploadService = new SecondBrainAutoUploadService();
