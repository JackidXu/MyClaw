import type {
  AgentMessage,
  AssembleResult,
  CompactResult,
  ContextEngine,
  ContextEngineInfo,
  ContextEngineRuntimeContext,
  IngestResult,
  OpenClawPluginApi,
} from 'openclaw/plugin-sdk';
import { delegateCompactionToRuntime } from 'openclaw/plugin-sdk/core';

export const HISTORICAL_TOOL_RESULT_KEEP_CHARS = 300;
export const HISTORICAL_TOOL_RESULT_PRUNED_MARKER = '[历史工具步骤已折叠';

function pruneToolResultText(rawText: string): string {
  if (
    !rawText ||
    rawText.length <= HISTORICAL_TOOL_RESULT_KEEP_CHARS ||
    rawText.includes(HISTORICAL_TOOL_RESULT_PRUNED_MARKER)
  ) {
    return rawText;
  }
  const prefix = rawText.slice(0, HISTORICAL_TOOL_RESULT_KEEP_CHARS);
  const omitted = rawText.length - HISTORICAL_TOOL_RESULT_KEEP_CHARS;
  return `${prefix}\n\n[... 历史工具步骤已折叠，省略 ${omitted} 字符 ...]\n`;
}

function pruneToolResultMessage(msg: AgentMessage): AgentMessage {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === 'string') {
    const nextText = pruneToolResultText(content);
    if (nextText === content) return msg;
    const { details: _details, ...rest } = msg as Record<string, unknown>;
    return { ...rest, content: nextText } as AgentMessage;
  }

  if (Array.isArray(content)) {
    let hasChanged = false;
    const nextContent = content.map(block => {
      if (!block || typeof block !== 'object') return block;
      const textBlock = block as { type?: unknown; text?: unknown };
      if (textBlock.type === 'text' && typeof textBlock.text === 'string') {
        const originalText = textBlock.text;
        const pruned = pruneToolResultText(originalText);
        if (pruned !== originalText) {
          hasChanged = true;
          return { ...block, text: pruned };
        }
      }
      return block;
    });

    if (!hasChanged) return msg;
    const { details: _details, ...rest } = msg as Record<string, unknown>;
    return { ...rest, content: nextContent } as AgentMessage;
  }

  return msg;
}

export function pruneHistoricalToolResults(messages: AgentMessage[]): AgentMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  // 业界标准：寻找最后一个真实的 user 提问（User-Turn 边界）
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  // 如果没有找到 user，或者首条消息就是当前 user，说明没有历史问答轮次需要折叠
  if (lastUserIndex <= 0) {
    return messages;
  }

  let changed = false;
  const nextMessages = messages.map((msg, index) => {
    // 只有在当前轮次用户提问之前的历史 toolResult，才执行安全静态折叠
    if (index < lastUserIndex && msg?.role === 'toolResult') {
      const pruned = pruneToolResultMessage(msg);
      if (pruned !== msg) {
        changed = true;
        return pruned;
      }
    }
    return msg;
  });

  return changed ? nextMessages : messages;
}

export class LobsterAIContextPruneEngine implements ContextEngine {
  readonly info: ContextEngineInfo = {
    id: 'lobsterai-context-prune',
    name: 'LobsterAI Context Pruning Engine',
    version: '1.0.0',
    ownsCompaction: true,
  };

  async ingest(_params: {
    sessionId: string;
    sessionKey?: string;
    message: AgentMessage;
    isHeartbeat?: boolean;
  }): Promise<IngestResult> {
    return { ingested: false };
  }

  async assemble(params: {
    sessionId: string;
    sessionKey?: string;
    messages: AgentMessage[];
    tokenBudget?: number;
    model?: string;
  }): Promise<AssembleResult> {
    const rawMessages = params.messages;
    const pruned = pruneHistoricalToolResults(rawMessages);
    if (pruned !== rawMessages) {
      console.log(`[lobsterai-context-prune] assemble: pruned historical tool results (totalMessages=${rawMessages.length}, sessionKey=${params.sessionKey ?? params.sessionId})`);
    } else {
      console.log(`[lobsterai-context-prune] assemble called: totalMessages=${rawMessages.length}`);
    }
    return {
      messages: pruned,
      estimatedTokens: 0,
    };
  }

  async afterTurn(_params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
    messages: AgentMessage[];
    prePromptMessageCount: number;
    autoCompactionSummary?: string;
    isHeartbeat?: boolean;
    tokenBudget?: number;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<void> {
    // SessionManager 直接负责消息持久化
  }

  async compact(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
    tokenBudget?: number;
    force?: boolean;
    currentTokenCount?: number;
    compactionTarget?: 'budget' | 'threshold';
    customInstructions?: string;
    runtimeContext?: ContextEngineRuntimeContext;
    abortSignal?: AbortSignal;
  }): Promise<CompactResult> {
    return await delegateCompactionToRuntime(params);
  }

  async dispose(): Promise<void> {
    // 无资源需释放
  }
}

export default {
  id: 'lobsterai-context-prune',
  name: 'LobsterAI Context Pruning Engine',
  description: 'Applies proactive context management and historical tool result folding.',
  register(api: OpenClawPluginApi) {
    api.registerContextEngine('lobsterai-context-prune', () => new LobsterAIContextPruneEngine());
    api.logger.info('[lobsterai-context-prune] registered context engine "lobsterai-context-prune".');
  },
};
