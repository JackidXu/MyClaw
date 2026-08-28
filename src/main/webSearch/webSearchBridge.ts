import { mainHttpClient } from '../libs/mainHttpClient';

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

  const res = await mainHttpClient.admin.post<{ success: boolean; data?: WebSearchPayload; error?: string; message?: string }>(
    '/api/client/web-search',
    {
      query,
      count: options.count || 5,
    },
  );

  if (!res.ok || !res.data || !res.data.success) {
    const errorMsg = res.data?.error || res.data?.message || res.error || '未知错误';
    return {
      content: [{ type: 'text', text: `联网搜索返回异常: ${errorMsg}` }],
      isError: true,
    };
  }

  const formatted = formatWebSearchResults(res.data.data as WebSearchPayload);
  return {
    content: [{ type: 'text', text: formatted }],
  };
}
