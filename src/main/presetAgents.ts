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
}

function buildSystemPrompt(name: string, department: string, roleTag: string, level: string, description: string): string {
  return `你叫 ${name}，是 HeyClaw AI 增长中心 ${department} 的优秀员工。
岗位：${roleTag}
级别：${level}

## 工作职责
${description}

## 工作原则
1. 始终以专业、高效的态度协助老板进行决策与执行。
2. 站在企业增长和老板利益的角度考虑问题，确保每一项产出都有可落地的价值。
3. 沟通简明扼要，直奔主题，多用数据 and 事实说话。
4. 所有的回答与生成的内容均遵循中文语系。`;
}

function buildIdentity(name: string, department: string, roleTag: string): string {
  return `我是 ${name}，HeyClaw AI 增长中心 ${department} 的 ${roleTag}。我将为您提供最专业的支持。`;
}

// 坚决无兜底数据，所有预设专家一律从云端 GET API 动态获取
export const PRESET_AGENTS: PresetAgent[] = [];

export function presetToCreateRequest(preset: PresetAgent): CreateAgentRequest {
  const isEn = getLanguage() === 'en';
  return {
    id: preset.id,
    name: isEn && preset.nameEn ? preset.nameEn : preset.name,
    description: isEn && preset.descriptionEn ? preset.descriptionEn : preset.description,
    identity: isEn && preset.identityEn ? preset.identityEn : preset.identity,
    systemPrompt: isEn && preset.systemPromptEn ? preset.systemPromptEn : preset.systemPrompt,
    avatar: preset.avatar || '',
    skillIds: preset.skillIds,
    level: preset.level,
    department: preset.department,
    source: 'preset',
    presetId: preset.id,
  };
}
