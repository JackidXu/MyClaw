import { Type } from '@sinclair/typebox';
// @ts-expect-error plugin-sdk exists natively inside the openclaw gateway sandbox
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

type PluginConfig = {
  callbackUrl: string;
  secret: string;
  requestTimeoutMs: number;
};

type WebSearchRequest = {
  query: string;
  count?: number;
  sessionKey: string;
  toolCallId: string;
};

type WebSearchResponse = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
};

const DEFAULT_TIMEOUT_MS = 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parsePluginConfig = (value: unknown): PluginConfig => {
  const raw = isRecord(value) ? value : {};
  return {
    callbackUrl: typeof raw.callbackUrl === 'string' ? raw.callbackUrl.trim() : '',
    secret: typeof raw.secret === 'string' ? raw.secret.trim() : '',
    requestTimeoutMs: typeof raw.requestTimeoutMs === 'number' ? raw.requestTimeoutMs : DEFAULT_TIMEOUT_MS,
  };
};

async function callWebSearchBridge(
  config: PluginConfig,
  request: WebSearchRequest,
): Promise<WebSearchResponse> {
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
      throw new Error(`Web search HTTP ${response.status}: ${text.trim() || response.statusText}`);
    }

    if (!text.trim()) {
      return { content: [{ type: 'text', text: '（未检索到相关网络内容）' }] };
    }

    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.content)) {
      return parsed as WebSearchResponse;
    }

    return {
      content: [{ type: 'text', text: typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2) }],
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { content: [{ type: 'text', text: '联网搜索请求超时，请稍后重试。' }], isError: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `联网搜索失败: ${message}` }], isError: true };
  } finally {
    clearTimeout(timer);
  }
}

const plugin = {
  id: 'web-search',
  name: 'WebSearch',
  description: 'Real-time web search powered by HeyClaw and Volcano Engine.',
  configSchema: {
    parse(value: unknown): PluginConfig {
      return parsePluginConfig(value);
    },
  },

  register(api: OpenClawPluginApi) {
    const config = parsePluginConfig(api.pluginConfig);

    if (!config.callbackUrl) {
      api.logger.info('[web-search] skipped: callbackUrl not configured.');
      return;
    }

    api.registerTool((ctx: any) => {
      const sessionKey = ctx.sessionKey ?? '';

      return {
        name: 'heyclaw_web_search',
        label: 'Web Search',
        description:
          '全网实时信息搜索工具。当需要查询实时资讯、最新行业动态、公众人物方法论、微信文章、行业百科等任何需要网络搜索的信息时，优先调用本工具。',
        parameters: Type.Object({
          query: Type.String({ description: '搜索关键词或查询短语' }),
          count: Type.Optional(Type.Number({ description: '期望返回的搜索结果条数，默认 5 条' })),
        }),
        async execute(id: string, params: unknown) {
          const rawArgs = (params ?? {}) as Record<string, unknown>;
          const query = typeof rawArgs.query === 'string' ? rawArgs.query.trim() : '';
          const count = typeof rawArgs.count === 'number' ? rawArgs.count : undefined;

          if (!query) {
            return {
              content: [{ type: 'text', text: 'heyclaw_web_search 需要非空的 query 搜索词。' }],
              isError: true,
            };
          }

          try {
            api.logger.info(`[web-search] tool invoked: toolCallId=${id} query="${query}" count=${count ?? 5}`);
            const startedAt = Date.now();
            const result = await callWebSearchBridge(config, {
              query,
              count,
              sessionKey,
              toolCallId: id,
            });
            api.logger.info(`[web-search] completed: toolCallId=${id} elapsedMs=${Date.now() - startedAt} isError=${result.isError === true}`);
            return result;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            api.logger.error(`[web-search] tool failed: toolCallId=${id} error=${message}`);
            return { content: [{ type: 'text', text: `联网搜索失败: ${message}` }], isError: true };
          }
        },
      };
    });

    api.logger.info('[web-search] registered heyclaw_web_search tool.');
  },
};

export default plugin;
