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
/** 当前轮次工具产出（如 browser / view_image）允许保留的最新视觉截图数量（默认仅保留最新 1 张，用户上传图不限） */
export const CURRENT_TURN_TOOL_IMAGES_KEEP = 1;
export const CURRENT_TURN_MAX_IMAGES_KEEP = CURRENT_TURN_TOOL_IMAGES_KEEP;
export const IMAGE_PRUNED_TEXT = '[中间步骤截图已折叠，请参考最新界面呈现]';
export const HISTORICAL_USER_IMAGE_PRUNED_TEXT = '[历史轮次用户上传图片已归档]';

/** 历史轮次消息文本折叠配置 */
export const HISTORICAL_USER_TEXT_MAX_CHARS = 1500;
export const HISTORICAL_ASSISTANT_TEXT_MAX_CHARS = 1500;
export const HISTORICAL_TEXT_KEEP_HEAD_CHARS = 500;
export const HISTORICAL_TEXT_KEEP_TAIL_CHARS = 200;
export const HISTORICAL_TEXT_PRUNED_MARKER = '已折叠，省略';

/** 单轮工具步数弹性熔断配置（放宽至 60 步软预警，70 步硬止损） */
export const TURN_TOOL_CALL_SOFT_LIMIT = 60;
export const TURN_TOOL_CALL_HARD_LIMIT = 70;

/** 同工具同参连续尝试熔断阈值（放宽至 5 次防死磕，避免误伤状态轮询） */
export const SAME_TOOL_CONSECUTIVE_ATTEMPTS_LIMIT = 5;

/** 产物自检验收预算上限（如 browser 页面审查、回读新渲染的幻灯片/切片/代码产物，允许充分核验与局部微调，上限 5 次） */
export const CONSECUTIVE_INSPECTION_ATTEMPTS_LIMIT = 5;

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

export function pruneLongText(
  rawText: string,
  maxChars: number,
  label: string,
): string {
  if (
    !rawText ||
    rawText.length <= maxChars ||
    rawText.includes(HISTORICAL_TEXT_PRUNED_MARKER)
  ) {
    return rawText;
  }
  const head = rawText.slice(0, HISTORICAL_TEXT_KEEP_HEAD_CHARS);
  const tail = rawText.slice(-HISTORICAL_TEXT_KEEP_TAIL_CHARS);
  const omitted = rawText.length - HISTORICAL_TEXT_KEEP_HEAD_CHARS - HISTORICAL_TEXT_KEEP_TAIL_CHARS;
  return `${head}\n\n[... ${label}已折叠，省略 ${omitted} 字符 ...]\n\n${tail}`;
}

