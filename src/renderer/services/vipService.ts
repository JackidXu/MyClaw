import { store } from '../store';
import { agentService } from './agent';
import { coworkService } from './cowork';
import { expertService } from './expertService';

export interface VipSubscription {
  expertId: string;
  expiredAt: string;
  isActive: boolean;
  revokedAt?: string;
}

export interface VipStatusState {
  authorized: boolean;
  subscriptions: VipSubscription[];
  permissions: string[];
  reason?: 'session_expired' | 'device_limit' | 'user_mismatch' | 'account_expired' | string;
  expiredAt?: string;
  loading: boolean;
  lastUpdated: number;
}

type VipChangeListener = (state: VipStatusState) => void;

class VipService {
  private state: VipStatusState = {
    authorized: false,
    subscriptions: [],
    permissions: [],
    loading: false,
    lastUpdated: 0,
  };

  private listeners: Set<VipChangeListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && window.electron?.vip?.onStatusChanged) {
      window.electron.vip.onStatusChanged((data) => {
        console.log('[VipService] Received VIP status broadcast from main process:', data);
        this.applyStatusData(data);
      });
    }
  }

  public getState(): VipStatusState {
    return this.state;
  }

  public isAccountExpired(): boolean {
    return !this.state.authorized && this.state.reason === 'account_expired';
  }

  public getAccountExpiredAt(): string | undefined {
    return this.state.expiredAt;
  }

  public subscribe(listener: VipChangeListener): () => void {
    this.listeners.add(listener);
    // 立即触发一次当前状态
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[VipService] Error in listener:', err);
      }
    }
  }

  public isExpertUnlocked(expertId: string): boolean {
    if (!this.state.authorized) return false;
    return this.state.subscriptions.some(
      sub => sub.expertId === expertId && sub.isActive && !sub.revokedAt,
    );
  }

  public isSkillUnlocked(requiredExpert?: string[]): boolean {
    if (!requiredExpert || requiredExpert.length === 0) return true;
    return requiredExpert.some(expertId => this.isExpertUnlocked(expertId));
  }

  public isPermissionGranted(permissionId: string): boolean {
    if (!this.state.authorized) return false;
    return this.state.permissions.includes(permissionId);
  }

  public hasSecondBrainPermission(): boolean {
    return this.isPermissionGranted('secondBrain');
  }

  private applyStatusData(data: any): void {
    if (data && data.authorized) {
      this.state = {
        authorized: true,
        subscriptions: data.subscriptions || [],
        permissions: data.permissions || [],
        loading: false,
        lastUpdated: Date.now(),
      };
    } else {
      this.state = {
        authorized: false,
        subscriptions: [],
        permissions: [],
        reason: data?.reason,
        expiredAt: data?.expiredAt,
        loading: false,
        lastUpdated: Date.now(),
      };

      if (data?.reason === 'device_limit') {
        console.warn('[VipService] 设备注册数量已达上限 (5台)');
      } else if (data?.reason === 'account_expired') {
        console.warn(`[VipService] 账号使用权限已到期 (${data.expiredAt || ''})`);
      }
    }

    // 自动清洗与收回已被撤销权限的付费专家
    void this.syncRevokedAgents();

    this.notify();
  }

  /**
   * 应用冷启动时初始化本地 VIP 状态（纯只读读取主进程权威缓存，绝不发网络请求）
   */
  public async initStatus(): Promise<VipStatusState> {
    const session = localStorage.getItem('heyclaw_session');
    if (!session) {
      this.state = {
        authorized: false,
        subscriptions: [],
        permissions: [],
        loading: false,
        lastUpdated: Date.now(),
      };
      this.notify();
      return this.state;
    }

    try {
      const data = await window.electron.vip.getStatus();
      this.applyStatusData(data);
    } catch (err) {
      console.warn('[VipService] Failed to get VIP status from main process on startup:', err);
    }

    return this.state;
  }

  public async refreshStatus(): Promise<VipStatusState> {
    const session = localStorage.getItem('heyclaw_session');

    if (!session) {
      this.state = {
        authorized: false,
        subscriptions: [],
        permissions: [],
        loading: false,
        lastUpdated: Date.now(),
      };
      this.notify();
      return this.state;
    }

    this.state.loading = true;
    this.notify();

    try {
      const data = window.electron.vip.refreshStatus
        ? await window.electron.vip.refreshStatus()
        : await window.electron.vip.getStatus();
      this.applyStatusData(data);
    } catch (err) {
      console.error('[VipService] Failed to refresh VIP status from main process:', err);
      this.state = {
        ...this.state,
        loading: false,
        lastUpdated: Date.now(),
      };
      this.notify();
    }

    return this.state;
  }

  private async syncRevokedAgents(): Promise<void> {
    try {
      const agents = await window.electron.agents.list();

      for (const expert of expertService.getPaidExperts()) {
        const expertId = expert.id;
        if (!this.isExpertUnlocked(expertId)) {
          const installed = agents.find(
            a => (a.presetId === expertId || a.id === expertId) && a.enabled,
          );

          if (installed) {
            console.log(`[VipService] Disabling revoked VIP expert: ${expertId}`);
            await agentService.updateAgent(installed.id, { enabled: false });
            await agentService.loadAgents();

            // 如果当前正停留在该撤销专家上，自动切回默认 Agent
            const currentAgentId = store.getState().agent.currentAgentId;
            if (currentAgentId === installed.id) {
              agentService.switchAgent('main');
              await coworkService.loadSessions('main');
            }
          }
        }
      }
    } catch (err) {
      console.warn('[VipService] Failed to sync revoked agents:', err);
    }
  }
}

export const vipService = new VipService();
