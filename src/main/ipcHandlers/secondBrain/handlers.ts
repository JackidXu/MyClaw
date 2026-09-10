import { BrowserWindow, dialog, ipcMain } from 'electron';

import {
  MarkFileSyncedParams,
  SecondBrainAutoUploadConfig,
  SecondBrainAutoUploadIpc,
} from '../../../shared/secondBrain/constants';
import { secondBrainAutoUploadService } from '../../secondBrain/secondBrainAutoUploadService';

export function registerSecondBrainIpcHandlers(): void {
  // 1. 选择监听目录
  ipcMain.handle(SecondBrainAutoUploadIpc.SelectWatchDir, async (event) => {
    try {
      const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const result = ownerWindow
        ? await dialog.showOpenDialog(ownerWindow, {
            title: '选择第二大脑自动同步目录',
            properties: ['openDirectory', 'createDirectory'],
          })
        : await dialog.showOpenDialog({
            title: '选择第二大脑自动同步目录',
            properties: ['openDirectory', 'createDirectory'],
          });

      if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, path: result.filePaths[0] };
      }
      return { success: false, canceled: true };
    } catch (error) {
      console.warn('[SecondBrainIpc] Failed to select directory:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '选择目录失败',
      };
    }
  });

  // 2. 获取配置与运行状态
  ipcMain.handle(SecondBrainAutoUploadIpc.GetConfig, () => {
    try {
      const config = secondBrainAutoUploadService.getConfig();
      const status = secondBrainAutoUploadService.getStatus();
      return { success: true, config, status };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取配置失败',
      };
    }
  });

  // 3. 更新配置
  ipcMain.handle(
    SecondBrainAutoUploadIpc.SetConfig,
    (_event, payload: Partial<SecondBrainAutoUploadConfig>) => {
      try {
        const updatedConfig = secondBrainAutoUploadService.setConfig(payload);
        const status = secondBrainAutoUploadService.getStatus();
        return { success: true, config: updatedConfig, status };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '更新配置失败',
        };
      }
    },
  );

  // 4. 手动触发同步通知
  ipcMain.handle(SecondBrainAutoUploadIpc.TriggerSync, () => {
    try {
      secondBrainAutoUploadService.notifyRendererSync();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '触发同步失败',
      };
    }
  });

  // 5. 扫描待同步的新增或修改文件
  ipcMain.handle(SecondBrainAutoUploadIpc.ScanPendingFiles, async () => {
    try {
      const items = await secondBrainAutoUploadService.scanPendingFiles();
      return { success: true, items };
    } catch (error) {
      console.warn('[SecondBrainIpc] Failed to scan pending files:', error);
      return {
        success: false,
        items: [],
        error: error instanceof Error ? error.message : '扫描待同步文件失败',
      };
    }
  });

  // 6. 读取本地文件的二进制内容
  ipcMain.handle(SecondBrainAutoUploadIpc.ReadLocalFile, async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: '文件路径无效' };
      }
      const buffer = secondBrainAutoUploadService.readLocalFile(filePath);
      if (!buffer) {
        return { success: false, error: '文件不存在或无法读取' };
      }
      return { success: true, data: buffer };
    } catch (error) {
      console.warn(`[SecondBrainIpc] Failed to read file "${filePath}":`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '读取文件失败',
      };
    }
  });

  // 7. 标记单个文件同步状态入 SQLite
  ipcMain.handle(
    SecondBrainAutoUploadIpc.MarkFileSynced,
    async (_event, params: MarkFileSyncedParams) => {
      try {
        secondBrainAutoUploadService.markFileSynced(params);
        return { success: true };
      } catch (error) {
        console.warn('[SecondBrainIpc] Failed to mark file synced:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : '记录文件同步状态失败',
        };
      }
    },
  );
}
