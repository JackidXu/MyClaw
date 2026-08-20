import { Type } from '@sinclair/typebox';
// @ts-expect-error plugin-sdk exists natively inside the openclaw gateway sandbox
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

type DynamicToolConfig = {
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

type PluginConfig = {
  callbackUrl: string;
  secret: string;
  requestTimeoutMs: number;
  tool?: DynamicToolConfig;
};

type RetrieveRequest = {
  query: string;
  topK?: number;
  sessionKey: string;
  toolCallId: string;
};

type RetrieveResponse = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
};

const DEFAULT_TIMEOUT_MS = 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parsePluginConfig = (value: unknown): PluginConfig => {
  const raw = isRecord(value) ? value : {};
  const rawTool = isRecord(raw.tool) ? raw.tool : undefined;
  return {
    callbackUrl: typeof raw.callbackUrl === 'string' ? raw.callbackUrl.trim() : '',
    secret: typeof raw.secret === 'string' ? raw.secret.trim() : '',
    requestTimeoutMs: typeof raw.requestTimeoutMs === 'number' ? raw.requestTimeoutMs : DEFAULT_TIMEOUT_MS,
    tool: rawTool ? {
      name: typeof rawTool.name === 'string' ? rawTool.name : undefined,
      description: typeof rawTool.description === 'string' ? rawTool.description : undefined,
      parameters: isRecord(rawTool.parameters) ? rawTool.parameters : undefined,
    } : undefined,
  };
};

async function callRetrieveBridge(
  config: PluginConfig,
  request: RetrieveRequest,
): Promise<RetrieveResponse> {
  const controller = new AbortController();
  const timeoutMs = config.requestTimeoutMs || DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.callbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mcp-bridge-secret': config.secret,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Second brain retrieval HTTP ${response.status}: ${text.trim() || response.statusText}`);
    }

    if (!text.trim()) {
      return { content: [{ type: 'text', text: '（检索未返回有效内容）' }] };
    }

    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.content)) {
      return parsed as RetrieveResponse;
    }

    return {
      content: [{ type: 'text', text: typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2) }],
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { content: [{ type: 'text', text: '第二大脑检索超时，请稍后重试。' }], isError: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `第二大脑检索失败: ${message}` }], isError: true };
  } finally {
    clearTimeout(timer);
  }
}

const plugin = {
  id: 'second-brain',
  name: 'SecondBrain',
  description: 'Second Brain cognition retrieval tool powered by HeyClaw.',
  configSchema: {
    parse(value: unknown): PluginConfig {
      return parsePluginConfig(value);
    },
  },

  register(api: OpenClawPluginApi) {
    const config = parsePluginConfig(api.pluginConfig);

    if (!config.callbackUrl) {
      api.logger.info('[second-brain] skipped: callbackUrl not configured.');
      return;
    }

    api.registerTool((ctx: any) => {
      const sessionKey = ctx.sessionKey ?? '';

      // 优先使用接口动态下发的工具描述与参数定义
      const toolName = config.tool?.name || 'retrieve_fmp';
      const toolDesc = config.tool?.description || '从专家的第二大脑专属认知库中检索相关认知。';
      const toolParams = config.tool?.parameters || Type.Object({
        query: Type.String({ description: '检索词' }),
        topK: Type.Optional(Type.Number({ description: '数量' })),
      });

      return {
        name: toolName,
        label: 'Second Brain Retrieval',
        description: toolDesc,
        parameters: toolParams,
        async execute(id: string, params: unknown) {
          const rawArgs = (params ?? {}) as Record<string, unknown>;
          const query = typeof rawArgs.query === 'string' ? rawArgs.query.trim() : '';
          const topK = typeof rawArgs.topK === 'number' ? rawArgs.topK : undefined;

          if (!query) {
            return {
              content: [{ type: 'text', text: `${toolName} 需要非空的 query 检索词。` }],
              isError: true,
            };
          }

          try {
            api.logger.info(`[second-brain] retrieve tool invoked: toolCallId=${id} query="${query}" topK=${topK ?? 'default'}`);
            const startedAt = Date.now();
            const result = await callRetrieveBridge(config, {
              query,
              topK,
              sessionKey,
              toolCallId: id,
            });
            api.logger.info(`[second-brain] retrieve completed: toolCallId=${id} elapsedMs=${Date.now() - startedAt} isError=${result.isError === true}`);
            return result;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            api.logger.error(`[second-brain] retrieve tool failed: toolCallId=${id} error=${message}`);
            return { content: [{ type: 'text', text: `第二大脑检索失败: ${message}` }], isError: true };
          }
        },
      };
    });

    api.logger.info('[second-brain] registered retrieve_fmp tool.');
  },
};

export default plugin;
