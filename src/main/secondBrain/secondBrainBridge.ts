import { app } from 'electron';
import * as http from 'http';
import * as https from 'https';
import * as nodeUrl from 'url';

export interface FmpAuthHeaders {
  Authorization?: string;
  authorization?: string;
}

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
let latestAuthHeaders: FmpAuthHeaders = {};
const authHeadersBySessionKey = new Map<string, FmpAuthHeaders>();
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

export function updateSecondBrainAuthHeaders(sessionKey: string | null, headers: FmpAuthHeaders): void {
  if (headers.Authorization || headers.authorization) {
    latestAuthHeaders = { ...headers };
    if (sessionKey) {
      authHeadersBySessionKey.set(sessionKey, { ...headers });
    }
  }
}

export function getSecondBrainAuthHeaders(sessionKey?: string): FmpAuthHeaders {
  if (sessionKey) {
    if (authHeadersBySessionKey.has(sessionKey)) {
      return authHeadersBySessionKey.get(sessionKey)!;
    }
    // 支持按 sessionId 包含匹配（因为 sessionKey 形式如 agent:main:lobsterai:<sessionId>）
    for (const [key, headers] of authHeadersBySessionKey.entries()) {
      if (sessionKey.includes(key) || key.includes(sessionKey)) {
        return headers;
      }
    }
  }
  return latestAuthHeaders;
}

function getAdminClawBaseUrl(): string {
  return app.isPackaged
    ? 'https://admin.claw.chaohui.ai'
    : 'http://localhost:8082';
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
  const adminBaseUrl = getAdminClawBaseUrl();
  // 工具名从动态列表中取第一个，若列表为空则回退到历史默认值
  const toolName = latestToolDefinitions[0]?.function?.name ?? 'retrieve_fmp';
  const auth = getSecondBrainAuthHeaders(options.sessionKey);
  const authVal = auth.Authorization || auth.authorization;

  const body = JSON.stringify({
    name: toolName,
    arguments: {
      query: options.query,
      ...(options.topK !== undefined ? { topK: options.topK } : {}),
      ...(options.layer !== undefined ? { layer: options.layer } : {}),
    },
  });

  return new Promise((resolve) => {
    const parsedUrl = nodeUrl.parse(`${adminBaseUrl}/api/client/fmp/tool/execute`);
    const isHttps = parsedUrl.protocol === 'https:';
    const hostname = parsedUrl.hostname ?? '';
    const port = parsedUrl.port
      ? parseInt(parsedUrl.port, 10)
      : (isHttps ? 443 : 80);

    const reqHeaders: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    try {
      const version = app?.getVersion?.();
      if (version) {
        reqHeaders['X-Client-Version'] = version;
        reqHeaders['X-App-Platform'] = process.platform;
      }
    } catch {
      // 容错处理：版本号获取失败不影响第二大脑请求
    }
    if (authVal) {
      reqHeaders['Authorization'] = authVal;
    }

    const reqOptions: http.RequestOptions = {
      hostname,
      port,
      path: '/api/client/fmp/tool/execute',
      method: 'POST',
      headers: reqHeaders,
    };

    const requester = isHttps ? https : http;
    const req = requester.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          const parsed = JSON.parse(raw) as { success: boolean; data?: FmpRetrievePayload; error?: string };

          if (!parsed.success) {
            console.warn('[SecondBrainBridge] tool execute failed:', parsed.error || raw);
            resolve({
              content: [{ type: 'text', text: `第二大脑检索返回异常: ${parsed.error || '业务错误'}` }],
              isError: true,
            });
            return;
          }

          const formattedText = formatRetrieveResultToDocument(parsed.data ?? {});
          resolve({
            content: [{ type: 'text', text: formattedText }],
          });
        } catch (parseErr) {
          console.error('[SecondBrainBridge] failed to parse tool execute response:', parseErr);
          resolve({
            content: [{ type: 'text', text: `解析第二大脑检索响应失败: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` }],
            isError: true,
          });
        }
      });
      res.on('error', (err) => {
        console.error('[SecondBrainBridge] HTTP response error:', err);
        resolve({
          content: [{ type: 'text', text: `第二大脑检索网络异常: ${err.message}` }],
          isError: true,
        });
      });
    });

    req.on('error', (err) => {
      console.error('[SecondBrainBridge] HTTP request error:', err);
      resolve({
        content: [{ type: 'text', text: `第二大脑检索请求失败: ${err.message}` }],
        isError: true,
      });
    });

    req.write(body);
    req.end();
  });
}
