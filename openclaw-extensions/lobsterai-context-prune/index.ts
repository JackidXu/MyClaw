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

/** 产物改后微调轮次上限（1 次生成 + 最多 2 轮改后复查，第 3 轮企图修改时坚决打断） */
export const MAX_FINE_TUNING_ROUNDS = 2;

/** 终态验收阶段连续纯审查上限（覆盖 8 格分镜/8 页 PPT，超过 8 次未改动则坚决打断视觉死循环） */
export const MAX_CONSECUTIVE_INSPECTIONS_IN_REVIEW = 8;

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

/**
 * 单轮任务自检与微调状态（基于终态视觉/交互验收为支点的四态状态机）
 * - idle: 前期调研阶段，尚未产生物理写入（修改工具消耗 = 0，查看工具消耗 = 0）
 * - generating: 产物初次构建与装配阶段（允许流水线多次写、读、exec编译，均不计入微调）
 * - inspecting: 正在进行终态验收审查（允许一次性查看多个分片/连续调用view_image/browser，绝不误杀）
 * - mutating_round: 验收后再次发生物理修改，标志着一轮微调正在进行
 */
export type TurnInspectionPhase = 'idle' | 'generating' | 'inspecting' | 'mutating_round';

export type TurnInspectionTracker = {
  phase: TurnInspectionPhase;
  /** 已累计的改后微调轮次（上限为 MAX_FINE_TUNING_ROUNDS = 2） */
  fineTuningRounds: number;
  /** 是否已被系统全局判定为微调超限并锁死 */
  isLockedOut: boolean;
  /** 是否曾经调用过终态验收工具（view_image/browser 等），用于全局检测改后复查震荡 */
  hasInspectedTerminalArtifact: boolean;
  /** 发生终态验收后是否执行过脚本/命令（用于检测看图后跑脚本重绘的震荡闭环） */
  hasExecutedCommandSinceInspection: boolean;
  /** 当前处于 inspecting 验收阶段时连续纯看图/截屏次数（修改后清零，上限 8 次） */
  consecutiveInspectionCount: number;
};

export const turnInspectionTrackerByScopeKey = new Map<string, TurnInspectionTracker>();

/** 会话级产物写入与修改标记（跨轮次有效，用于区分首轮调研期 vs 追问产物已成期） */
export const sessionHasMutatedArtifactByKey = new Map<string, boolean>();

/**
 * 物理写入与修改类工具全集（Mutating Tools）：
 * 涵盖系统真实存在的全部修改工具，并补充防御性常见底层别名。
 */
const MUTATING_TOOL_NAMES = new Set([
  // 1. OpenClaw 核心文件写入与修改（真实存在）
  'write',
  'edit',
  'apply_patch',
  // 2. HeyClaw Office 专属在位修改（真实存在：SlidesAgentTool, WordAgentTool, SheetAgentTool）
  'ppt_edit',
  'word_edit',
  'excel_edit',
  // 3. HeyClaw 媒体生成与资产修改（真实存在）
  'heyclaw_image_generate',
  'heyclaw_video_generate',
  'heyclaw_image_segment',
  'heyclaw_skin_manage',
  // 4. 防御性补充（底层或部分 MCP 插件中可能映射的文件写入别名）
  'write_file',
  'edit_file',
  'patch',
  'file_writer',
  'replace_file_content',
  'image_generate',
]);

/**
 * 命令与脚本执行类工具全集（Command Execution Tools）：
 * 这类工具具有双重性：在自检前作为初次生成/装配工具（忽略不计入微调）；
 * 但在进入自检（inspecting）后，若发生“看图 -> 跑脚本修改 -> 再看图”的往返震荡，则严格闭环计入微调轮次！
 */
const COMMAND_EXECUTION_TOOL_NAMES = new Set([
  'exec',
  'bash',
  'process',
]);

/**
 * 判断是否属于真正的终态视觉审查动作（Terminal Visual Inspection Action）
 * 遵循业界（Anthropic Computer Use / Playwright Agent）标准：
 * 1. view_image 等纯看图工具：100% 属于视觉验收；
 * 2. browser 工具：必须是真正的截图动作（action === 'screenshot'）；
 *    纯粹的 open, resize, act (scroll/click/evaluate) 属于页面准备与交互动作，不消耗视觉审查额度！
 */
export function isTerminalVisualInspection(toolName: string, params?: unknown): boolean {
  const normalized = (toolName || '').toLowerCase().trim();
  if (normalized === 'view_image' || normalized === 'preview' || normalized === 'web_inspector') {
    return true;
  }
  if (normalized === 'browser' || normalized === 'playwright') {
    if (!params || typeof params !== 'object') {
      return false;
    }
    const p = params as Record<string, unknown>;
    const action = typeof p.action === 'string' ? p.action.toLowerCase().trim() : '';
    // 只有真正的 screenshot 动作才产生视觉画面供模型验收
    return action === 'screenshot';
  }
  return false;
}

