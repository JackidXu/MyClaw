import { store } from '../store';
import { agentService } from './agent';
import { coworkService } from './cowork';
import { getServerApiBaseUrl } from './endpoints';
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
  reason?: 'session_expired' | 'device_limit' | 'user_mismatch' | string;
  loading: boolean;
  lastUpdated: number;
}

type VipChangeListener = (state: VipStatusState) => void;

class VipService {
  private state: VipStatusState = {
    authorized: false,
    subscriptions: [],
    loading: false,
    lastUpdated: 0,
  };

  private listeners: Set<VipChangeListener> = new Set();

  public getState(): VipStatusState {
    return this.state;
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

  public async refreshStatus(): Promise<VipStatusState> {
    const userIdStr = localStorage.getItem('heyclaw_user_id');
    const session = localStorage.getItem('heyclaw_session');

    if (!userIdStr || !session) {
      this.state = {
        authorized: false,
        subscriptions: [],
        loading: false,
        lastUpdated: Date.now(),
      };
      this.notify();
      return this.state;
    }

    const userId = parseInt(userIdStr, 10);
    if (isNaN(userId)) {
      this.state = {
        authorized: false,
        subscriptions: [],
        loading: false,
        lastUpdated: Date.now(),
      };
      this.notify();
      return this.state;
    }

    this.state.loading = true;
    this.notify();

    try {
      // 获取设备指纹
      const deviceInfo = await window.electron.getDeviceInfo();

      // 获取 admin-claw 统一服务地址
      const adminBaseUrl = getServerApiBaseUrl();

      const res = (await window.electron.api.fetch({
        url: `${adminBaseUrl}/api/vip/status`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          deviceId: deviceInfo.deviceId,
          platform: deviceInfo.platform,
          hostname: deviceInfo.hostname,
          session,
        }),
      })) as any;

      if (res.ok && res.data) {
        const data = res.data;
        if (data.authorized) {
          this.state = {
            authorized: true,
            subscriptions: data.subscriptions || [],
            loading: false,
            lastUpdated: Date.now(),
          };
        } else {
          this.state = {
            authorized: false,
            subscriptions: [],
            reason: data.reason,
            loading: false,
            lastUpdated: Date.now(),
          };

          if (data.reason === 'device_limit') {
            console.warn('[VipService] 设备注册数量已达上限 (5台)');
          } else if (data.reason === 'session_expired') {
            console.warn('[VipService] 用户 Session 已失效');
          }
        }
      } else {
        this.state = {
          ...this.state,
          loading: false,
          lastUpdated: Date.now(),
        };
      }
    } catch (err) {
      console.error('[VipService] Failed to refresh VIP status:', err);
      this.state = {
        ...this.state,
        loading: false,
        lastUpdated: Date.now(),
      };
    }

    // 自动清洗与收回已被撤销权限的付费专家
    await this.syncRevokedAgents();

    this.notify();
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
