/**
 * 充值与交易业务服务 (接入统一 httpClient)
 */

import { httpClient } from './httpClient';

const TRADE_API_BASE = import.meta.env.DEV
  ? 'https://dev-zhike.banchengyun.com'
  : 'https://zhike.banchengyun.com';

export interface RechargeSpecItem {
  version_id: number;
  name: string;
  amount: number;
  [key: string]: any;
}

export interface PayOrderResult {
  order_id: number | string;
  qrcode_url: string;
}

/**
 * 1. 获取充值规格列表
 */
export async function fetchRechargeSpecs(): Promise<{ success: boolean; data: RechargeSpecItem[]; error?: string }> {
  const url = `${TRADE_API_BASE}/api/chaohuixie/claw/trade/versionList`;
  const res = await httpClient.get(url);

  if (res.ok && res.data && res.data.code === 1) {
    return {
      success: true,
      data: res.data.data || [],
    };
  }

  return {
    success: false,
    data: [],
    error: res.data?.message || '获取充值规格失败',
  };
}

/**
 * 2. 发起充值下单
 */
export async function createPayOrder(params: {
  versionId: number;
  payChannel: 1 | 2; // 1: 微信, 2: 支付宝
  userId: number | string;
}): Promise<{ success: boolean; data?: PayOrderResult; error?: string }> {
  const url = `${TRADE_API_BASE}/api/chaohuixie/claw/trade/pay`;
  const res = await httpClient.post(url, {
    versionId: params.versionId,
    payChannel: params.payChannel,
    goodsAttach: Number(params.userId),
  });

  if (res.ok && res.data && res.data.code === 1) {
    return {
      success: true,
      data: res.data.data,
    };
  }

  return {
    success: false,
    error: res.data?.message || '获取付款码失败，请重试',
  };
}

/**
 * 3. 查询订单支付状态
 */
export async function queryPayStatus(orderId: number | string): Promise<{ success: boolean; paymentStatus: number; error?: string }> {
  const query = new URLSearchParams({ orderId: String(orderId) }).toString();
  const url = `${TRADE_API_BASE}/api/chaohuixie/claw/trade/payState?${query}`;
  const res = await httpClient.get(url);

  if (res.ok && res.data && res.data.code === 1) {
    const statusData = res.data.data || {};
    return {
      success: true,
      paymentStatus: Number(statusData.payment_status || 0),
    };
  }

  return {
    success: false,
    paymentStatus: 0,
    error: res.data?.message || '查询订单状态失败',
  };
}
