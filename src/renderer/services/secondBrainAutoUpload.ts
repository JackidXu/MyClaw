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
  private inFlightFilePaths = new Set<string>();

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

  /** 更新配置（由主进程 setConfig 单一事件源触发后续同步，此处不自调用以防并发穿透） */
  async setConfig(
    config: Partial<SecondBrainAutoUploadConfig>,
  ): Promise<{
    config: SecondBrainAutoUploadConfig;
    status: SecondBrainAutoUploadStatus;
  } | null> {
    const res = await window.electron.secondBrainAutoUpload?.setConfig?.(config);
    if (res?.success && res.config && res.status) {
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
    // 1. 入口同步第一行立即原子上锁，彻底杜绝异步 IPC 挂起期间的毫秒级并发穿透
    if (this.isSyncing) {
      console.log('[SecondBrainAutoUpload] Sync already running, skipping');
      return { success: true, count: 0 };
    }
    this.isSyncing = true;

    let successCount = 0;

    try {
      const configRes = await this.getConfigAndStatus();
      if (!configRes?.config.watchDir) {
        return { success: true, count: 0 };
      }

      // 2. 扫描目录待同步文件（主进程已完成两级防重过滤）
      const scanRes = await window.electron.secondBrainAutoUpload?.scanPendingFiles?.();
      if (!scanRes?.success || !scanRes.items) {
        console.warn('[SecondBrainAutoUpload] Failed to scan pending files:', scanRes?.error);
        return { success: false, count: 0 };
      }

      const pendingItems = scanRes.items.filter(
        (item) => !this.inFlightFilePaths.has(item.filePath),
      );
      if (pendingItems.length === 0) {
        return { success: true, count: 0 };
      }

      // 3. 配额控制：单轮最多真实上传 10 份新文档（秒传命中不占名额）
      let realUploadedCount = 0;
      const MAX_REAL_UPLOADS = SECOND_BRAIN_MAX_BATCH_COUNT;

      for (const item of pendingItems) {
        if (realUploadedCount >= MAX_REAL_UPLOADS) {
          break;
        }

        if (this.inFlightFilePaths.has(item.filePath)) {
          continue;
        }
        this.inFlightFilePaths.add(item.filePath);

        try {
          // 4. 读取本地文件二进制内容
          const readRes = await window.electron.secondBrainAutoUpload?.readLocalFile?.(item.filePath);
          if (!readRes?.success || !readRes.data) {
            throw new Error(readRes?.error || '无法读取文件内容');
          }

          // 5. 复用统一上传方法（开启静默模式，携带真实 fileHash 查重）
          const uploadRes = await uploadAndCreateDocument({
            name: item.fileName,
            content: readRes.data,
            fileHash: item.fileHash,
            silentDuplicate: true,
          });

          // 6. 标记防重成功入 SQLite（写入真实计算的文件内容哈希）
          const markRes = await window.electron.secondBrainAutoUpload?.markFileSynced?.({
            filePath: item.filePath,
            mtimeMs: item.mtimeMs,
            fileHash: item.fileHash,
          });
          if (!markRes?.success) {
            console.error(`[SecondBrainAutoUpload] 标记文件 "${item.fileName}" 已同步失败:`, markRes?.error);
          }

          if (uploadRes.alreadyExists) {
            // 云端秒传命中：已打上本地已同步标记，不占用真实上传名额（不累加计数），继续处理下一个文件
            continue;
          }

          // 真正消耗带宽与计算资源的真实上传
          realUploadedCount++;
          successCount++;
        } catch (err: any) {
          // 自动同步异常：静默处理不打扰用户，记录失败状态入 SQLite（降权沉底排到队尾，彻底杜绝队头阻塞）
          console.warn(`[SecondBrainAutoUpload] 上传 "${item.fileName}" 失败:`, err);
          await window.electron.secondBrainAutoUpload?.markFileFailed?.({
            filePath: item.filePath,
            mtimeMs: item.mtimeMs,
            fileHash: item.fileHash,
            errorMsg: err instanceof Error ? err.message : String(err || '上传失败'),
          });
        } finally {
          this.inFlightFilePaths.delete(item.filePath);
        }
      }

      // 7. 若有成功上传的文档，派发事件让第二大脑视图自动刷新列表与统计
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
