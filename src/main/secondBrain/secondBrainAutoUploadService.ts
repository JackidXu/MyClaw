import crypto from 'crypto';
import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';

import {
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

interface StatCacheEntry {
  mtimeMs: number;
  size: number;
  hash: string;
}

export class SecondBrainAutoUploadService {
  private store: SqliteStore | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  /** 内存 Stat Cache：仅用于加速 MD5 计算（当且仅当 mtimeMs 与 size 均未变时直接复用） */
  private statCache = new Map<string, StatCacheEntry>();

  /** 初始化服务并挂载配置存储 */
  public initialize(store: SqliteStore): void {
    this.store = store;

    // 清理上个方案遗留的废弃本地影子表（数据已全面迁移至云端 SSOT）
    try {
      this.store.getDatabase().exec('DROP TABLE IF EXISTS second_brain_synced_files');
    } catch (err) {
      console.warn('[SecondBrainAutoUpload] Failed to drop legacy table second_brain_synced_files:', err);
    }

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

  /** 清理定时器与缓存 */
  public dispose(): void {
    this.stopTimer();
    this.statCache.clear();
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

  /** 递归扫描指定目录并筛选出候选待处理文件列表（通过 statCache 极速获取 MD5，查重与截断 100% 归云端） */
  public async scanPendingFiles(): Promise<SecondBrainPendingItem[]> {
    const config = this.getConfig();
    const targetDir = config.watchDir.trim();

    if (!targetDir || !fs.existsSync(targetDir)) {
      return [];
    }

    const pendingItems: SecondBrainPendingItem[] = [];

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
        const currentSize = stat.size;

        // 4. 利用轻量 Stat Cache 极速获取 MD5（当且仅当 mtimeMs 与 size 均未变时直接复用）
        const cached = this.statCache.get(fullPath);
        let fileHash: string | null = null;
        if (cached && cached.mtimeMs === currentMtime && cached.size === currentSize) {
          fileHash = cached.hash;
        } else {
          fileHash = this.computeFileHash(fullPath);
          if (fileHash) {
            this.statCache.set(fullPath, {
              mtimeMs: currentMtime,
              size: currentSize,
              hash: fileHash,
            });
          }
        }

        if (!fileHash) {
          continue;
        }

        pendingItems.push({
          filePath: fullPath,
          fileName: entry.name,
          mtimeMs: currentMtime,
          fileHash,
        });
      }
    };

    scanRecursively(targetDir);

    console.log(`[SecondBrainAutoUpload] scanPendingFiles on "${targetDir}" found ${pendingItems.length} candidate item(s)`);
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
}

export const secondBrainAutoUploadService = new SecondBrainAutoUploadService();
