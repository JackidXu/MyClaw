import { ipcMain } from 'electron';

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

class MainVipService {
  private status: MainVipStatus = { ...DEFAULT_VIP_STATUS };

  /**
   * 应用启动时由主进程初始化 VIP 状态（全局权威单源）
   */
  async initVipStatus(): Promise<MainVipStatus> {
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
        this.status = { ...DEFAULT_VIP_STATUS };
      }
    } catch (error) {
      console.warn('[MainVipService] initVipStatus failed:', error);
      this.status = { ...DEFAULT_VIP_STATUS };
    }

    console.log(
      `[MainVipService] VIP status initialized: authorized=${this.status.authorized}, permissions=[${this.status.permissions.join(', ')}]`,
    );
    return this.status;
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

  /** 注册供渲染进程只读调用的 IPC 通道 */
  registerIpc(): void {
    ipcMain.handle('vip:get-status', () => {
      return this.getVipStatus();
    });
  }
}

export const mainVipService = new MainVipService();
