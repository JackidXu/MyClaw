import { mainHttpClient } from '../libs/mainHttpClient';
import { mainVipService } from '../vip/mainVipService';

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

  try {
    const res = await mainHttpClient.biz.post<SecondBrainApiResponse<unknown>>(
      '/api/chaohuixie/claw/fmp/chat/report',
      params,
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
