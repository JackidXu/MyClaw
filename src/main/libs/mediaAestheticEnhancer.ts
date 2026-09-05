/**
 * 图像美学与画质增强器 (Media Aesthetic Enhancer)
 *
 * 核心目标：
 * 为 HeyClaw 生图网关提供系统级的商业美学、影棚级光影及排版质感加权，
 * 解决大模型（如 Doubao-Seedream-5.0-lite 或轻量模型）在单凭大白话 Prompt 生成时，
 * 容易生成廉价草稿本底色、大红高饱和促销传单感、低对比度、无景深等工业瑕疵问题。
 */

export interface EnhanceImagePromptOptions {
  model?: string;
}

/**
 * 商业摄影影棚级光影与质感正向补充词
 */
const COMMERCIAL_AESTHETIC_SUFFIXES = [
  'professional commercial product photography',
  'cinematic studio lighting with subtle rim light highlighting contours',
  'refined depth of field with gentle background bokeh',
  'high physical material texture (brushed metal, polished ceramics, natural wood grain)',
  'strict layout safe margins: leave at least 10% empty margin at canvas bottom and top edges, all bottom subtitles and captions must float well above the bottom border with generous breathing room, no text cut off or touching borders',
  '8k resolution, clean composition, minimalist elegant commercial poster aesthetic',
];

/**
 * 底层负向/排斥约束（全面压制大红促销单感、作业本、方格纸、文字贴底截断与粗暴廉价设计）
 */
const NEGATIVE_AVOID_INSTRUCTIONS =
  'avoid cheap supermarket sale flyer aesthetic, harsh saturated plain red, ugly 3D checkmark, crude slide-chart bullet points, draft paper background, ugly layout, overly saturated plain primary colors, harsh red text on plain white, amateur snapshot, distorted proportions, text cut off at bottom, text touching canvas border, cropped text, clipped subtitle, text out of frame';

/**
 * 对实体商业产品的背景置景净化：
 * 仅负责过滤草稿纸、方格本等做图教程类背景瑕疵，替换为通用的商业置景台面；
 * 坚决遵循 2.16 准则：严禁写死具体的厨房/原木等特定品类场景，严禁篡改用户指定的色彩与标题。
 */
const cleanDraftPaperBackground = (prompt: string): string => {
  // 检查是否包含草稿纸/做图网格本等低质背景词汇
  const hasDraftPaper = /(?:浅灰方格笔记本纸|方格纸|笔记本纸|格纹草稿纸|grid paper|notebook paper|lined paper|graph paper)/i.test(prompt);
  if (!hasDraftPaper) {
    return prompt;
  }

  // 通用商业置景描述，自适应任何数码、美妆、家电、文创等实体品类，绝不越界硬写“厨房”
  return prompt.replace(
    /(?:浅灰方格笔记本纸|方格纸|笔记本纸|格纹草稿纸|grid paper|notebook paper|lined paper|graph paper)/gi,
    '高级极简商业产品置景台面与真实生活质感背景 (refined minimalist commercial product staging tabletop with authentic lifestyle background)',
  );
};

/**
 * 增强生图 Prompt
 * @param prompt 原始 Prompt
 * @param options 配置项
 * @returns 增强后的 Prompt
 */
export const enhanceImagePrompt = (prompt: string, _options?: EnhanceImagePromptOptions): string => {
  if (!prompt || typeof prompt !== 'string') {
    return prompt;
  }

  let cleanedPrompt = prompt.trim();
  cleanedPrompt = cleanDraftPaperBackground(cleanedPrompt);

  const lower = cleanedPrompt.toLowerCase();

  // 检查是否已经具备充足的商业摄影词汇
  const hasLighting = lower.includes('studio light') || lower.includes('cinematic light') || lower.includes('soft lighting');
  const hasQuality = lower.includes('8k') || lower.includes('commercial photography') || lower.includes('masterpiece');

  const additions: string[] = [];

  if (!hasLighting || !hasQuality) {
    additions.push(COMMERCIAL_AESTHETIC_SUFFIXES.join(', '));
  }

  // 始终附加排斥廉价促销感约束
  if (!lower.includes('avoid cheap supermarket')) {
    additions.push(`[Negative constraints: ${NEGATIVE_AVOID_INSTRUCTIONS}]`);
  }

  if (additions.length === 0) {
    return cleanedPrompt;
  }

  return `${cleanedPrompt}, ${additions.join(', ')}`;
};
