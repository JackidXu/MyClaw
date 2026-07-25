import type { PaidExpert } from '../types/paidExpert';

/**
 * expertService：renderer 层专家服务
 * 通过 IPC 从 main process 获取专家数据，替代 shared/agent/constants.ts 中的静态常量
 */
class ExpertService {
  private paidExperts: PaidExpert[] = [];
  private paidExpertIds: Set<string> = new Set();

  /**
   * 初始化付费专家数据（在 App 启动时调用一次）
   */
  async init(): Promise<void> {
    try {
      const experts = await window.electron.agents.getPaidExperts();
      this.paidExperts = experts || [];
      this.paidExpertIds = new Set(this.paidExperts.map(e => e.id));
    } catch (err) {
      console.error('[ExpertService] Failed to load paid experts:', err);
    }
  }

  /**
   * 获取付费专家列表
   */
  getPaidExperts(): PaidExpert[] {
    return this.paidExperts;
  }

  /**
   * 判断某个 agentId 是否为付费专家（运行时动态判断，替代 isPaidExpert 静态常量）
   */
  isPaidExpert(agentId?: string | null): boolean {
    if (!agentId) return false;
    return this.paidExpertIds.has(agentId);
  }
}

export const expertService = new ExpertService();
