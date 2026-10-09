import { configService } from './config';
import { httpClient } from './httpClient';

export interface OneApiRawModel {
  id: string;
  owned_by?: string;
  [key: string]: unknown;
}

export interface OneApiChatModel {
  id: string;
  name: string;
  supportsImage: boolean;
  modelId?: string;
  modelName?: string;
  provider?: string;
  providerKey?: string;
  supportsVideo?: boolean;
  supportsThinking?: boolean;
  supportsToolCalling?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  description?: string;
  isRecommended?: boolean;
  isDefault?: boolean;
  [key: string]: unknown;
}

/**
 * 判断模型是否属于生图模型 (历史辅助方法保留，防止调用方破坏)
 */
export function isOneApiImageModel(modelId: string): boolean {
  return /dall-e|stable-diffusion|\bsdxl\b|midjourney|\bmj-v\d+|controlnet|\bflux\b|seedream/i.test(modelId);
}

/**
 * 判断模型是否属于视频生成模型 (历史辅助方法保留，防止调用方破坏)
 */
export function isOneApiVideoModel(modelId: string): boolean {
  const hasVideoKeyword = /cogvideo|seedance|sora|kling|\bluma\b|runway|video-gen/i.test(modelId);
  const isVideoUnderstanding = /chat|understand|vision|vl|multimodal/i.test(modelId);
  return hasVideoKeyword && !isVideoUnderstanding;
}

/**
 * 解析并过滤 OneAPI 返回的模型列表 (保留兼容)
 */
export function parseOneApiChatModels(rawModels: OneApiRawModel[]): OneApiChatModel[] {
  if (!Array.isArray(rawModels)) {
    return [];
  }

  const chatModels: OneApiChatModel[] = [];

  for (const m of rawModels) {
    if (!m || typeof m.id !== 'string') {
      continue;
    }

    if (m.owned_by === 'custom') {
      continue;
    }

    const modelId = m.id;
    if (!isOneApiImageModel(modelId) && !isOneApiVideoModel(modelId)) {
      chatModels.push({
        id: modelId,
        modelId: modelId,
        name: modelId,
        modelName: modelId,
        provider: '火山方舟',
        providerKey: 'oneapi',
        supportsImage: true,
      });
    }
  }

  return chatModels;
}

export interface FetchOneApiChatModelsResult {
  success: boolean;
  chatModels: OneApiChatModel[];
  defaultChatModel: string;
  fromCache?: boolean;
  error?: string;
}

/**
 * 从本地数据库应用配置中提取上一次持久化的模型缓存 (唯一降级介质)
 */
export function getCachedModelsFromConfig(): {
  chatModels: OneApiChatModel[];
  defaultChatModel: string;
} {
  const config = configService.getConfig();
  const availableModels = (config.model?.availableModels || []) as OneApiChatModel[];
  const providerModels = (config.providers?.['oneapi']?.models || []) as OneApiChatModel[];
  const chatModels = availableModels.length > 0 ? availableModels : providerModels;
  const defaultChatModel = config.model?.defaultModel || chatModels.find(m => m.isRecommended)?.id || '';
  return { chatModels, defaultChatModel };
}

/**
 * 统一获取可用的对话大模型列表：
 * 1. 优先调用 Node 后端 /api/client/models (聚合 NewAPI 并注入富业务元数据)
 * 2. 若接口请求失败、断网或后端维护，平滑降级读取本地数据库缓存 (configService)，保证离线高可用
 */
export async function fetchAndFilterOneApiChatModels(
  _baseUrl?: string,
  apiKey?: string
): Promise<FetchOneApiChatModelsResult> {
  const formattedKey = apiKey ? (apiKey.startsWith('sk-') ? apiKey : `sk-${apiKey}`) : '';

  try {
    const headers: Record<string, string> = {};
    if (formattedKey) {
      headers['x-api-key'] = formattedKey;
    }

    const resp = await httpClient.admin.get<{
      code?: number;
      success?: boolean;
      data?: any;
      defaultModel?: string;
    }>('/api/client/models', headers);

    if (resp.ok && resp.data) {
      const resBody = resp.data;
      const rawList = Array.isArray(resBody.data)
        ? resBody.data
        : (Array.isArray(resBody) ? resBody : []);

      if (rawList.length > 0) {
        const chatModels: OneApiChatModel[] = rawList.map((m: any) => {
          const modelId = m.id || m.modelId || '';
          const modelName = m.name || m.modelName || modelId;
          return {
            id: modelId,
            modelId: modelId,
            name: modelName,
            modelName: modelName,
            provider: m.provider || '火山方舟',
            providerKey: m.providerKey || 'oneapi',
            supportsImage: typeof m.supportsImage === 'boolean' ? m.supportsImage : true,
            supportsVideo: Boolean(m.supportsVideo),
            supportsThinking: Boolean(m.supportsThinking),
            supportsToolCalling: m.supportsToolCalling !== false,
            contextWindow: typeof m.contextWindow === 'number' ? m.contextWindow : 256000,
            maxTokens: typeof m.maxTokens === 'number' ? m.maxTokens : 8192,
            description: m.description || '',
            isRecommended: Boolean(m.isRecommended),
            isDefault: Boolean(m.isDefault),
          };
        });

        const defaultChatModel = resBody.defaultModel || chatModels.find(m => m.isRecommended)?.id || '';
        return {
          success: true,
          chatModels,
          defaultChatModel,
          fromCache: false,
        };
      }
    }

    // 接口请求非成功或返回空数组，平滑回退读取本地数据库缓存
    console.warn('[oneapiModels] Node 端模型接口响应异常，尝试读取本地数据库缓存:', resp.error);
    const cached = getCachedModelsFromConfig();
    if (cached.chatModels.length > 0) {
      return {
        success: true,
        chatModels: cached.chatModels,
        defaultChatModel: cached.defaultChatModel,
        fromCache: true,
      };
    }

    return {
      success: false,
      chatModels: [],
      defaultChatModel: '',
      error: resp.error || '获取模型列表失败，且本地无有效缓存',
    };
  } catch (err: any) {
    console.warn('[oneapiModels] 请求 Node 端模型接口异常，平滑降级读取本地数据库缓存:', err);
    const cached = getCachedModelsFromConfig();
    if (cached.chatModels.length > 0) {
      return {
        success: true,
        chatModels: cached.chatModels,
        defaultChatModel: cached.defaultChatModel,
        fromCache: true,
      };
    }

    return {
      success: false,
      chatModels: [],
      defaultChatModel: '',
      error: err?.message || '网络连接异常，且本地无模型缓存',
    };
  }
}
