import { AgentSource } from '../shared/agent/constants';
import type { PresetAgent as SharedPresetAgent } from '../shared/agent/presets';
import type { CreateAgentRequest } from './coworkStore';
import { getLanguage } from './i18n';

export interface PresetAgent {
  id: string;
  name: string;
  nameEn: string;
  avatar?: string;
  icon?: string;
  description: string;
  descriptionEn: string;
  identity: string;
  identityEn: string;
  systemPrompt: string;
  systemPromptEn: string;
  skillIds: string[];
  level?: '高级' | '中级' | '初级';
  department?: string;
  model?: string;
  category?: string;
  tags?: { zh: string; en: string }[];
  starterPrompts?: { zh: string; en: string }[];
  installed?: boolean;
}

// 坚决无兜底数据，所有预设专家一律从云端动态获取
export const PRESET_AGENTS: PresetAgent[] = [];

/** Create a localized agent snapshot; future catalog updates never overwrite it. */
export function presetToCreateRequest(preset: (PresetAgent | SharedPresetAgent) & {
  avatar?: string;
  subagentAllowAgentIds?: string[];
  level?: '高级' | '中级' | '初级';
  department?: string;
  model?: string;
}): CreateAgentRequest {
  const isEn = getLanguage() === 'en';
  return {
    id: preset.id,
    name: isEn && preset.nameEn ? preset.nameEn : preset.name,
    description: isEn && preset.descriptionEn ? preset.descriptionEn : preset.description,
    identity: isEn && preset.identityEn ? preset.identityEn : preset.identity,
    systemPrompt: isEn && preset.systemPromptEn ? preset.systemPromptEn : preset.systemPrompt,
    avatar: preset.avatar || ('icon' in preset ? preset.icon : '') || '',
    skillIds: preset.skillIds,
    subagentAllowAgentIds: preset.subagentAllowAgentIds || [],
    level: preset.level,
    department: preset.department,
    source: AgentSource.Preset,
    presetId: preset.id,
    model: preset.model || '',
  };
}
