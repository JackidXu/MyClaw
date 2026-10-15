import { resolveAllEnabledProviderConfigs } from './claudeSettings';
import { buildProviderSelection } from './openclawConfigSync';

export type PromptComplexity = 'complex' | 'simple';

export interface AutoRoutingCandidate {
  ref: string;
  modelId: string;
  supportsThinking: boolean;
  supportsImage: boolean;
  isRecommended?: boolean;
  isStrong?: boolean;
  contextWindow?: number;
}

// 复杂任务关键词
const COMPLEX_KEYWORDS = [
  // 编程与代码
  '代码', '函数', '实现', '写一个', '写出', '编程', '编写', '程序', '脚本', '算法',
  '报错', '错误', '异常', '调试', '修复', 'bug', 'error', 'fix', 'debug',
  'code', 'function', 'implement', 'class', 'typescript', 'javascript', 'python',
  // 复杂推理
  '推导', '证明', '分析', '设计', '架构', '方案', '优化', '重构',
  '计划', '规划', '总结', '归纳', '对比', '比较',
  'analyze', 'design', 'architecture', 'optimize', 'refactor',
  'plan', 'summarize', 'compare', 'explain',
  // 长文本处理
  '翻译', '总结以下', '整理以下', 'translate',
];

/**
 * 评估 Prompt 的任务复杂度（本地启发式，零网络延迟）。
 * 返回 'complex' 表示需要高性能/推理模型，'simple' 表示轻量模型即可。
 */
export function evaluatePromptComplexity(
  prompt: string,
  imageAttachments?: Array<unknown>,
  mediaReferences?: Array<unknown>,
): PromptComplexity {
  // 有图片或媒体附件，通常是多模态任务，使用高性能视觉模型
  const hasImageIndication =
    (imageAttachments && imageAttachments.length > 0) ||
    (mediaReferences && mediaReferences.length > 0) ||
    (prompt.includes('[附件信息]') && prompt.includes('类型: image')) ||
    /!\[.*?\]\((?:file:\/\/\/|\/|~|[A-Za-z]:).*?\.(?:png|jpe?g|webp|gif|bmp)\)/i.test(prompt);

  if (hasImageIndication) {
    return 'complex';
  }

  // Prompt 较长，往往是复杂上下文或长文本处理
  if (prompt.length > 400) {
    return 'complex';
  }

  // 包含复杂任务关键词（编程、推理、分析、调试等）
  const lowerPrompt = prompt.toLowerCase();
  if (COMPLEX_KEYWORDS.some(kw => lowerPrompt.includes(kw.toLowerCase()))) {
    return 'complex';
  }

  return 'simple';
}

/**
 * 获取当前所有已启用 Provider 中的物理模型候选列表
 */
export function getAvailableModelCandidates(): AutoRoutingCandidate[] {
  const candidates: AutoRoutingCandidate[] = [];

  try {
    const enabledProviders = resolveAllEnabledProviderConfigs();
    for (const provider of enabledProviders) {
      for (const model of provider.models) {
        const mid = model.id?.trim();
        if (!mid) continue;

        const sel = buildProviderSelection({
          apiKey: provider.apiKey,
          baseURL: provider.baseURL,
          modelId: mid,
          apiType: provider.apiType,
          providerName: provider.providerName,
          authType: provider.authType,
          codingPlanEnabled: provider.codingPlanEnabled,
          supportsImage: model.supportsImage,
          supportsThinking: model.supportsThinking,
          modelName: model.name,
          contextWindow: model.contextWindow,
        });

        candidates.push({
          ref: sel.primaryModel,
          modelId: sel.sessionModelId.toLowerCase(),
          supportsThinking: model.supportsThinking === true,
          supportsImage: model.supportsImage === true,
          isRecommended: (model as any).isRecommended === true,
          isStrong: (model as any).isStrong === true,
          contextWindow: typeof model.contextWindow === 'number' && model.contextWindow > 0
            ? model.contextWindow
            : undefined,
        });
      }
    }
  } catch (err) {
    console.warn('[AutoModelRouting] Failed to load enabled providers:', err);
  }

  return candidates;
}

/**
 * 动态计算当前可用候选模型池中的最大上下文容量。
 * 若没有候选物理模型或异常情况，安全保底为 200,000。
 */
export function resolveMaxCandidateContextWindow(): number {
  const candidates = getAvailableModelCandidates();
  let maxTokens = 200_000;
  for (const c of candidates) {
    if (typeof c.contextWindow === 'number' && c.contextWindow > maxTokens) {
      maxTokens = c.contextWindow;
    }
  }
  return maxTokens;
}

/**
 * 核心智能路由策略：根据 Prompt 复杂度与识图需求选择最合适的物理模型 ref（provider/modelId）
 */
export function selectPhysicalModelForAutoRouting(options: {
  prompt: string;
  imageAttachments?: Array<unknown>;
  mediaReferences?: Array<unknown>;
  hasImages?: boolean;
}): string | null {
  const candidates = getAvailableModelCandidates();
  if (candidates.length === 0) return null;

  const isMultimodalTask =
    options.hasImages === true ||
    (options.imageAttachments && options.imageAttachments.length > 0) ||
    (options.mediaReferences && options.mediaReferences.length > 0) ||
    (options.prompt.includes('[附件信息]') && options.prompt.includes('类型: image')) ||
    /!\[.*?\]\((?:file:\/\/\/|\/|~|[A-Za-z]:).*?\.(?:png|jpe?g|webp|gif|bmp)\)/i.test(options.prompt);

  let filteredCandidates = candidates;
  if (isMultimodalTask) {
    const validMultimodal = candidates.filter(c => c.supportsImage);
    if (validMultimodal.length > 0) {
      filteredCandidates = validMultimodal;
    }
  }

  const complexity = evaluatePromptComplexity(
    options.prompt,
    options.imageAttachments,
    options.mediaReferences,
  );

  const strongModels = filteredCandidates.filter(c => c.isStrong);
  const recommendedModels = filteredCandidates.filter(c => c.isRecommended);

  let selected: AutoRoutingCandidate | undefined;
  if (complexity === 'complex') {
    // 复杂任务：强模型 > 服务端推荐模型 > 候选列表第一个
    selected = strongModels[0] ?? recommendedModels[0] ?? filteredCandidates[0];
  } else {
    // 简单任务：服务端推荐模型 > 候选列表第一个
    selected = recommendedModels[0] ?? filteredCandidates[0];
  }

  return selected?.ref ?? null;
}
