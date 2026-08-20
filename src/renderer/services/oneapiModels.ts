export interface OneApiRawModel {
  id: string;
  owned_by?: string;
  [key: string]: unknown;
}

export interface OneApiChatModel {
  id: string;
  name: string;
  supportsImage: boolean;
}

/**
 * 判断模型是否属于生图模型
 */
export function isOneApiImageModel(modelId: string): boolean {
  return /dall-e|stable-diffusion|\bsdxl\b|midjourney|\bmj-v\d+|controlnet|\bflux\b|seedream/i.test(modelId);
}

/**
 * 判断模型是否属于视频生成模型
 */
export function isOneApiVideoModel(modelId: string): boolean {
  const hasVideoKeyword = /cogvideo|seedance|sora|kling|\bluma\b|runway|video-gen/i.test(modelId);
  const isVideoUnderstanding = /chat|understand|vision|vl|multimodal/i.test(modelId);
  return hasVideoKeyword && !isVideoUnderstanding;
}

/**
 * 解析并过滤 OneAPI 返回的模型列表：
 * 1. 过滤掉 owned_by === 'custom' 的自定义模型
 * 2. 过滤掉生图和视频模型，仅保留对话大模型
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

    // 过滤自定义模型（owned_by === 'custom'）
    if (m.owned_by === 'custom') {
      continue;
    }

    const modelId = m.id;
    if (!isOneApiImageModel(modelId) && !isOneApiVideoModel(modelId)) {
      chatModels.push({
        id: modelId,
        name: modelId,
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
  error?: string;
}

/**
 * 统一发起 OneAPI /models 请求并过滤得到可用的对话大模型列表
 */
export async function fetchAndFilterOneApiChatModels(
  baseUrl: string,
  apiKey: string
): Promise<FetchOneApiChatModelsResult> {
  const cleanBaseUrl = (baseUrl || 'https://token.chaohui.ai/v1').trim().replace(/\/+$/, '');
  const url = `${cleanBaseUrl}/models`;

  try {
    const resp = (await window.electron.api.fetch({
      url,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
    })) as { ok: boolean; status?: number; data?: { data?: OneApiRawModel[] } };

    if (resp?.ok && resp.data && Array.isArray(resp.data.data)) {
      const chatModels = parseOneApiChatModels(resp.data.data);
      return {
        success: true,
        chatModels,
        defaultChatModel: chatModels[0]?.id || '',
      };
    }

    return {
      success: false,
      chatModels: [],
      defaultChatModel: '',
      error: `Request failed with status ${resp?.status ?? 'unknown'}`,
    };
  } catch (err) {
    return {
      success: false,
      chatModels: [],
      defaultChatModel: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
