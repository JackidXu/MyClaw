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

export const TOOL_RESULT_KEEP_CHARS = 300;
export const TOOL_RESULT_PRUNED_MARKER = '[工具步骤已折叠';
export const CURRENT_TURN_ACTIVE_STEPS_KEEP = 3;
export const CURRENT_TURN_MAX_IMAGES_KEEP = 3;
export const IMAGE_PRUNED_TEXT = '[中间步骤截图已折叠，请参考最新界面呈现]';

const IMAGE_BLOCK_TYPES = new Set(['image', 'image_url', 'input_image']);

function isImageBlock(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false;
  const b = block as Record<string, unknown>;
  if (typeof b.type === 'string' && IMAGE_BLOCK_TYPES.has(b.type)) {
    return true;
  }
  // 识别内嵌 base64 图片的 text block 或 data 字段
  if (typeof b.text === 'string' && b.text.startsWith('data:image/')) {
    return true;
  }
  return false;
}

function pruneToolResultText(rawText: string, label = '历史工具步骤'): string {
  if (
    !rawText ||
    rawText.length <= TOOL_RESULT_KEEP_CHARS ||
    rawText.includes(TOOL_RESULT_PRUNED_MARKER)
  ) {
    return rawText;
  }
  const prefix = rawText.slice(0, TOOL_RESULT_KEEP_CHARS);
  const omitted = rawText.length - TOOL_RESULT_KEEP_CHARS;
  return `${prefix}\n\n[... ${label}已折叠，省略 ${omitted} 字符 ...]\n`;
}

