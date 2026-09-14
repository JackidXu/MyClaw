import { BrowserWindow, ipcMain } from 'electron';

import { VipIpcChannel } from '../../shared/vip/constants';
import { getDeviceInfo } from '../libs/deviceId';
import { mainHttpClient } from '../libs/mainHttpClient';

export interface MainVipSubscription {
  expertId: string;
  expiredAt: string;
  isActive: boolean;
  revokedAt?: string;
}

export interface MainVipStatus {
  authorized: boolean;
  subscriptions: MainVipSubscription[];
  permissions: string[];
  reason?: string;
  expiredAt?: string;
}

const DEFAULT_VIP_STATUS: MainVipStatus = {
  authorized: false,
  subscriptions: [],
  permissions: [],
};

type VipStatusChangeListener = (status: MainVipStatus) => void;

class MainVipService {
  private status: MainVipStatus = { ...DEFAULT_VIP_STATUS };
  private listeners: Set<VipStatusChangeListener> = new Set();

  /**
   * 应用启动时由主进程初始化 VIP 状态（全局权威单源）
   */
  async initVipStatus(): Promise<MainVipStatus> {
    return this.refreshVipStatus();
  }

  /**
   * 主动从服务端拉取最新 VIP 状态并更新主进程内存单源
   */
  async refreshVipStatus(): Promise<MainVipStatus> {
    try {
      const deviceInfo = getDeviceInfo();
      const res = await mainHttpClient.admin.post<{
        authorized?: boolean;
        reason?: string;
        expiredAt?: string;
        subscriptions?: MainVipStatus['subscriptions'];
        permissions?: string[];
      }>('/api/vip/status', {
        deviceId: deviceInfo.deviceId,
        platform: deviceInfo.platform,
        hostname: deviceInfo.hostname,
      });

      if (res.ok && res.data) {
        const data = res.data;
        this.status = {
          authorized: Boolean(data.authorized),
          subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          reason: data.reason,
          expiredAt: data.expiredAt,
        };
      } else {
        this.status = {
          ...DEFAULT_VIP_STATUS,
          reason: res.data?.reason,
        };
      }
    } catch (error) {
      console.warn('[MainVipService] refreshVipStatus failed:', error);
      this.status = { ...DEFAULT_VIP_STATUS };
    }

    console.log(
      `[MainVipService] VIP status refreshed: authorized=${this.status.authorized}, permissions=[${this.status.permissions.join(', ')}]`,
    );

    this.notifyListeners();
    this.broadcastStatus();

    return this.status;
  }

  /**
   * 重置 VIP 状态（登出或凭证失效时复位）
   */
  resetVipStatus(): void {
    this.status = { ...DEFAULT_VIP_STATUS };
    console.log('[MainVipService] VIP status reset to default (unauthorized)');
    this.notifyListeners();
    this.broadcastStatus();
  }

  /** 订阅主进程内部 VIP 状态变更事件 */
  onStatusChange(listener: VipStatusChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.status);
      } catch (err) {
        console.error('[MainVipService] Error in status change listener:', err);
      }
    }
  }

  /** 向所有渲染进程窗口广播最新的权威 VIP 状态 */
  private broadcastStatus(): void {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send(VipIpcChannel.StatusChanged, this.status);
        }
      }
    } catch (err) {
      console.warn('[MainVipService] Failed to broadcast VIP status to windows:', err);
    }
  }

  /** 获取当前权威状态 */
  getVipStatus(): MainVipStatus {
    return this.status;
  }

  /** 判断是否包含指定权限 */
  hasPermission(perm: string): boolean {
    return this.status.authorized && this.status.permissions.includes(perm);
  }

  /** 判断是否包含第二大脑权限 */
  hasSecondBrainPermission(): boolean {
    return this.hasPermission('secondBrain');
  }

  /** 注册供渲染进程调用的 IPC 通道 */
  registerIpc(): void {
    ipcMain.handle(VipIpcChannel.GetStatus, () => {
      return this.getVipStatus();
    });

    ipcMain.handle(VipIpcChannel.RefreshStatus, async () => {
      return this.refreshVipStatus();
    });
  }
}

export const mainVipService = new MainVipService();

