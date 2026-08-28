import { mainHttpClient } from '../libs/mainHttpClient';

export interface FmpRetrieveNodeItem {
  type?: string;
  id?: number;
  layer?: number;
  text?: string;
  score?: number;
  raw_score?: number;
}

export interface FmpRetrievePayload {
  status?: boolean;
  count?: number;
  top_score?: number;
  relevant?: boolean;
  threshold?: number;
  items?: FmpRetrieveNodeItem[];
  document?: string;
}

const LAYER_NAME_MAP: Record<number, string> = {
  0: '思维模型',
  1: '价值观念',
  2: '决策规则',
  3: '工作方式',
  4: '行业知识',
  5: '案例经验',
  6: '表达方式',
};

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

/** 获取第一个工具定义（兼容旧调用方） */
export function getSecondBrainToolDefinition(): FmpToolDefinition | null {
  return latestToolDefinitions[0] ?? null;
}

/** 动态格式化检索结果回填大模型 */
export function formatRetrieveResultToDocument(data: FmpRetrievePayload): string {
  // 1. 如果后端直接提供了格式化好的 document，优先使用
  if (typeof data.document === 'string' && data.document.trim()) {
    return data.document.trim();
  }

  // 2. 如果问题不相关或未检索到内容
  if (data.relevant === false || !data.items || data.items.length === 0) {
    return '（本次问题与第二大脑认知库关联度较低，未检索到强匹配的专属认知内容）';
  }

  // 3. 动态按 items 和 layer 组织结构化 Markdown 文本
  const sections: string[] = ['### 第二大脑知识库检索结果：'];

  for (const item of data.items) {
    const layerName = typeof item.layer === 'number' && LAYER_NAME_MAP[item.layer]
      ? LAYER_NAME_MAP[item.layer]
      : '通用认知';
    const text = item.text?.trim() ?? '';
    if (!text) continue;

    sections.push(`- **【${layerName}】** ${text}`);
  }

  return sections.join('\n\n');
}

/**
 * 统一工具执行入口：将 OpenClaw 工具调用转发到 admin-claw 的统一端点
 * admin-claw 负责按工具名路由到对应的 PHP 接口
 * 新增工具时只需在 admin-claw server.js 中添加 case，客户端无需改动
 */
export async function executeSecondBrainRetrieve(options: {
  query: string;
  topK?: number;
  layer?: number;
  sessionKey?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  // 工具名从动态列表中取第一个，若列表为空则回退到历史默认值
  const toolName = latestToolDefinitions[0]?.function?.name ?? 'retrieve_fmp';

  const res = await mainHttpClient.admin.post<{ success: boolean; data?: FmpRetrievePayload; error?: string }>(
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
      content: [{ type: 'text', text: `第二大脑检索返回异常: ${errorMsg}` }],
      isError: true,
    };
  }

  const formattedText = formatRetrieveResultToDocument(res.data.data ?? {});
  return {
    content: [{ type: 'text', text: formattedText }],
  };
}
