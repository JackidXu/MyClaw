import crypto from 'crypto';

import { mainHttpClient } from '../libs/mainHttpClient';
import { mainVipService } from '../vip/mainVipService';

// 用于查询会话第二大脑启用状态的注入函数
let sessionSecondBrainEnabledGetter: ((sessionId: string) => boolean | undefined) | null = null;

export function setSessionSecondBrainEnabledGetter(getter: (sessionId: string) => boolean | undefined): void {
  sessionSecondBrainEnabledGetter = getter;
}

export interface FmpToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

// 存储应用级工具列表（应用初始化时加载一次）
let latestToolDefinitions: FmpToolDefinition[] = [];

/** 更新应用级工具列表（完全动态，不感知具体工具名） */
export function updateSecondBrainToolDefinitions(tools?: FmpToolDefinition[] | null): void {
  if (Array.isArray(tools) && tools.length > 0) {
    latestToolDefinitions = tools;
  }
}

/** 获取应用级工具列表 */
export function getSecondBrainToolDefinitions(): FmpToolDefinition[] {
  return latestToolDefinitions;
}

/** 获取第一个工具定义 */
export function getSecondBrainToolDefinition(): FmpToolDefinition | null {
  return latestToolDefinitions[0] ?? null;
}

/**
 * 主进程同步第二大脑工具定义（直接存入内存变量）
 * 应用启动时调用一次，供网关生成配置使用
 */
export async function syncSecondBrainTools(): Promise<void> {
  const granted = hasSecondBrainPermission();
  if (!granted) {
    latestToolDefinitions = [];
    return;
  }

  try {
    const res = await mainHttpClient.biz.get<SecondBrainApiResponse<{ tools?: FmpToolDefinition[] }>>(
      '/api/chaohuixie/claw/fmp/injectTools',
    );

    if (res.ok && res.data && Array.isArray(res.data.data?.tools) && res.data.data.tools.length > 0) {
      updateSecondBrainToolDefinitions(res.data.data.tools);
      console.log(`[SecondBrainBridge] synced ${res.data.data.tools.length} tools into memory for OpenClaw config`);
    }
  } catch (error) {
    console.warn('[SecondBrainBridge] syncSecondBrainTools error:', error);
  }
}

/** 通用格式化第二大脑工具返回结果供大模型消费 */
export function formatSecondBrainToolResult(data: unknown): string {
  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    // 优先使用后端格式化好的 document 文本
    if (typeof record.document === 'string' && record.document.trim()) {
      return record.document.trim();
    }
    return JSON.stringify(data, null, 2);
  }

  return data !== undefined && data !== null ? String(data) : '（工具执行成功，无额外返回内容）';
}

/**
 * 统一工具执行入口：将 OpenClaw 工具调用转发到 admin-claw 的统一端点
 * admin-claw 负责按工具名路由到对应的 PHP 接口
 * 新增工具时只需在 admin-claw server.js 中添加 case，客户端无需改动
 */
