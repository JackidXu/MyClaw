export interface ExpertTeamMember {
  name: string;
  role: string;
  lead?: boolean;
  avatar?: string;
}

// 专家团数据类型（与 main 进程 expertStore.ts 中的 ExpertTeam 接口对齐）
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
  coverTag?: string;
  coverTitle?: string;
  coverSubtitle?: string;
  coverGradient?: string;
  author?: string;
  usesCount?: string;
  tags?: string[];
  helps?: string[];
  members?: ExpertTeamMember[];
}
