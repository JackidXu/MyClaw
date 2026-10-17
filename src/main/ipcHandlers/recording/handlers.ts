import { ipcMain } from 'electron';
import fs from 'fs';

import {
  LocalRecordingIpc,
  type LocalRecordingItem,
  type LocalRecordingStatus,
} from '../../../shared/recordingCard/localRecording';
import type { LocalRecordingStore } from '../../recordings/localRecordingStore';

export function registerLocalRecordingIpcHandlers(getStore: () => LocalRecordingStore | null): void {
  // 1. 获取所有本机录音列表
  ipcMain.handle(LocalRecordingIpc.GetList, async () => {
    try {
      const store = getStore();
      if (!store) throw new Error('录音存储服务尚未初始化');
      return { success: true, data: store.list() };
    } catch (err: any) {
      console.warn('[LocalRecordingIPC] GetList failed:', err);
      return { success: false, error: err?.message || '获取录音列表失败' };
    }
  });

  // 2. 根据 ID 获取单条录音
  ipcMain.handle(LocalRecordingIpc.GetById, async (_event, id: string) => {
    try {
      const store = getStore();
      if (!store) throw new Error('录音存储服务尚未初始化');
      const item = store.getById(id);
      return { success: true, data: item };
    } catch (err: any) {
      console.warn('[LocalRecordingIPC] GetById failed:', err);
      return { success: false, error: err?.message || '获取录音详情失败' };
    }
  });

  // 3. 保存音频二进制文件到本地磁盘
  ipcMain.handle(
    LocalRecordingIpc.SaveAudioFile,
    async (_event, filename: string, arrayBuffer: ArrayBuffer) => {
      try {
        const store = getStore();
        if (!store) throw new Error('录音存储服务尚未初始化');
        const buffer = Buffer.from(arrayBuffer);
        const result = await store.saveAudioFile(filename, buffer);
        return { success: true, data: result };
      } catch (err: any) {
        console.warn('[LocalRecordingIPC] SaveAudioFile failed:', err);
        return { success: false, error: err?.message || '保存音频文件失败' };
      }
    },
  );

  // 4. 创建或更新录音记录
  ipcMain.handle(
    LocalRecordingIpc.UpsertRecord,
    async (_event, item: LocalRecordingItem) => {
      try {
        const store = getStore();
        if (!store) throw new Error('录音存储服务尚未初始化');
        store.upsert(item);
        return { success: true, data: item };
      } catch (err: any) {
        console.warn('[LocalRecordingIPC] UpsertRecord failed:', err);
        return { success: false, error: err?.message || '保存录音记录失败' };
      }
    },
  );

  // 5. 更新状态
  ipcMain.handle(
    LocalRecordingIpc.UpdateStatus,
    async (_event, id: string, status: LocalRecordingStatus) => {
      try {
        const store = getStore();
        if (!store) throw new Error('录音存储服务尚未初始化');
        const ok = store.updateStatus(id, status);
        return { success: ok };
      } catch (err: any) {
        console.warn('[LocalRecordingIPC] UpdateStatus failed:', err);
        return { success: false, error: err?.message || '更新录音状态失败' };
      }
    },
  );

  // 6. 删除录音记录
  ipcMain.handle(
    LocalRecordingIpc.DeleteRecord,
    async (_event, id: string, deleteFile = true) => {
      try {
        const store = getStore();
        if (!store) throw new Error('录音存储服务尚未初始化');
        const ok = store.delete(id, deleteFile);
        return { success: ok };
      } catch (err: any) {
        console.warn('[LocalRecordingIPC] DeleteRecord failed:', err);
        return { success: false, error: err?.message || '删除录音失败' };
      }
    },
  );

  // 7. 读取本地音频二进制文件 (走原生 fs 避免渲染层 CSP 限制)
  ipcMain.handle(
    LocalRecordingIpc.ReadAudioFile,
    async (_event, filePath: string) => {
      try {
        if (!filePath || typeof filePath !== 'string') {
          throw new Error('未提供有效的文件路径');
        }
        const buffer = await fs.promises.readFile(filePath);
        return {
          success: true,
          data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        };
      } catch (err: any) {
        console.warn('[LocalRecordingIPC] ReadAudioFile failed:', err);
        return { success: false, error: err?.message || '读取音频文件失败' };
      }
    },
  );
}
