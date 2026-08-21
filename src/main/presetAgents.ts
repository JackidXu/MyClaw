import type { CreateAgentRequest } from './coworkStore';
import { getLanguage } from './i18n';

export interface PresetAgent {
  id: string;
  name: string;
  nameEn: string;
  avatar?: string;
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
}



// 坚决无兜底数据，所有预设专家一律从云端 GET API 动态获取
export const PRESET_AGENTS: PresetAgent[] = [];

export function presetToCreateRequest(preset: PresetAgent & { subagentAllowAgentIds?: string[] }): CreateAgentRequest {
  const isEn = getLanguage() === 'en';
  return {
    id: preset.id,
    name: isEn && preset.nameEn ? preset.nameEn : preset.name,
    description: isEn && preset.descriptionEn ? preset.descriptionEn : preset.description,
    identity: isEn && preset.identityEn ? preset.identityEn : preset.identity,
    systemPrompt: isEn && preset.systemPromptEn ? preset.systemPromptEn : preset.systemPrompt,
    avatar: preset.avatar || '',
    skillIds: preset.skillIds,
    subagentAllowAgentIds: preset.subagentAllowAgentIds || [],
    level: preset.level,
    department: preset.department,
    source: 'preset',
    presetId: preset.id,
    model: preset.model || '',
  };
}