/**
 * 纯只读安全白名单（Safe Read-Only Allowlist）：
 * 当单轮任务达到微调上限被锁死后，系统遵循工业级 Default-Deny（故障闭锁）安全准则：
 * 强制剥夺物理修改权与自检死磕权，仅允许此类确凿安全的纯只读工具放行，
 * 以便大模型查阅已有产物细节、提取标题/数据，完成体面的阶段性交付总结。
 */
const SAFE_READ_ONLY_TOOL_NAMES = new Set([
  // 文件与内容回读
  'read',
  'read_file',
  'read_file_range',
  'view_file',
  'grep',
  'find',
  // Office 数据回读（只读查表/读段落）
  'ppt_read',
  'word_read',
  'excel_read',
  // 用户互动与系统状态辅助
  'ask_user',
  'askuserquestion',
  'session_status',
  'progress_card',
]);

export function getOrCreateTurnInspectionTracker(scopeKey: string): TurnInspectionTracker {
  let tracker = turnInspectionTrackerByScopeKey.get(scopeKey);
  if (!tracker) {
    tracker = {
      phase: 'idle',
      fineTuningRounds: 0,
      isLockedOut: false,
      hasInspectedTerminalArtifact: false,
      hasExecutedCommandSinceInspection: false,
      consecutiveInspectionCount: 0,
    };
    turnInspectionTrackerByScopeKey.set(scopeKey, tracker);
  }
  return tracker;
}

/**
 * 工业级“以终态验收为支点”的微调状态机判定：
 * 1. idle: 未写过任何文件，查看任何内容均放行（看现状/读素材，消耗 = 0）。
 * 2. generating: 首次写入阶段，模型可以写代码、跑脚本、编译。
 * 3. inspecting: 首次或改后调用 view_image/browser 验收。支持批量巡检 10 个场景，绝不误杀！
 * 4. mutating_round: 验收后再次动手改，微调轮次 +1。若企图发起第 3 轮修改（fineTuningRounds >= 2），立即打断！
 */