export async function executeSecondBrainTool(options: {
  query: string;
  name?: string;
  topK?: number;
  layer?: number;
  sessionKey?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  // 使用当前调用的真实工具名（或最新下发的工具定义名）
  const toolName = options.name || latestToolDefinitions[0]?.function?.name;
  if (!toolName) {
    return {
      content: [{ type: 'text', text: '第二大脑工具未就绪或未下发定义。' }],
      isError: true,
    };
  }

  const res = await mainHttpClient.admin.post<{ success: boolean; data?: unknown; error?: string }>(
    '/api/client/fmp/tool/execute',
    {
      name: toolName,
      arguments: {
        query: options.query,
        ...(options.topK !== undefined ? { topK: options.topK } : {}),
        ...(options.layer !== undefined ? { layer: options.layer } : {}),
      },
    },
  );

  if (!res.ok || !res.data || !res.data.success) {
    const errorMsg = res.data?.error || res.error || '业务错误';
    console.warn('[SecondBrainBridge] tool execute failed:', errorMsg);
    return {
      content: [{ type: 'text', text: `第二大脑工具执行异常: ${errorMsg}` }],
      isError: true,
    };
  }

  const formattedText = formatSecondBrainToolResult(res.data.data);
  return {
    content: [{ type: 'text', text: formattedText }],
  };
}

interface SecondBrainApiResponse<T = unknown> {
  status: string;
  message: string;
  code: number;
  data: T;
}

/**
 * 校验当前用户是否具备第二大脑权限（单源权威：直接读取 mainVipService）
 */
export function hasSecondBrainPermission(): boolean {
  return mainVipService.hasSecondBrainPermission();
}

/**
 * 获取第二大脑认知注入提示词（会话级）
 * 供 IM 通道在会话首条消息时动态获取人设认知（默认开启，仅受 VIP 权限管控）
 */
export async function fetchSecondBrainPrompt(sessionKey?: string): Promise<{ prompt: string }> {
  // VIP 权限检查（与桌面端 vipService 完全对齐）
  const granted = hasSecondBrainPermission();
  if (!granted) {
    console.log('[SecondBrainBridge] skipped prompt injection: no secondBrain VIP permission');
    return { prompt: '' };
  }

  const startedAt = Date.now();
  try {
    const res = await mainHttpClient.biz.get<SecondBrainApiResponse<{ prompt?: string }>>(
      '/api/chaohuixie/claw/fmp/injectPrompt',
    );

    if (!res.ok || !res.data) {
      console.warn('[SecondBrainBridge] fetchPrompt failed HTTP status:', res.status, res.error);
      return { prompt: '' };
    }

    const promptText = res.data.data?.prompt;
    if (typeof promptText === 'string' && promptText.trim()) {
      console.log(`[SecondBrainBridge] fetchPrompt success: length=${promptText.trim().length} elapsedMs=${Date.now() - startedAt}`);
      return { prompt: promptText.trim() };
    }

    console.log(`[SecondBrainBridge] fetchPrompt returned empty prompt: code=${res.data.code} message="${res.data.message}"`);
    return { prompt: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[SecondBrainBridge] fetchPrompt exception:', message, 'sessionKey:', sessionKey);
    return { prompt: '' };
  }
}

export interface SecondBrainChatReportMessage {
  user: string;
  assistant: string;
}

/**
 * 上报对话记录至第二大脑后端（POST /api/chaohuixie/claw/fmp/chat/report）
 */
/**
 * 规范化 chatId：
 * 1. 桌面端会话（形如 agent:main:lobsterai:<sessionId>）：提取纯净的 sessionId（36字符 UUID）；
 * 2. IM 渠道（形如 agent:main:openclaw-weixin:...）：提取末尾业务会话 ID，并加上 im_ 标识，确保全局唯一且 <= 64 字符；
 * 3. 其他超长会话 key：安全截断并附带哈希，保证 <= 64 字符且在 MySQL client_chat_id 中稳定命中。
 */
export function normalizeSecondBrainChatId(rawChatId: string): string {
  const trimmed = rawChatId.trim();
  if (!trimmed) return '';

  // 1. 桌面端会话：直接提取 UUID sessionId (36位)
  if (trimmed.includes('lobsterai:')) {
    const parts = trimmed.split('lobsterai:');
    const sessionId = parts[1]?.trim();
    if (sessionId) {
      return sessionId;
    }
  }

  // 2. IM 渠道：提取有效会话主体并规范化
  // 例如 agent:main:openclaw-weixin:44d4302c917a-im-bot:direct:o9cq806q1vqz16xfqjdww082dg2o@im.wechat
  if (trimmed.startsWith('agent:')) {
    const segments = trimmed.split(':');
    // 取 channel（例如 openclaw-weixin）和 target（例如 direct:xxxx 或 group:xxxx 或末尾段）
    const channel = segments[2]?.replace(/^openclaw-/, '') || 'im';
    const target = segments.slice(4).join(':') || segments[segments.length - 1];
    const candidate = `${channel}:${target}`;
    if (candidate.length <= 64) {
      return candidate;
    }
    // 超过 64 字符时，保留前缀并加上稳定哈希摘要，严格控制在 48 字符内
    const hash = crypto.createHash('md5').update(trimmed).digest('hex').slice(0, 16);
    return `${channel}:${target.slice(0, 24)}_${hash}`;
  }

  // 3. 通用兜底：长度超过 60 字符时转换为 md5 哈希，防止数据库截断导致无法合并
  if (trimmed.length > 60) {
    const hash = crypto.createHash('md5').update(trimmed).digest('hex');
    return `chat_${hash}`;
  }

  return trimmed;
}

export async function reportSecondBrainChat(params: {
  chatId: string;
  name?: string;
  messages: SecondBrainChatReportMessage[];
}): Promise<{ success: boolean; error?: string }> {
  if (!params.chatId || !Array.isArray(params.messages) || params.messages.length === 0) {
    return { success: false, error: 'Invalid report params' };
  }

  const granted = hasSecondBrainPermission();
  if (!granted) {
    return { success: false, error: 'No secondBrain VIP permission' };
  }

  // 如果是桌面端会话（形如 agent:main:lobsterai:<sessionId>），校验该会话是否开启了第二大脑
  if (params.chatId.includes('lobsterai:')) {
    const parts = params.chatId.split('lobsterai:');
    const sessionId = parts[1]?.trim();
    if (sessionId && sessionSecondBrainEnabledGetter) {
      const enabled = sessionSecondBrainEnabledGetter(sessionId);
      if (enabled === false) {
        console.log(`[SecondBrainBridge] skipped report: session ${sessionId} has secondBrain disabled`);
        return { success: true };
      }
    }
  }

  // 规范化 chatId，避免超长导致后端 MySQL 截断无法合并成同一条对话
  const normalizedChatId = normalizeSecondBrainChatId(params.chatId);

  try {
    const res = await mainHttpClient.biz.post<SecondBrainApiResponse<unknown>>(
      '/api/chaohuixie/claw/fmp/chat/report',
      {
        ...params,
        chatId: normalizedChatId,
      },
    );

    if (!res.ok) {
      console.warn('[SecondBrainBridge] reportChat failed HTTP status:', res.status, res.error);
      return { success: false, error: res.error };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[SecondBrainBridge] reportChat exception:', message);
    return { success: false, error: message };
  }
}