export function pruneHistoricalUserMessage(msg: AgentMessage): AgentMessage {
  const content = (msg as { content?: unknown }).content;

  if (typeof content === 'string') {
    const nextText = pruneLongText(content, HISTORICAL_USER_TEXT_MAX_CHARS, '用户历史超长输入');
    if (nextText === content) return msg;
    const { details: _details, ...rest } = msg as Record<string, unknown>;
    return { ...rest, content: nextText } as AgentMessage;
  }

  if (Array.isArray(content)) {
    let hasChanged = false;
    const nextContent = content.map((block) => {
      if (!block || typeof block !== 'object') return block;

      // 剥离用户历史上传图片
      if (isImageBlock(block)) {
        hasChanged = true;
        return { type: 'text', text: HISTORICAL_USER_IMAGE_PRUNED_TEXT };
      }

      // 折叠超长文本
      const textBlock = block as { type?: unknown; text?: unknown };
      if (textBlock.type === 'text' && typeof textBlock.text === 'string') {
        const pruned = pruneLongText(textBlock.text, HISTORICAL_USER_TEXT_MAX_CHARS, '用户历史超长输入');
        if (pruned !== textBlock.text) {
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

export function pruneHistoricalAssistantMessage(msg: AgentMessage): AgentMessage {
  const content = (msg as { content?: unknown }).content;

  if (typeof content === 'string') {
    const nextText = pruneLongText(content, HISTORICAL_ASSISTANT_TEXT_MAX_CHARS, '历史回复详细内容');
    if (nextText === content) return msg;
    const { details: _details, ...rest } = msg as Record<string, unknown>;
    return { ...rest, content: nextText } as AgentMessage;
  }

  if (Array.isArray(content)) {
    let hasChanged = false;
    const nextContent = content.map((block) => {
      if (!block || typeof block !== 'object') return block;

      // 剥离模型输出历史内联图片
      if (isImageBlock(block)) {
        hasChanged = true;
        return { type: 'text', text: IMAGE_PRUNED_TEXT };
      }

      // 折叠超长文本
      const textBlock = block as { type?: unknown; text?: unknown };
      if (textBlock.type === 'text' && typeof textBlock.text === 'string') {
        const pruned = pruneLongText(textBlock.text, HISTORICAL_ASSISTANT_TEXT_MAX_CHARS, '历史回复详细内容');
        if (pruned !== textBlock.text) {
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

      // 历史轮次的 user：剥离历史图片，折叠历史超长文本
      if (msg?.role === 'user') {
        const pruned = pruneHistoricalUserMessage(msg);
        if (pruned !== msg) {
          changed = true;
          return pruned;
        }
      } else if (msg?.role === 'assistant') {
        // 历史轮次的 assistant：剥离历史内联图片，折叠历史超长回复
        const pruned = pruneHistoricalAssistantMessage(msg);
        if (pruned !== msg) {
          changed = true;
          return pruned;
        }
      } else if (msg?.role === 'toolResult') {
        // 历史轮次的 toolResult：文本截断至 300 字符并彻底剥离图片
        const pruned = pruneToolResultMessage(msg, { label: '历史工具步骤', stripImages: true });
        if (pruned !== msg) {
          changed = true;
          return pruned;
        }
      } else {
        // 其他可能存在的自定义角色：剥离图片
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

  // 3.2 当前轮次图片配额限制：
  // 规则 1：用户主动上传的图片（role === 'user'）代表任务参考标准，在当前轮次全量完整保留，绝不剥离；
  // 规则 2：工具产出（role !== 'user'，如 browser 截图）属于过程消耗品，只保留最新的 CURRENT_TURN_TOOL_IMAGES_KEEP 张（默认 1 张）。
  const toolImageLocations: { messageIndex: number; blockIndex: number }[] = [];
  for (let i = nextMessages.length - 1; i >= currentTurnStartIndex; i--) {
    const msg = nextMessages[i];
    // 用户消息中的图片豁免剥离
    if (msg?.role === 'user') continue;

    const content = (msg as { content?: unknown })?.content;
    if (Array.isArray(content)) {
      for (let b = content.length - 1; b >= 0; b--) {
        if (isImageBlock(content[b])) {
          toolImageLocations.push({ messageIndex: i, blockIndex: b });
        }
      }
    }
  }

  // 如果当前轮次的工具截图超过了保留上限（默认 1 张），剥离更早的截图
  if (toolImageLocations.length > CURRENT_TURN_TOOL_IMAGES_KEEP) {
    const imagesToPrune = toolImageLocations.slice(CURRENT_TURN_TOOL_IMAGES_KEEP);
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

/** 单轮工具步数计数跟踪（按 sessionKey 独立维护） */
export const toolCallCountBySessionKey = new Map<string, number>();

/** 工具调用特征记录（用于检测连续相同参数重复调用，防死磕） */
export type LastToolInvocation = {
  signature: string;
  count: number;
};
export const lastToolInvocationBySessionKey = new Map<string, LastToolInvocation>();

export function serializeToolInvocationSignature(toolName: string, params: unknown): string {
  try {
    const serialized = JSON.stringify(params, Object.keys(params && typeof params === 'object' ? params : {}).sort());
    return `${toolName}:${serialized}`;
  } catch {
    return `${toolName}:${String(params)}`;
  }
}

export function checkAndRecordConsecutiveToolCall(
  sessionKey: string,
  toolName: string,
  params: unknown,
): { isConsecutiveLoop: boolean; consecutiveCount: number } {
  const signature = serializeToolInvocationSignature(toolName, params);
  const last = lastToolInvocationBySessionKey.get(sessionKey);

  if (last && last.signature === signature) {
    last.count += 1;
    return {
      isConsecutiveLoop: last.count >= SAME_TOOL_CONSECUTIVE_ATTEMPTS_LIMIT,
      consecutiveCount: last.count,
    };
  }

  lastToolInvocationBySessionKey.set(sessionKey, { signature, count: 1 });
  return { isConsecutiveLoop: false, consecutiveCount: 1 };
}

/**
 * 解析单轮问答（Turn / Run）的独立作用域 Key。
 * 核心机制：用户每次提问或追问，OpenClaw 都会派发全局唯一的 runId。
 * 以 runId 为核心作用域，确保每轮问答拥有纯净独立的步数配额，绝不跨轮次累加，彻底解决追问被锁死的问题。
 */
export function resolveTurnScopeKey(ctx?: { sessionKey?: string; runId?: string }): string {
  if (ctx?.runId) {
    return `${ctx.sessionKey || 'default'}:${ctx.runId}`;
  }
  return ctx?.sessionKey || 'default';
}

export function getSessionKeyTurnToolCount(scopeKey: string): number {
  return toolCallCountBySessionKey.get(scopeKey) ?? 0;
}

export function incrementSessionKeyTurnToolCount(scopeKey: string): number {
  const current = getSessionKeyTurnToolCount(scopeKey);
  const next = current + 1;
  toolCallCountBySessionKey.set(scopeKey, next);
  return next;
}

/** 单轮任务自检跟踪状态（物理分水岭 + 审查自测预算） */
export type TurnInspectionTracker = {
  /** 当前轮次是否已经发生了物理修改/生成（write, edit, apply_patch, exec, bash 等） */
  hasMutated: boolean;
  /** 修改后累计进行的审查/自检验收调用次数 */
  budgetUsed: number;
  /** 是否已被系统全局判定为自检预算耗尽并锁死 */
  isBudgetExhausted: boolean;
};

export const turnInspectionTrackerByScopeKey = new Map<string, TurnInspectionTracker>();

/**
 * 物理写入与修改类工具全集（Mutating Tools）：
 * 发生任何此类调用，标志着当前任务已从“前期调研”正式跃迁为“产物已修改/生成”！
 * （注：已严格排除只读性质的 exec / bash，仅保留纯粹物理写入工具）
 */
const MUTATING_TOOL_NAMES = new Set([
  // OpenClaw 核心文件写入与补丁
  'write',
  'edit',
  'apply_patch',
  'image_generate',
  // HeyClaw Office 专属在位修改工具（三大件齐聚）
  'ppt_edit',
  'word_edit',
  'excel_edit',
]);

/**
 * 视觉审查与产物回读自检工具全集（Inspection & Read-Back Tools）：
 * 涵盖浏览器渲染、切片查看、Office审查及文件回读。
 * 只有在 hasMutated 为 true（发生修改后）才计入自检预算；修改前视为看现状/读素材，完全放行！
 */
const INSPECTION_TOOL_NAMES = new Set([
  // 1. 浏览器与页面审查
  'browser',
  'playwright',
  'web_inspector',
  // 2. 视觉切片与图片审查
  'view_image',
  // 3. 产物文档与代码回读自检（写后回读）
  'read',
  'read_file',
  'read_file_range',
  'view_file',
  'pdf_view',
  'docx_view',
  'grep',
  // 4. HeyClaw Office 专属在位审查（三大件齐聚）
  'ppt_read',
  'word_read',
  'excel_read',
]);

export function getOrCreateTurnInspectionTracker(scopeKey: string): TurnInspectionTracker {
  let tracker = turnInspectionTrackerByScopeKey.get(scopeKey);
  if (!tracker) {
    tracker = {
      hasMutated: false,
      budgetUsed: 0,
      isBudgetExhausted: false,
    };
    turnInspectionTrackerByScopeKey.set(scopeKey, tracker);
  }
  return tracker;
}

/**
 * 业界标准二段生命周期判定（Pre-Edit Gathering vs Post-Edit Verification）：
 * 1. 修改前（hasMutated === false）：大模型调 browser/view_image 是看旧现状/看素材，放行，自检消耗 = 0！
 * 2. 修改后（hasMutated === true）：大模型调 browser/view_image 属于写后验收自检，计入预算！
 */
export function checkAndRecordInspectionToolCall(
  scopeKey: string,
  toolName: string,
  _params?: unknown,
): { isThrashing: boolean; count: number } {
  const tracker = getOrCreateTurnInspectionTracker(scopeKey);
  const normalized = (toolName || '').toLowerCase().trim();

  // 1. 如果是物理修改/生产类工具：标记当前轮次已产生修改，修改工具永远 100% 放行！
  if (MUTATING_TOOL_NAMES.has(normalized)) {
    tracker.hasMutated = true;
    return { isThrashing: false, count: tracker.budgetUsed };
  }

  // 2. 如果不是自检审查类工具（如纯只读查代码的 read, grep, find, ls 等）：直接放行！
  if (!INSPECTION_TOOL_NAMES.has(normalized)) {
    return { isThrashing: false, count: tracker.budgetUsed };
  }

  // 3. 如果当前轮次【压根还没发生过任何代码/文件修改】（前半场调研阶段）：
  // 大模型打开浏览器看上一轮网页、看原图截图，物理性质 100% 属于看现状，零消耗完全放行！
  if (!tracker.hasMutated) {
    return { isThrashing: false, count: tracker.budgetUsed };
  }

  // 4. 后半场（已修改代码）：此时调用 browser 或 view_image 确凿属于自检验收！
  if (tracker.isBudgetExhausted) {
    return { isThrashing: true, count: tracker.budgetUsed };
  }

  tracker.budgetUsed += 1;
  if (tracker.budgetUsed >= CONSECUTIVE_INSPECTION_ATTEMPTS_LIMIT) {
    tracker.isBudgetExhausted = true;
    return { isThrashing: true, count: tracker.budgetUsed };
  }

  return { isThrashing: false, count: tracker.budgetUsed };
}

export function resetSessionKeyState(scopeKey: string): void {
  toolCallCountBySessionKey.delete(scopeKey);
  lastToolInvocationBySessionKey.delete(scopeKey);
  turnInspectionTrackerByScopeKey.delete(scopeKey);
}

// 保持向下兼容导出
export const resetSessionKeyTurnToolCount = resetSessionKeyState;

export default {
  id: 'lobsterai-context-prune',
  name: 'LobsterAI Context Pruning Engine',
  description: 'Applies proactive context management, progressive sliding window tool folding, multi-modal image stripping, turn step capping, and circuit breaker protection.',
  register(api: OpenClawPluginApi) {
    api.registerContextEngine('lobsterai-context-prune', () => new LobsterAIContextPruneEngine());
    api.logger.info('[lobsterai-context-prune] registered context engine "lobsterai-context-prune".');

    // 问答结束时清理单轮状态，防止常驻内存泄露
    api.on('agent_end', async (_event, ctx) => {
      const scopeKey = resolveTurnScopeKey(ctx);
      resetSessionKeyState(scopeKey);
      if (ctx?.sessionKey) {
        resetSessionKeyState(ctx.sessionKey);
      }
    });

    // 工具调用前拦截：步数统计、软硬熔断与同工具同参死循环熔断器
    api.on('before_tool_call', async (event, ctx) => {
      const sessionKey = ctx?.sessionKey;
      if (!sessionKey) return;
      // 以单轮 Turn（RunId）为权威作用域，确保追问时步数天然重置为 0
      const scopeKey = resolveTurnScopeKey(ctx);

      // 1. 同参连续死磕熔断检查
      const toolCheck = checkAndRecordConsecutiveToolCall(scopeKey, event.toolName, event.params);
      if (toolCheck.isConsecutiveLoop) {
        api.logger.warn(
          `[lobsterai-context-prune] circuit breaker triggered: tool "${event.toolName}" was called with identical parameters ${toolCheck.consecutiveCount} times consecutively in turn "${scopeKey}". Blocking repeat attempt.`,
        );
        return {
          block: true,
          blockReason: `[⚠️ 连续失败熔断] 工具 "${event.toolName}" 已使用相同参数连续执行了 ${toolCheck.consecutiveCount} 次！严禁使用相同参数机械无意义重试。请仔细阅读前几次的错误反馈，调整排查思路或更换参数/工具，或直接向用户说明情况并请求协助。`,
        };
      }

      // 2. 产物自检与视觉复查预算熔断（覆盖 browser 网页自测与 view_image/read_file 等产物回读）
      const inspectionCheck = checkAndRecordInspectionToolCall(scopeKey, event.toolName, event.params);
      if (inspectionCheck.isThrashing) {
        api.logger.warn(
          `[lobsterai-context-prune] artifact inspection budget limit reached (${inspectionCheck.count}/${CONSECUTIVE_INSPECTION_ATTEMPTS_LIMIT}) for tool "${event.toolName}" in turn "${scopeKey}". Blocking further self-correction thrashing.`,
        );
        return {
          block: true,
          blockReason: `[⚠️ 阶段性交付要求] 检测到你已针对当前任务进行了 ${inspectionCheck.count} 次成果视觉复查/回读自检！当前核心交付物（如 HTML/PPT/文档/代码）已完全成型，自检验收预算已用尽。严禁继续在后台自嗨式打磨细节或重复审查。请立即停止调用工具，向用户展示当前完成的成果并做总结汇报！后续微调必须交由用户决定。`,
        };
      }

      // 3. 总步数统计与软硬熔断（按单轮 Turn 计算）
      const count = incrementSessionKeyTurnToolCount(scopeKey);

      // 硬熔断：达到 70 步彻底拦截并指示模型收手
      if (count > TURN_TOOL_CALL_HARD_LIMIT) {
        api.logger.warn(
          `[lobsterai-context-prune] hard cap reached (${count} > ${TURN_TOOL_CALL_HARD_LIMIT}) for tool "${event.toolName}" in turn "${scopeKey}". Blocking tool call.`,
        );
        return {
          block: true,
          blockReason: `已达到单轮任务 ${TURN_TOOL_CALL_HARD_LIMIT} 步工具安全上限（当前第 ${count} 步）。已触发系统安全熔断止损，严禁继续调用任何工具！请立即整理已有工作成果，向用户进行阶段性交付汇报并等待用户指令。`,
        };
      }

      // 软提示：达到 60 步时在日志中预警
      if (count >= TURN_TOOL_CALL_SOFT_LIMIT) {
        api.logger.warn(
          `[lobsterai-context-prune] soft cap reached (${count}/${TURN_TOOL_CALL_HARD_LIMIT}) for tool "${event.toolName}" in turn "${scopeKey}". Approaching limit.`,
        );
      }
    });
  },
};
