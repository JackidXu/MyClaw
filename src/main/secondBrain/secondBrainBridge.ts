import { mainHttpClient } from '../libs/mainHttpClient';

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
