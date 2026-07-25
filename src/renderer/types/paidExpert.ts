// 付费专家数据结构（renderer 层使用）
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
