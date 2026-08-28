import { PresetAgent } from '../presetAgents';
import { mainHttpClient } from './mainHttpClient';

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

// 专家团数据结构（与 PresetAgent 兼容，额外携带 subagentAllowAgentIds 协作列表）
export interface ExpertTeam {
  id: string;
  name: string;
  nameEn?: string;
  avatar?: string;
  description: string;
  descriptionEn?: string;
  identity?: string;
  identityEn?: string;
  systemPrompt?: string;
  systemPromptEn?: string;
  skillIds: string[];
  subagentAllowAgentIds: string[];
  department?: string;
  sortOrder?: number;
  enabled: boolean;
  model?: string;
}

// 内存缓存（单次运行期内有效）
let cachedPresetExperts: PresetAgent[] | null = null;
let cachedPaidExperts: PaidExpert[] | null = null;
let cachedExpertTeams: ExpertTeam[] | null = null;

/**
 * 从云端拉取专家数据（无磁盘缓存，失败时返回空数组）
 */
export async function fetchExpertsFromCloud(): Promise<{
  presetExperts: PresetAgent[];
  paidExperts: PaidExpert[];
  expertTeams: ExpertTeam[];
}> {
  try {
    const res = await mainHttpClient.admin.get<{
      success: boolean;
      presetExperts?: PresetAgent[];
      paidExperts?: PaidExpert[];
      expertTeams?: ExpertTeam[];
    }>('/api/experts');

    if (!res.ok || !res.data) {
      console.warn('[ExpertStore] fetchExpertsFromCloud failed:', res.error || `HTTP ${res.status}`);
      return { presetExperts: [], paidExperts: [], expertTeams: [] };
    }

    const data = res.data;
    if (!data.success) {
      console.error('[ExpertStore] Server returned success=false');
      return { presetExperts: [], paidExperts: [], expertTeams: [] };
    }
    cachedPresetExperts = data.presetExperts || [];
    cachedPaidExperts = data.paidExperts || [];
    cachedExpertTeams = data.expertTeams || [];
    console.log(`[ExpertStore] Loaded ${cachedPresetExperts.length} preset experts, ${cachedPaidExperts.length} paid experts, ${cachedExpertTeams.length} expert teams`);
    return { presetExperts: cachedPresetExperts, paidExperts: cachedPaidExperts, expertTeams: cachedExpertTeams };
  } catch (err) {
    console.error('[ExpertStore] Failed to fetch experts:', err);
    return { presetExperts: [], paidExperts: [], expertTeams: [] };
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
 * 返回专家团列表（使用内存缓存，若未初始化返回空数组）
 */
export function getExpertTeams(): ExpertTeam[] {
  return cachedExpertTeams || [];
}

/**
 * 判断某个 agentId 是否为付费专家（基于运行时缓存数据）
 */
export function isPaidExpertId(agentId: string): boolean {
  if (!cachedPaidExperts) return false;
  return cachedPaidExperts.some(e => e.id === agentId);
}
