/**
 * 账单与算力流水服务
 */

import { configService } from './config';
import { httpClient } from './httpClient';

export interface BillingLogItem {
  id: number;
  type: number; // 1=充值, 2=消费, 3=管理, 4=错误, 5=系统
  content: string;
  model_name: string;
  quota: number;
  created_at: number;
}

export interface BillingLogsResult {
  success: boolean;
  logs: BillingLogItem[];
  error?: string;
}

/**
 * 拉取当前用户的 Token 消费与充值流水
 */
export async function fetchBillingLogs(): Promise<BillingLogsResult> {
  const config = configService.getConfig();
  const oneapiConfig = config.providers?.['oneapi'];
  const apiKey = oneapiConfig?.apiKey?.trim();
  const baseUrl = oneapiConfig?.baseUrl?.trim() || 'https://token.chaohui.ai/v1';

  if (!apiKey) {
    return {
      success: false,
      logs: [],
      error: '未检测到大模型对话令牌，请先登录或输入激活码',
    };
  }

  let apiRoot = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(apiRoot)) {
    apiRoot = `https://${apiRoot}`;
  }
  if (apiRoot.endsWith('/v1')) {
    apiRoot = apiRoot.replace(/\/v1$/, '');
  }

  const url = `${apiRoot}/api/log/token?key=${apiKey}&page_size=200`;

  const resp = await httpClient.get(url, {
    Authorization: `Bearer ${apiKey}`,
  });

  if (!resp.ok) {
    return {
      success: false,
      logs: [],
      error: resp.data?.error || `网络请求失败 [HTTP ${resp.status}]`,
    };
  }

  const resData = resp.data;
  if (resData && typeof resData === 'object' && resData.success) {
    return {
      success: true,
      logs: resData.data || [],
    };
  }

  return {
    success: false,
    logs: [],
    error: resData?.message || '获取账单流水失败',
  };
}
