import { ipcMain } from 'electron';

import {
  RecordingCardWifiIpc,
} from '../../../shared/recordingCard/constants';
import { recordingCardWifiManager } from '../../libs/recordingCardWifi';
import { wifiManager } from '../../libs/wifiManager';

export function registerRecordingCardIpcHandlers(): void {
  // 1. 建立 TCP Socket 连接
  ipcMain.handle(RecordingCardWifiIpc.Connect, async () => {
    try {
      await recordingCardWifiManager.connect();
      await recordingCardWifiManager.waitSocketReady();
      recordingCardWifiManager.startHeartbeat();
      await recordingCardWifiManager.startSync();
      return { success: true };
    } catch (error) {
      console.warn('[RecordingCardWifi] Connect failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '连接 Wi-Fi 失败',
      };
    }
  });

  // 2. 断开连接并关闭 Wi-Fi，若提供 restoreTargetSsid 则由主进程有序切回原 Wi-Fi
  ipcMain.handle(RecordingCardWifiIpc.Disconnect, async (event, restoreTargetSsid?: string) => {
    try {
      await recordingCardWifiManager.endSync(event.sender);
    } catch (e) {
      console.warn('[RecordingCardWifi] endSync error:', e);
      recordingCardWifiManager.disconnect(event.sender);
    } finally {
      if (restoreTargetSsid) {
        console.log(`[RecordingCardWifi] 正在切回原系统 Wi-Fi: ${restoreTargetSsid}...`);
        await wifiManager.restoreWifi(restoreTargetSsid).catch(() => {});
      }
    }
    return { success: true };
  });

  // 3. 获取录音文件列表
  ipcMain.handle(RecordingCardWifiIpc.GetFiles, async () => {
    try {
      const files = await recordingCardWifiManager.getFileList();
      return { success: true, files };
    } catch (error) {
      console.warn('[RecordingCardWifi] GetFiles failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取录音文件列表失败',
      };
    }
  });

  // 4. 下载单个录音文件
  ipcMain.handle(RecordingCardWifiIpc.DownloadFile, async (event, filename: string) => {
    try {
      const buf = await recordingCardWifiManager.downloadFile(
        filename,
        () => {
          // 内部已通过 webContents.send 推送进度
        },
        event.sender
      );
      return { success: true, data: buf };
    } catch (error) {
      console.warn('[RecordingCardWifi] DownloadFile failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '下载录音文件失败',
      };
    }
  });

  // 5. 取消下载
  ipcMain.handle(RecordingCardWifiIpc.Cancel, () => {
    recordingCardWifiManager.cancelDownload();
    return { success: true };
  });

  // 6. 自动连接指定 Wi-Fi 热点
  ipcMain.handle(
    RecordingCardWifiIpc.AutoConnectWifi,
    async (_event, ssid: string, password?: string) => {
      return await wifiManager.connectWifi(ssid, password);
    }
  );

  // 7. 获取当前所连 Wi-Fi 名称
  ipcMain.handle(RecordingCardWifiIpc.GetCurrentWifi, async () => {
    return await wifiManager.getCurrentWifi();
  });

  // 8. 恢复连接原有 Wi-Fi
  ipcMain.handle(
    RecordingCardWifiIpc.RestoreWifi,
    async (_event, targetSsid: string) => {
      return await wifiManager.restoreWifi(targetSsid);
    }
  );

  // 9. 探测宿主机是否连通公网
  ipcMain.handle(RecordingCardWifiIpc.CheckOnline, async () => {
    return await wifiManager.isInternetOnline();
  });
}
