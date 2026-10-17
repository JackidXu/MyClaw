/**
 * 本机录音资产 SQLite 存储与本地音频文件持久化管理器
 *
 * 遵循“只存在本机”架构：录音文件、逐字稿与 AI 纪要持久化落库本地 SQLite 与本地磁盘。
 */

import type Database from 'better-sqlite3';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import type {
  LocalRecordingItem,
  LocalRecordingStatus,
  RecordingExtractedItem,
  RecordingUtterance,
} from '../../shared/recordingCard/localRecording';

export class LocalRecordingStore {
  private readonly db: Database.Database;
  private readonly recordingsDir: string;

  constructor(db: Database.Database, userDataPath?: string) {
    this.db = db;
    const baseDir = userDataPath || app.getPath('userData');
    this.recordingsDir = path.join(baseDir, 'recordings');
    this.ensureDirectoryAndTables();
  }

  private ensureDirectoryAndTables(): void {
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_recordings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        local_path TEXT NOT NULL,
        duration TEXT NOT NULL DEFAULT '00:00',
        duration_ms INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0,
        source_type TEXT NOT NULL DEFAULT 'card',
        status TEXT NOT NULL DEFAULT 'pending',
        task_id TEXT,
        tos_url TEXT,
        tos_key TEXT,
        transcript_text TEXT,
        utterances_json TEXT,
        summary_text TEXT,
        items_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_recordings_status ON local_recordings(status);
      CREATE INDEX IF NOT EXISTS idx_local_recordings_created ON local_recordings(created_at);
    `);

    // 平滑迁移补齐老表字段
    const columns = this.db.prepare('PRAGMA table_info(local_recordings)').all() as any[];
    const colNames = new Set(columns.map(c => c.name));
    if (!colNames.has('tos_url')) {
      this.db.exec('ALTER TABLE local_recordings ADD COLUMN tos_url TEXT');
    }
    if (!colNames.has('tos_key')) {
      this.db.exec('ALTER TABLE local_recordings ADD COLUMN tos_key TEXT');
    }
  }

  /**
   * 将音频二进制保存到本地磁盘目录 (userData/recordings)
   */
  async saveAudioFile(filename: string, buffer: Buffer): Promise<{ localPath: string; size: number }> {
    // 净化文件名并防重命名冲撞
    const ext = path.extname(filename) || '.ogg';
    const base = path.basename(filename, ext);
    const safeBase = base.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
    const targetFilename = `${safeBase}_${Date.now()}${ext}`;
    const targetPath = path.join(this.recordingsDir, targetFilename);

    await fs.promises.writeFile(targetPath, buffer);
    const stat = await fs.promises.stat(targetPath);

    return {
      localPath: targetPath,
      size: stat.size,
    };
  }

  /**
   * 插入或更新录音记录
   */
  upsert(item: LocalRecordingItem): void {
    const now = Date.now();
    const utterancesJson = item.utterances ? JSON.stringify(item.utterances) : null;
    const itemsJson = item.items ? JSON.stringify(item.items) : null;

    const stmt = this.db.prepare(`
      INSERT INTO local_recordings (
        id, name, title, local_path, duration, duration_ms, size,
        source_type, status, task_id, tos_url, tos_key, transcript_text, utterances_json,
        summary_text, items_json, created_at, updated_at
      ) VALUES (
        @id, @name, @title, @localPath, @duration, @durationMs, @size,
        @sourceType, @status, @taskId, @tosUrl, @tosKey, @transcriptText, @utterancesJson,
        @summaryText, @itemsJson, @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        title = excluded.title,
        local_path = excluded.local_path,
        duration = excluded.duration,
        duration_ms = excluded.duration_ms,
        size = excluded.size,
        source_type = excluded.source_type,
        status = excluded.status,
        task_id = excluded.task_id,
        tos_url = excluded.tos_url,
        tos_key = excluded.tos_key,
        transcript_text = excluded.transcript_text,
        utterances_json = excluded.utterances_json,
        summary_text = excluded.summary_text,
        items_json = excluded.items_json,
        updated_at = excluded.updated_at;
    `);

    stmt.run({
      id: item.id,
      name: item.name,
      title: item.title,
      localPath: item.localPath,
      duration: item.duration || '00:00',
      durationMs: item.durationMs || 0,
      size: item.size || 0,
      sourceType: item.sourceType || 'card',
      status: item.status || 'pending',
      taskId: item.taskId || null,
      tosUrl: item.tosUrl || null,
      tosKey: item.tosKey || null,
      transcriptText: item.transcriptText || null,
      utterancesJson,
      summaryText: item.summary || null,
      itemsJson,
      createdAt: item.createdAt || now,
      updatedAt: now,
    });
  }

  /**
   * 获取所有录音记录列表（按创建时间倒序）
   */
  list(): LocalRecordingItem[] {
    const rows = this.db
      .prepare('SELECT * FROM local_recordings ORDER BY created_at DESC')
      .all() as any[];

    return rows.map(row => this.rowToItem(row));
  }

  /**
   * 根据 ID 查询单条录音
   */
  getById(id: string): LocalRecordingItem | null {
    const row = this.db
      .prepare('SELECT * FROM local_recordings WHERE id = ?')
      .get(id) as any;

    return row ? this.rowToItem(row) : null;
  }

  /**
   * 更新录音状态
   */
  updateStatus(id: string, status: LocalRecordingStatus): boolean {
    const info = this.db
      .prepare('UPDATE local_recordings SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), id);
    return info.changes > 0;
  }

  /**
   * 删除录音
   */
  delete(id: string, deleteFile = true): boolean {
    const item = this.getById(id);
    if (!item) return false;

    if (deleteFile && item.localPath && fs.existsSync(item.localPath)) {
      try {
        fs.unlinkSync(item.localPath);
      } catch (err) {
        console.warn('[LocalRecordingStore] Failed to unlink audio file:', err);
      }
    }

    const info = this.db.prepare('DELETE FROM local_recordings WHERE id = ?').run(id);
    return info.changes > 0;
  }

  private rowToItem(row: any): LocalRecordingItem {
    let utterances: RecordingUtterance[] | undefined;
    if (row.utterances_json) {
      try {
        utterances = JSON.parse(row.utterances_json);
      } catch {
        utterances = undefined;
      }
    }

    let items: RecordingExtractedItem[] | undefined;
    if (row.items_json) {
      try {
        items = JSON.parse(row.items_json);
      } catch {
        items = undefined;
      }
    }

    return {
      id: row.id,
      name: row.name,
      title: row.title,
      localPath: row.local_path,
      duration: row.duration,
      durationMs: row.duration_ms,
      size: row.size,
      sourceType: row.source_type,
      status: row.status,
      taskId: row.task_id || undefined,
      tosUrl: row.tos_url || undefined,
      tosKey: row.tos_key || undefined,
      transcriptText: row.transcript_text || undefined,
      utterances,
      summary: row.summary_text || undefined,
      items,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
