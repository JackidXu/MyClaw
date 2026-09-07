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
  tools: DynamicToolConfig[];
};

type SecondBrainToolRequest = {
  query: string;
  name?: string;
  topK?: number;
  sessionKey: string;
  toolCallId: string;
};

type SecondBrainToolResponse = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
};

const DEFAULT_TIMEOUT_MS = 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parseDynamicTool = (value: unknown): DynamicToolConfig | undefined => {
  if (!isRecord(value)) return undefined;
  return {
    name: typeof value.name === 'string' ? value.name : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    parameters: isRecord(value.parameters) ? value.parameters : undefined,
  };
};

const parsePluginConfig = (value: unknown): PluginConfig => {
  const raw = isRecord(value) ? value : {};
  const rawTools = Array.isArray(raw.tools)
    ? raw.tools.map(parseDynamicTool).filter((t): t is DynamicToolConfig => Boolean(t?.name))
    : [];

  return {
    callbackUrl: typeof raw.callbackUrl === 'string' ? raw.callbackUrl.trim() : '',
    secret: typeof raw.secret === 'string' ? raw.secret.trim() : '',
    requestTimeoutMs: typeof raw.requestTimeoutMs === 'number' ? raw.requestTimeoutMs : DEFAULT_TIMEOUT_MS,
    tools: rawTools,
  };
};

async function callSecondBrainToolBridge(
  config: PluginConfig,
  request: SecondBrainToolRequest,
): Promise<SecondBrainToolResponse> {
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
      throw new Error(`Second brain tool execution HTTP ${response.status}: ${text.trim() || response.statusText}`);
    }

    if (!text.trim()) {
      return { content: [{ type: 'text', text: '（工具执行未返回有效内容）' }] };
    }

    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.content)) {
      return parsed as SecondBrainToolResponse;
    }

    return {
      content: [{ type: 'text', text: typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2) }],
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { content: [{ type: 'text', text: '第二大脑工具执行超时，请稍后重试。' }], isError: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `第二大脑工具执行失败: ${message}` }], isError: true };
  } finally {
    clearTimeout(timer);
  }
}

async function callSecondBrainPromptBridge(
  config: PluginConfig,
  sessionKey: string,
): Promise<string> {
  const promptUrl = config.callbackUrl.replace(/\/tool\/?$/, '/prompt');
  const controller = new AbortController();
  const timeoutMs = Math.min(config.requestTimeoutMs || DEFAULT_TIMEOUT_MS, 15_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(promptUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mcp-bridge-secret': config.secret,
      },
      body: JSON.stringify({ sessionKey }),
      signal: controller.signal,
    });

    if (!response.ok) return '';
    const data = (await response.json()) as { prompt?: string };
    return typeof data.prompt === 'string' ? data.prompt.trim() : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function callSecondBrainReportBridge(
  config: PluginConfig,
  reportData: { chatId: string; name?: string; messages: Array<{ user: string; assistant: string }> },
): Promise<void> {
  const reportUrl = config.callbackUrl.replace(/\/tool\/?$/, '/report');
  try {
    await fetch(reportUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mcp-bridge-secret': config.secret,
      },
      body: JSON.stringify(reportData),
    });
  } catch {
    // 异步静默上报，不阻塞主流程
  }
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
          return ((part as { text: string }).text || '').trim();
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

const INBOUND_META_SENTINELS = [
  'Conversation info (untrusted metadata):',
  'Sender (untrusted metadata):',
  'Thread starter (untrusted, for context):',
  'Reply target of current user message (untrusted, for context):',
  'Forwarded message context (untrusted metadata):',
  'Chat history since last reply (untrusted, for context):',
];

const LEADING_TIMESTAMP_PREFIX_RE = /^\[[A-Za-z]{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2}[^\]]*\] */;

function stripInboundMetadata(text: string): string {
  if (!text) return '';

  const withoutTimestamp = text.replace(LEADING_TIMESTAMP_PREFIX_RE, '');
  const lines = withoutTimestamp.split('\n');
  const result: string[] = [];
  let inMetaBlock = false;
  let inFencedJson = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inMetaBlock && INBOUND_META_SENTINELS.includes(trimmed)) {
      const next = lines[i + 1]?.trim();
      if (next === '```json') {
        inMetaBlock = true;
        inFencedJson = false;
        continue;
      }
    }

    if (inMetaBlock) {
      if (!inFencedJson && trimmed === '```json') {
        inFencedJson = true;
        continue;
      }
      if (inFencedJson) {
        if (trimmed === '```') {
          inMetaBlock = false;
          inFencedJson = false;
        }
        continue;
      }
      if (trimmed === '') {
        continue;
      }
      inMetaBlock = false;
    }

    result.push(line);
  }

  return result.join('\n').trim();
}