export function checkAndRecordInspectionToolCall(
  scopeKey: string,
  toolName: string,
  _params?: unknown,
  sessionKey?: string,
): { isThrashing: boolean; rounds: number; reason?: 'fine_tuning_limit' | 'consecutive_inspection_limit' } {
  const tracker = getOrCreateTurnInspectionTracker(scopeKey);
  const normalized = (toolName || '').toLowerCase().trim();
  const sessionScopedKey = sessionKey || scopeKey;

  // 工业级权限收敛（Default-Deny）：若当前已被系统锁死，仅允许安全只读白名单工具放行，其余一切工具坚决打断！
  if (tracker.isLockedOut) {
    if (SAFE_READ_ONLY_TOOL_NAMES.has(normalized)) {
      return { isThrashing: false, rounds: tracker.fineTuningRounds };
    }
    return { isThrashing: true, rounds: tracker.fineTuningRounds, reason: 'fine_tuning_limit' };
  }

  // A. 物理修改/写入类工具处理
  if (MUTATING_TOOL_NAMES.has(normalized)) {
    // 标记当前会话已产生物理修改事实
    sessionHasMutatedArtifactByKey.set(sessionScopedKey, true);
    // 发生物理写入，重置连续看图计数器
    tracker.consecutiveInspectionCount = 0;

    if (tracker.phase === 'idle') {
      // 从前期调研正式跃迁为初次生成装配
      tracker.phase = 'generating';
      return { isThrashing: false, rounds: tracker.fineTuningRounds };
    }

    if (tracker.phase === 'inspecting') {
      // 关键跃迁：模型看过终态效果后，决定再次动手修改！
      // 检查当前是否已经用光了微调轮次（最多允许 2 轮改后复查）
      if (tracker.fineTuningRounds >= MAX_FINE_TUNING_ROUNDS) {
        tracker.isLockedOut = true;
        return { isThrashing: true, rounds: tracker.fineTuningRounds, reason: 'fine_tuning_limit' };
      }

      // 允许本次微调启动，轮次 +1，跃迁为修改中
      tracker.fineTuningRounds += 1;
      tracker.phase = 'mutating_round';
      return { isThrashing: false, rounds: tracker.fineTuningRounds };
    }

    // 若当前仍处于 generating（初次连续生成多个文件）或 mutating_round（同轮连续微调多个文件），完全放行
    return { isThrashing: false, rounds: tracker.fineTuningRounds };
  }

  // B. 终态视觉/交互验收类工具处理（遵循业界标准：仅对真实视觉生成如 screenshot/view_image 计数）
  if (isTerminalVisualInspection(normalized, _params)) {
    const hasMutated = sessionHasMutatedArtifactByKey.get(sessionScopedKey) === true;
    if (!hasMutated && tracker.phase === 'idle') {
      // 首次纯调研/查看现状/看外部参考图（尚未发生任何物理写入），完全放行且不激活验收态
      return { isThrashing: false, rounds: tracker.fineTuningRounds };
    }

    tracker.hasInspectedTerminalArtifact = true;

    // 关键震荡检测：只要此前发生过看图，并在看图后执行了命令/脚本重绘：
    // 这构成了确凿的【看图 -> 跑脚本改 -> 再次看图】震荡闭环，本次看图允许完成验收，微调轮次正式累加 1！
    if (tracker.hasExecutedCommandSinceInspection) {
      tracker.hasExecutedCommandSinceInspection = false;
      tracker.fineTuningRounds += 1;
      tracker.consecutiveInspectionCount = 1; // 重新进入改后复查，重置连看计数为 1
      return { isThrashing: false, rounds: tracker.fineTuningRounds };
    }

    if (tracker.phase !== 'inspecting') {
      tracker.phase = 'inspecting';
      tracker.hasExecutedCommandSinceInspection = false;
      tracker.consecutiveInspectionCount = 0;
    }

    // 核心安全阀门（纯审查连看上限）：
    // 只有在已正式进入 inspecting 产物验收阶段后，才开始累加连续看图次数。
    // 正常巡检（如 8 个分镜/8 页 PPT）100% 畅通放行；一旦超过 8 次无修改死磕看图，坚决打断！
    tracker.consecutiveInspectionCount += 1;
    if (tracker.consecutiveInspectionCount > MAX_CONSECUTIVE_INSPECTIONS_IN_REVIEW) {
      tracker.isLockedOut = true;
      return { isThrashing: true, rounds: tracker.fineTuningRounds, reason: 'consecutive_inspection_limit' };
    }

    return { isThrashing: false, rounds: tracker.fineTuningRounds };
  }

  // C. 命令与脚本执行工具处理（exec / bash / process）
  if (COMMAND_EXECUTION_TOOL_NAMES.has(normalized)) {
    // 脚本执行也具有修改潜力；如果是追问，或者在看图之后执行：
    if (tracker.hasInspectedTerminalArtifact) {
      if (tracker.fineTuningRounds >= MAX_FINE_TUNING_ROUNDS) {
        tracker.isLockedOut = true;
        return { isThrashing: true, rounds: tracker.fineTuningRounds, reason: 'fine_tuning_limit' };
      }
      tracker.hasExecutedCommandSinceInspection = true;
      // 执行修改脚本，重置连看计数器
      tracker.consecutiveInspectionCount = 0;
    }
    // 首次生成期间跑编译或装环境，记录修改标记（以便追问或后续看图识别）
    sessionHasMutatedArtifactByKey.set(sessionScopedKey, true);
    return { isThrashing: false, rounds: tracker.fineTuningRounds };
  }

  // D. 其他普通只读工具（如 grep, read 等）：不作为微调支点，100% 放行
  return { isThrashing: false, rounds: tracker.fineTuningRounds };
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

      // 2. 产物改后微调轮次上限熔断（基于终态视觉验收支点：1 次初成 + 最多 2 轮改后复查，或单轮连续看图超过 8 次）
      const inspectionCheck = checkAndRecordInspectionToolCall(scopeKey, event.toolName, event.params, sessionKey);
      if (inspectionCheck.isThrashing) {
        if (inspectionCheck.reason === 'consecutive_inspection_limit') {
          api.logger.warn(
            `[lobsterai-context-prune] consecutive inspection limit reached (> ${MAX_CONSECUTIVE_INSPECTIONS_IN_REVIEW}) for tool "${event.toolName}" in turn "${scopeKey}". Blocking visual obsession loop.`,
          );
          return {
            block: true,
            blockReason: `[阶段性验收达成提示]
主要交付物已制作完成，并已顺利完成了多屏关键视觉抽检！
为保障交付效率与交互流畅度，请立即整理当前成果并向用户进行阶段性交付汇报。
【对外专业回复规范（非常重要）】：
1. 请以自信、得体的专业顾问姿态，向用户呈现已完成的核心成果与效果预览（如访问链接或关键章节排版）；
2. 告知用户已顺利完成主要画面的视觉抽检核验，排版与结构完整达标；
3. 严禁向用户使用“被会话封锁中断/系统权限受限/工具被关闭”等负面防御性词汇，直接向用户交出当前高质感成果；
4. 如用户后续需进一步针对特定章节进行深度核验或定制微调，提醒用户只需直接追问吩咐即可。`,
          };
        }

        api.logger.warn(
          `[lobsterai-context-prune] fine-tuning rounds limit reached (${inspectionCheck.rounds}/${MAX_FINE_TUNING_ROUNDS}) for tool "${event.toolName}" in turn "${scopeKey}". Blocking further mutation cycles.`,
        );
        return {
          block: true,
          blockReason: `[阶段性交付达成提示]
当前主要交付物已制作完成，并历经 ${inspectionCheck.rounds} 轮改后复查，产物已达到良好交付水准！
请立即停止调用工具，直接向用户呈现当前的最终成果与总结汇报。
【对外专业回复规范（非常重要）】：
1. 请以专业顾问姿态向用户汇报已完成的核心交付物与亮点；
2. 严禁向用户使用“系统强制打断/权限封锁”等内部术语，以自信、诚恳的态度进行成果展示；
3. 若你在刚才复查中仍有进一步优化的构思或建议，请在汇报末尾以「💡 后续建议」简明客观地供用户参考，将后续调整的决策权交由用户主导。`,
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
