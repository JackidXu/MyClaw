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

interface ApiResponse<T> {
  status?: string;
  code?: number;
  data?: T;
  message?: string;
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

// 存储全局或 session 维度的认证头与工具定义
let latestAuthHeaders: FmpAuthHeaders = {};
const authHeadersBySessionKey = new Map<string, FmpAuthHeaders>();
let latestToolDefinition: FmpToolDefinition | null = null;

export function updateSecondBrainToolDefinitions(tools?: FmpToolDefinition[] | null): void {
  if (Array.isArray(tools) && tools.length > 0) {
    const retrieveTool = tools.find(t => t.function?.name === 'retrieve_fmp') || tools[0];
    if (retrieveTool) {
      latestToolDefinition = retrieveTool;
    }
  }
}

export function getSecondBrainToolDefinition(): FmpToolDefinition | null {
  return latestToolDefinition;
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


function getRetrieveBaseUrl(): string {
  return app.isPackaged
    ? 'https://zhike.banchengyun.com'
    : 'https://dev-zhike.banchengyun.com';
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

/** 执行 /fmp/retrieve 接口调用（供 MCP bridge server 使用） */
export async function executeSecondBrainRetrieve(options: {
  query: string;
  topK?: number;
  sessionKey?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  return callPhpSecondBrainRetrieve(options.query, options.topK ?? 3, options.sessionKey) as Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
}

/**
 * 直接调用 PHP 第二大脑 RAG 检索接口
 * 供 OpenClaw retrieve_fmp / retrieve-fmp 工具在沙箱内通过 IPC 代理调用
 */
export async function callPhpSecondBrainRetrieve(
  query: string,
  topK: number = 3,
  sessionKey?: string
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const phpBaseUrl = getRetrieveBaseUrl();
  const apiPath = '/api/chaohuixie/claw/fmp/retrieve';
  const fullUrl = `${phpBaseUrl}${apiPath}`;

  const auth = getSecondBrainAuthHeaders(sessionKey);
  const parsedUrl = nodeUrl.parse(fullUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const body = JSON.stringify({ query, topK });

  const hostname = parsedUrl.hostname ?? '';
  const port = parsedUrl.port
    ? parseInt(parsedUrl.port, 10)
    : (isHttps ? 443 : 80);

  return new Promise((resolve) => {
    const reqHeaders: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };

    const authVal = auth.Authorization || auth.authorization;
    if (authVal) {
      reqHeaders['Authorization'] = authVal;
    }

    const reqOptions: http.RequestOptions = {
      hostname,
      port,
      path: apiPath,
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
          const parsed = JSON.parse(raw) as ApiResponse<FmpRetrievePayload>;

          if (parsed.status !== 'success' || parsed.code !== 1) {
            console.warn('[SecondBrainBridge] retrieve API business failure:', parsed.message || raw);
            resolve({
              content: [{ type: 'text', text: `第二大脑检索返回异常: ${parsed.message || '业务错误'}` }],
              isError: true,
            });
            return;
          }

          const formattedText = formatRetrieveResultToDocument(parsed.data ?? {});
          resolve({
            content: [{ type: 'text', text: formattedText }],
          });
        } catch (parseErr) {
          console.error('[SecondBrainBridge] failed to parse retrieve API response:', parseErr);
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