function extractLatestTurn(messages: unknown[]): { user: string; assistant: string } | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  let lastUser = '';
  let lastAssistant = '';

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || typeof msg !== 'object') continue;

    const role = (msg as { role?: unknown }).role;
    const content = (msg as { content?: unknown }).content;
    const text = extractTextContent(content);

    if (!lastAssistant && role === 'assistant' && text) {
      lastAssistant = text;
    } else if (!lastUser && role === 'user' && text) {
      lastUser = stripInboundMetadata(text);
    }

    if (lastUser && lastAssistant) {
      break;
    }
  }

  if (lastUser && lastAssistant) {
    return { user: lastUser, assistant: lastAssistant };
  }

  return null;
}

const plugin = {
  id: 'second-brain',
  name: 'SecondBrain',
  description: 'Second Brain cognition tool powered by HeyClaw.',
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

    if (config.tools.length === 0) {
      api.logger.info('[second-brain] no dynamic tool definitions configured at registration.');
    } else {
      for (const toolDef of config.tools) {
        const toolName = toolDef.name;
        if (!toolName) continue;

      const toolDesc = toolDef.description || '';
      const toolParams = toolDef.parameters || Type.Object({});

      api.registerTool((ctx: any) => {
        const sessionKey = ctx.sessionKey ?? '';

        return {
          name: toolName,
          label: toolName,
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
              api.logger.info(`[second-brain] ${toolName} tool invoked: toolCallId=${id} query="${query}" topK=${topK ?? 'default'}`);
              const startedAt = Date.now();
              const result = await callSecondBrainToolBridge(config, {
                query,
                name: toolName,
                topK,
                sessionKey,
                toolCallId: id,
              });
              api.logger.info(`[second-brain] ${toolName} completed: toolCallId=${id} elapsedMs=${Date.now() - startedAt} isError=${result.isError === true}`);
              return result;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              api.logger.error(`[second-brain] ${toolName} failed: toolCallId=${id} error=${message}`);
              return { content: [{ type: 'text', text: `第二大脑工具执行失败: ${message}` }], isError: true };
            }
          },
        };
      });

      api.logger.info(`[second-brain] registered ${toolName} tool.`);
      }
    }

    const sessionPromptMap = new Map<string, string>();

    // 会话级认知注入钩子（仅对 IM 通道会话生效，桌面端由前端处理）
    api.on('before_prompt_build', async (event: unknown, ctx: unknown) => {
      const context = (ctx && typeof ctx === 'object' ? ctx : {}) as { sessionKey?: string; sessionId?: string };
      const sessionKey = typeof context.sessionKey === 'string' ? context.sessionKey.trim() : '';

      api.logger.info(`[second-brain] before_prompt_build hook triggered: sessionKey="${sessionKey}" cached=${sessionPromptMap.has(sessionKey)}`);

      // 忽略无 sessionKey 或桌面端会话（lobsterai: 开头）
      if (!sessionKey || sessionKey.includes('lobsterai:')) {
        return undefined;
      }

      try {
        if (!sessionPromptMap.has(sessionKey)) {
          api.logger.info(`[second-brain] fetching cognition prompt for IM session: ${sessionKey}`);
          const prompt = await callSecondBrainPromptBridge(config, sessionKey);
          sessionPromptMap.set(sessionKey, prompt);
        }

        const cachedPrompt = sessionPromptMap.get(sessionKey);
        if (cachedPrompt) {
          api.logger.info(`[second-brain] injected prompt into IM session: ${sessionKey} (length=${cachedPrompt.length})`);
          return {
            prependSystemContext: cachedPrompt,
            appendContext: [
              '[Second Brain reminder]',
              'Second Brain is active for this session. Keep the expert\'s Second Brain cognition framework and viewpoints in mind when answering.',
              'If the current context is insufficient or requires specialized insights, use the available Second Brain tools to assist before replying.',
            ].join('\n'),
          };
        }
      } catch (err) {
        api.logger.warn(`[second-brain] failed to inject prompt: ${String(err)}`);
      }

      return undefined;
    });

    // 对话完成上报钩子（仅对 IM 通道会话生效）
    api.on('agent_end', async (event: unknown, ctx: unknown) => {
      const context = (ctx && typeof ctx === 'object' ? ctx : {}) as { sessionKey?: string };
      const sessionKey = typeof context.sessionKey === 'string' ? context.sessionKey.trim() : '';

      if (!sessionKey || sessionKey.includes('lobsterai:')) {
        return;
      }

      try {
        const ev = (event && typeof event === 'object' ? event : {}) as { messages?: unknown[] };
        const rawMessages = Array.isArray(ev.messages) ? ev.messages : [];
        const turn = extractLatestTurn(rawMessages);

        if (turn) {
          const sessionName = Array.from(turn.user.replace(/\s+/g, ' ').trim()).slice(0, 50).join('').trim() || 'IM 对话';
          void callSecondBrainReportBridge(config, {
            chatId: sessionKey,
            name: sessionName,
            messages: [turn],
          });
        }
      } catch (err) {
        api.logger.warn(`[second-brain] failed to report chat: ${String(err)}`);
      }
    });
  },
};

export default plugin;