function pruneToolResultMessage(
  msg: AgentMessage,
  options: { label?: string; stripImages?: boolean } = {},
): AgentMessage {
  const label = options.label ?? '历史工具步骤';
  const stripImages = options.stripImages ?? true;
  const content = (msg as { content?: unknown }).content;

  if (typeof content === 'string') {
    const nextText = pruneToolResultText(content, label);
    if (nextText === content) return msg;
    const { details: _details, ...rest } = msg as Record<string, unknown>;
    return { ...rest, content: nextText } as AgentMessage;
  }

  if (Array.isArray(content)) {
    let hasChanged = false;
    const nextContent = content.map((block) => {
      if (!block || typeof block !== 'object') return block;

      // 1. 如果需要剥离图片资源
      if (stripImages && isImageBlock(block)) {
        hasChanged = true;
        return { type: 'text', text: IMAGE_PRUNED_TEXT };
      }

      // 2. 文本与结构化数据折叠
      const textBlock = block as { type?: unknown; text?: unknown };
      if (textBlock.type === 'text' && typeof textBlock.text === 'string') {
        const originalText = textBlock.text;
        const pruned = pruneToolResultText(originalText, label);
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

function stripImagesFromMessage(msg: AgentMessage): AgentMessage {
  const content = (msg as { content?: unknown }).content;
  if (!Array.isArray(content)) return msg;

  let hasChanged = false;
  const nextContent = content.map((block) => {
    if (isImageBlock(block)) {
      hasChanged = true;
      return { type: 'text', text: IMAGE_PRUNED_TEXT };
    }
    return block;
  });

  if (!hasChanged) return msg;
  const { details: _details, ...rest } = msg as Record<string, unknown>;
  return { ...rest, content: nextContent } as AgentMessage;
}

export function pruneContextMessages(messages: AgentMessage[]): AgentMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  // 1. 寻找最后一个真实的 user 提问（User-Turn 边界）
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  let changed = false;
  let nextMessages = messages;

  // 2. 处理历史轮次（上一轮及更早：index < lastUserIndex）
  if (lastUserIndex > 0) {
    nextMessages = nextMessages.map((msg, index) => {
      if (index >= lastUserIndex) return msg;

      // 历史轮次的 toolResult：文本截断并彻底剥离图片
      if (msg?.role === 'toolResult') {
        const pruned = pruneToolResultMessage(msg, { label: '历史工具步骤', stripImages: true });
        if (pruned !== msg) {
          changed = true;
          return pruned;
        }
      } else {
        // 历史轮次的其他消息（如 assistant 携带的中间图）：也剥离图片
        const stripped = stripImagesFromMessage(msg);
        if (stripped !== msg) {
          changed = true;
          return stripped;
        }
      }
      return msg;
    });
  }

  // 3. 处理当前轮次（index >= max(0, lastUserIndex)）
  const currentTurnStartIndex = Math.max(0, lastUserIndex);

  // 3.1 收集当前轮次的所有 toolResult 索引
  const currentToolResultIndices: number[] = [];
  for (let i = currentTurnStartIndex; i < nextMessages.length; i++) {
    if (nextMessages[i]?.role === 'toolResult') {
      currentToolResultIndices.push(i);
    }
  }

  // 当前轮次滑动窗口折叠：仅保留最近的 CURRENT_TURN_ACTIVE_STEPS_KEEP 步（默认 3 步）
  if (currentToolResultIndices.length > CURRENT_TURN_ACTIVE_STEPS_KEEP) {
    const keepStartIndex = currentToolResultIndices.length - CURRENT_TURN_ACTIVE_STEPS_KEEP;
    const indicesToPrune = new Set(currentToolResultIndices.slice(0, keepStartIndex));

    nextMessages = nextMessages.map((msg, index) => {
      if (indicesToPrune.has(index)) {
        const pruned = pruneToolResultMessage(msg, { label: '当前轮中间工具步骤', stripImages: true });
        if (pruned !== msg) {
          changed = true;
          return pruned;
        }
      }
      return msg;
    });
  }

  // 3.2 当前轮次图片配额限制：最多保留最近的 CURRENT_TURN_MAX_IMAGES_KEEP 张（默认 3 张）
  // 从后向前扫描当前轮次中所有的图片 block
  const imageLocations: { messageIndex: number; blockIndex: number }[] = [];
  for (let i = nextMessages.length - 1; i >= currentTurnStartIndex; i--) {
    const content = (nextMessages[i] as { content?: unknown })?.content;
    if (Array.isArray(content)) {
      for (let b = content.length - 1; b >= 0; b--) {
        if (isImageBlock(content[b])) {
          imageLocations.push({ messageIndex: i, blockIndex: b });
        }
      }
    }
  }

  // 如果当前轮次的图片数量超过了保留上限，剥离更早的图片
  if (imageLocations.length > CURRENT_TURN_MAX_IMAGES_KEEP) {
    const imagesToPrune = imageLocations.slice(CURRENT_TURN_MAX_IMAGES_KEEP);
    // 按 messageIndex 分组
    const pruneMap = new Map<number, Set<number>>();
    for (const loc of imagesToPrune) {
      if (!pruneMap.has(loc.messageIndex)) {
        pruneMap.set(loc.messageIndex, new Set());
      }
      pruneMap.get(loc.messageIndex)!.add(loc.blockIndex);
    }

    nextMessages = nextMessages.map((msg, index) => {
      const blocksToPrune = pruneMap.get(index);
      if (!blocksToPrune) return msg;

      const content = (msg as { content?: unknown[] })?.content;
      if (!Array.isArray(content)) return msg;

      changed = true;
      const nextContent = content.map((block, bIdx) => {
        if (blocksToPrune.has(bIdx)) {
          return { type: 'text', text: IMAGE_PRUNED_TEXT };
        }
        return block;
      });

      const { details: _details, ...rest } = msg as Record<string, unknown>;
      return { ...rest, content: nextContent } as AgentMessage;
    });
  }

  return changed ? nextMessages : messages;
}

// 保持向下兼容导出
export const pruneHistoricalToolResults = pruneContextMessages;

export class LobsterAIContextPruneEngine implements ContextEngine {
  readonly info: ContextEngineInfo = {
    id: 'lobsterai-context-prune',
    name: 'LobsterAI Context Pruning Engine',
    version: '1.0.0',
    ownsCompaction: true,
    transcriptSemantics: {
      currentTurnFence: 'before-current-turn-entry-v1',
      turnAdvancementIdempotency: 'atomic-idempotent-v1',
    },
  };

  async commitTurn(_params: unknown): Promise<{ status: 'committed' | 'duplicate' }> {
    return { status: 'committed' };
  }

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
    const pruned = pruneContextMessages(rawMessages);
    if (pruned !== rawMessages) {
      console.log(
        `[lobsterai-context-prune] assemble: pruned context messages (totalMessages=${rawMessages.length}, sessionKey=${params.sessionKey ?? params.sessionId})`,
      );
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
  description: 'Applies proactive context management, progressive sliding window tool folding, and multi-modal image stripping.',
  register(api: OpenClawPluginApi) {
    api.registerContextEngine('lobsterai-context-prune', () => new LobsterAIContextPruneEngine());
    api.logger.info('[lobsterai-context-prune] registered context engine "lobsterai-context-prune".');
  },
};
