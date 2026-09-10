import {
  SECOND_BRAIN_MAX_BATCH_COUNT,
  SecondBrainAutoUploadConfig,
  SecondBrainAutoUploadStatus,
} from '../../shared/secondBrain/constants';
import { uploadAndCreateDocument } from './secondBrainApi';

/**
 * 第二大脑文档自动定时上传/同步服务
 * 核心原则：直接复用现成的手动上传方法 uploadAndCreateDocument，定时模拟用户的上传操作
 */
class SecondBrainAutoUploadService {
  private isSyncing = false;
  private initialized = false;

  constructor() {
    this.initSyncListener();
  }

  /** 初始化主进程定时触发的同步监听 */
  private initSyncListener(): void {
    if (this.initialized) return;
    if (typeof window !== 'undefined' && window.electron?.secondBrainAutoUpload?.onTriggerSyncRequested) {
      this.initialized = true;
      window.electron.secondBrainAutoUpload.onTriggerSyncRequested(() => {
        console.log('[SecondBrainAutoUpload] Received trigger sync requested from main process');
        void this.runAutoUploadSync();
      });
    }
  }

  /** 打开系统文件夹选择框选择监听目录 */
  async selectWatchDir(): Promise<string | null> {
    const res = await window.electron.secondBrainAutoUpload?.selectWatchDir?.();
    if (res?.success && res.path) {
      return res.path;
    }
    return null;
  }

  /** 获取配置与状态 */
  async getConfigAndStatus(): Promise<{
    config: SecondBrainAutoUploadConfig;
    status: SecondBrainAutoUploadStatus;
  } | null> {
    const res = await window.electron.secondBrainAutoUpload?.getConfig?.();
    if (res?.success && res.config && res.status) {
      return { config: res.config, status: res.status };
    }
    return null;
  }

  /** 更新配置 */
  async setConfig(
    config: Partial<SecondBrainAutoUploadConfig>,
  ): Promise<{
    config: SecondBrainAutoUploadConfig;
    status: SecondBrainAutoUploadStatus;
  } | null> {
    const res = await window.electron.secondBrainAutoUpload?.setConfig?.(config);
    if (res?.success && res.config && res.status) {
      // 若更新了有效目录，立即触发一次同步
      if (res.config.watchDir) {
        void this.runAutoUploadSync();
      }
      return { config: res.config, status: res.status };
    }
    return null;
  }

  /** 手动立即触发一次同步 */
  async triggerSync(): Promise<{ success: boolean; count: number }> {
    return await this.runAutoUploadSync();
  }

  /** 监听状态变化广播 */
  onStatusChanged(callback: (status: SecondBrainAutoUploadStatus) => void): () => void {
    if (typeof window.electron.secondBrainAutoUpload?.onStatusChanged === 'function') {
      return window.electron.secondBrainAutoUpload.onStatusChanged(callback);
    }
    return () => {};
  }

  /**
   * 执行自动同步：扫描本地目录，直接调用现成的手动上传方法，完成后刷新列表与统计
   */
  async runAutoUploadSync(): Promise<{ success: boolean; count: number }> {
    if (this.isSyncing) {
      console.log('[SecondBrainAutoUpload] Sync already running, skipping');
      return { success: true, count: 0 };
    }

    const configRes = await this.getConfigAndStatus();
    if (!configRes?.config.watchDir) {
      return { success: true, count: 0 };
    }

    this.isSyncing = true;
    let successCount = 0;

    try {
      // 1. 扫描目录待同步文件
      const scanRes = await window.electron.secondBrainAutoUpload?.scanPendingFiles?.();
      if (!scanRes?.success || !scanRes.items) {
        console.warn('[SecondBrainAutoUpload] Failed to scan pending files:', scanRes?.error);
        return { success: false, count: 0 };
      }

      const pendingItems = scanRes.items;
      if (pendingItems.length === 0) {
        return { success: true, count: 0 };
      }

      // 2. 单批最多处理 10 份文档（与手动上传上限一致）
      const batch = pendingItems.slice(0, SECOND_BRAIN_MAX_BATCH_COUNT);

      for (const item of batch) {
        try {
          // 3. 读取本地文件二进制内容
          const readRes = await window.electron.secondBrainAutoUpload?.readLocalFile?.(item.filePath);
          if (!readRes?.success || !readRes.data) {
            throw new Error(readRes?.error || '无法读取文件内容');
          }

          // 4. 直接复用现成的同一个上传方法！获取预签名 -> TOS 直传 -> 录入第二大脑开始萃取
          await uploadAndCreateDocument({
            name: item.fileName,
            content: readRes.data,
          });

          // 5. 标记防重成功入 SQLite
          const markRes = await window.electron.secondBrainAutoUpload?.markFileSynced?.({
            filePath: item.filePath,
            mtimeMs: item.mtimeMs,
          });
          if (!markRes?.success) {
            console.error(`[SecondBrainAutoUpload] 标记文件 "${item.fileName}" 已同步失败:`, markRes?.error);
          }
          successCount++;
        } catch (err: any) {
          console.warn(`[SecondBrainAutoUpload] 上传 "${item.fileName}" 失败:`, err);
        }
      }

      // 6. 若有成功上传的文档，派发事件让第二大脑视图自动刷新列表与统计
      if (successCount > 0) {
        window.dispatchEvent(
          new CustomEvent('secondBrain:docUploaded', {
            detail: { count: successCount },
          }),
        );
      }

      return { success: true, count: successCount };
    } catch (err) {
      console.error('[SecondBrainAutoUpload] Sync error:', err);
      return { success: false, count: successCount };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const secondBrainAutoUploadService = new SecondBrainAutoUploadService();
