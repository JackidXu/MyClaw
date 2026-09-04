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

// 本地存储访问器引用（SQLite kv 表）
let localStoreGetter: (() => { get: <T = unknown>(key: string) => T | undefined; set: <T = unknown>(key: string, value: T) => void } | null) | null = null;

const CACHE_KV_KEY = 'cached_cloud_experts';

interface CachedExpertsData {
  presetExperts: PresetAgent[];
  paidExperts: PaidExpert[];
  expertTeams: ExpertTeam[];
}

/**
 * 注入本地存储访问器并在启动阶段预加载持久化缓存
 */
export function initExpertStoreFromLocal(
  storeGetter: () => { get: <T = unknown>(key: string) => T | undefined; set: <T = unknown>(key: string, value: T) => void } | null
): void {
  localStoreGetter = storeGetter;
  try {
    const store = storeGetter?.();
    const saved = store?.get<CachedExpertsData>(CACHE_KV_KEY);
    if (saved && typeof saved === 'object') {
      if (Array.isArray(saved.presetExperts) && saved.presetExperts.length > 0) {
        cachedPresetExperts = saved.presetExperts;
      }
      if (Array.isArray(saved.paidExperts) && saved.paidExperts.length > 0) {
        cachedPaidExperts = saved.paidExperts;
      }
      if (Array.isArray(saved.expertTeams) && saved.expertTeams.length > 0) {
        cachedExpertTeams = saved.expertTeams;
      }
      console.log(
        `[ExpertStore] Restored from local cache: ${cachedPresetExperts?.length || 0} presets, ${cachedPaidExperts?.length || 0} paid, ${cachedExpertTeams?.length || 0} teams`
      );
    }
  } catch (err) {
    console.warn('[ExpertStore] Failed to restore experts from local cache:', err);
  }
}

/**
 * 从云端拉取专家数据（成功且非空时持久化到本地，失败或为空时直接忽略不覆盖，不重试）
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
      console.warn('[ExpertStore] fetchExpertsFromCloud failed, keeping existing cache:', res.error || `HTTP ${res.status}`);
      return {
        presetExperts: cachedPresetExperts || [],
        paidExperts: cachedPaidExperts || [],
        expertTeams: cachedExpertTeams || [],
      };
    }

    const data = res.data;
    if (!data.success) {
      console.warn('[ExpertStore] Server returned success=false, keeping existing cache');
      return {
        presetExperts: cachedPresetExperts || [],
        paidExperts: cachedPaidExperts || [],
        expertTeams: cachedExpertTeams || [],
      };
    }

    const newPresets = data.presetExperts || [];
    const newPaid = data.paidExperts || [];
    const newTeams = data.expertTeams || [];

    // 若云端下发的数据完全为空，视为无效/异常响应，直接忽略不覆盖现有缓存
    if (newPresets.length === 0 && newPaid.length === 0 && newTeams.length === 0) {
      console.warn('[ExpertStore] Received empty experts data from cloud, keeping existing cache');
      return {
        presetExperts: cachedPresetExperts || [],
        paidExperts: cachedPaidExperts || [],
        expertTeams: cachedExpertTeams || [],
      };
    }

    // 请求成功且数据有效，更新内存缓存
    cachedPresetExperts = newPresets;
    cachedPaidExperts = newPaid;
    cachedExpertTeams = newTeams;

    // 持久化存储到本地 SQLite kv 表
    try {
      const store = localStoreGetter?.();
      if (store) {
        store.set(CACHE_KV_KEY, {
          presetExperts: cachedPresetExperts,
          paidExperts: cachedPaidExperts,
          expertTeams: cachedExpertTeams,
        });
      }
    } catch (saveErr) {
      console.warn('[ExpertStore] Failed to persist experts to local cache:', saveErr);
    }

    console.log(`[ExpertStore] Loaded & persisted ${cachedPresetExperts.length} preset experts, ${cachedPaidExperts.length} paid experts, ${cachedExpertTeams.length} expert teams`);
    return { presetExperts: cachedPresetExperts, paidExperts: cachedPaidExperts, expertTeams: cachedExpertTeams };
  } catch (err) {
    console.warn('[ExpertStore] Failed to fetch experts, keeping existing cache:', err);
    return {
      presetExperts: cachedPresetExperts || [],
      paidExperts: cachedPaidExperts || [],
      expertTeams: cachedExpertTeams || [],
    };
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

