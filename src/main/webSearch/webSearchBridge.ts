import { app } from 'electron';
import * as http from 'http';
import * as https from 'https';
import * as nodeUrl from 'url';

import { getSecondBrainAuthHeaders } from '../secondBrain/secondBrainBridge';

export interface WebSearchResultItem {
  title: string;
  url: string;
  summary: string;
  siteName?: string;
  publishDate?: string;
}

export interface WebSearchPayload {
  query: string;
  total: number;
  results: WebSearchResultItem[];
}

function getAdminClawBaseUrl(): string {
  if (app.isPackaged) {
    return 'https://admin.claw.chaohui.ai';
  }
  return process.env.ADMIN_CLAW_API_BASE || 'http://localhost:8082';
}

/**
 * 将结构化搜索结果格式化为大模型易读的 Markdown 格式
 */
export function formatWebSearchResults(payload: WebSearchPayload): string {
  const { query, results } = payload;
  if (!results || results.length === 0) {
    return `网络搜索关键词 "${query}" 未找到相关结果。`;
  }

  const sections: string[] = [
    `### 联网搜索结果（关键词: "${query}"，共找到 ${results.length} 条）\n`,
  ];

  results.forEach((item, index) => {
    const title = item.title?.trim() || '无标题';
    const url = item.url?.trim() || '';
    const siteName = item.siteName?.trim() ? `【来源: ${item.siteName.trim()}】` : '';
    const date = item.publishDate?.trim() ? `（发布时间: ${item.publishDate.trim()}）` : '';
    const summary = item.summary?.trim() || '无摘要内容';

    sections.push(
      `#### ${index + 1}. [${title}](${url}) ${siteName} ${date}\n${summary}`,
    );
  });

  return sections.join('\n\n');
}

/**
 * 统一执行联网搜索：调用 admin-claw 的 /api/client/web-search 接口
 */
export async function executeWebSearch(options: {
  query: string;
  count?: number;
  sessionKey?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const query = options.query.trim();
  if (!query) {
    return {
      content: [{ type: 'text', text: '搜索关键词 query 不能为空。' }],
      isError: true,
    };
  }

  const adminBaseUrl = getAdminClawBaseUrl();
  const auth = getSecondBrainAuthHeaders(options.sessionKey);
  const authVal = auth.Authorization || auth.authorization;

  const body = JSON.stringify({
    query,
    count: options.count || 5,
  });

  return new Promise((resolve) => {
    const parsedUrl = nodeUrl.parse(`${adminBaseUrl}/api/client/web-search`);
    const isHttps = parsedUrl.protocol === 'https:';
    const hostname = parsedUrl.hostname ?? 'localhost';
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
      // 容错处理：版本号获取失败不影响搜索请求
    }
    if (authVal) {
      reqHeaders['Authorization'] = authVal;
    }

    const reqOptions: http.RequestOptions = {
      hostname,
      port,
      path: '/api/client/web-search',
      method: 'POST',
      headers: reqHeaders,
    };

    const requester = isHttps ? https : http;
    const req = requester.request(reqOptions, (res) => {
      let resBody = '';
      res.on('data', (chunk) => {
        resBody += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(resBody);
          if (parsed && parsed.success && parsed.data) {
            const formatted = formatWebSearchResults(parsed.data as WebSearchPayload);
            resolve({
              content: [{ type: 'text', text: formatted }],
            });
          } else {
            resolve({
              content: [
                {
                  type: 'text',
                  text: `联网搜索返回异常: ${parsed?.error || parsed?.message || '未知错误'}`,
                },
              ],
              isError: true,
            });
          }
        } catch {
          resolve({
            content: [
              {
                type: 'text',
                text: `联网搜索响应解析失败 (HTTP ${res.statusCode}): ${resBody.slice(0, 200)}`,
              },
            ],
            isError: true,
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        content: [{ type: 'text', text: `联网搜索请求异常: ${err.message}` }],
        isError: true,
      });
    });

    req.setTimeout(30000, () => {
      req.destroy(new Error('联网搜索请求超时 (30s)'));
    });

    req.write(body);
    req.end();
  });
}
