/**
 * 主进程音频上传与预签名服务
 *
 * 统一收敛通过 PHP 业务后端 (/api/chaohuixie/claw/fmp/audio/upload) 获取 TOS 预签名上传凭据的能力，
 * 供主进程（ASR 转写、IM 媒体接收等）复用，确保全端对齐 status === 'success' && code === 1 业务规范。
 */

import type { UploadPresignResponse } from '../../shared/secondBrain/constants';
import { mainHttpClient } from '../libs/mainHttpClient';

interface SecondBrainApiResponse<T = unknown> {
  status: string;
  code: number;
  message?: string;
  data: T;
}

/**
 * 主进程获取音频 TOS 预签名上传参数
 */
export async function fetchAudioUploadPresignedUrl(): Promise<UploadPresignResponse> {
  const res = await mainHttpClient.biz.get<SecondBrainApiResponse<UploadPresignResponse>>(
    '/api/chaohuixie/claw/fmp/audio/upload',
  );

  if (!res.ok) {
    const errorDetail = res.error || `HTTP ${res.status}`;
    throw new Error(`获取音频预签名上传地址网络异常 (${errorDetail})`);
  }

  const body = res.data;
  if (!body || body.status !== 'success' || body.code !== 1 || !body.data?.upload_url) {
    throw new Error(`获取音频预签名上传地址失败: ${body?.message || res.error || '未知业务错误'}`);
  }

  return body.data;
}
