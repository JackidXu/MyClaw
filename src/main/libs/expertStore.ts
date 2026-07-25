import { PresetAgent } from '../presetAgents';
import { getServerApiBaseUrl } from './endpoints';

// 付费专家数据结构（不含 department、level 字段）
export interface PaidExpert {
  id: string;
  name: string;
  nameEn?: string;
  avatar?: string;
  department?: string;
  description: string;
  descriptionEn?: string;
  systemPrompt: string;
  systemPromptEn?: string;
  skillIds: string[];
  sortOrder?: number;
  enabled: boolean;
  model?: string;
}

// 内存缓存（单次运行期内有效）
let cachedPresetExperts: PresetAgent[] | null = null;
let cachedPaidExperts: PaidExpert[] | null = null;

/**
 * 从云端拉取专家数据（无磁盘缓存，失败时返回空数组）
 */
export async function fetchExpertsFromCloud(): Promise<{
  presetExperts: PresetAgent[];
  paidExperts: PaidExpert[];
}> {
  try {
    const url = `${getServerApiBaseUrl()}/api/experts`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      console.error(`[ExpertStore] HTTP ${res.status} fetching experts`);
      return { presetExperts: [], paidExperts: [] };
    }
    const data = await res.json() as { success: boolean; presetExperts?: PresetAgent[]; paidExperts?: PaidExpert[] };
    if (!data.success) {
      console.error('[ExpertStore] Server returned success=false');
      return { presetExperts: [], paidExperts: [] };
    }
    cachedPresetExperts = data.presetExperts || [];
    cachedPaidExperts = data.paidExperts || [];
    console.log(`[ExpertStore] Loaded ${cachedPresetExperts.length} preset experts, ${cachedPaidExperts.length} paid experts`);
    return { presetExperts: cachedPresetExperts, paidExperts: cachedPaidExperts };
  } catch (err) {
    console.error('[ExpertStore] Failed to fetch experts:', err);
    return { presetExperts: [], paidExperts: [] };
  }
}

/**
 * 返回内置专家列表（使用内存缓存，若未初始化返回空数组）
 */
export function getPresetExperts(): PresetAgent[] {
  return cachedPresetExperts || [];
}

/**
 * 返回付费专家列表（使用内存缓存，若未初始化返回空数组）
 */
export function getPaidExperts(): PaidExpert[] {
  return cachedPaidExperts || [];
}

/**
 * 判断某个 agentId 是否为付费专家（基于运行时缓存数据）
 */
export function isPaidExpertId(agentId: string): boolean {
  if (!cachedPaidExperts) return false;
  return cachedPaidExperts.some(e => e.id === agentId);
}
