/**
 * ASR 核心服务抽象与轮询状态机 (Single Source of Truth)
 *
 * 供渲染进程 (asrService) 与主进程 (audioTranscribeBridge) 共同复用，
 * 严格收敛对 admin-claw 的 /api/client/asr/submit 与 /api/client/asr/query 接口契约，
 * 绝不在任何业务模块中重复手写请求与轮询逻辑。
 */

import type { RecordingUtterance } from '../recordingCard/localRecording';

export interface SubmitAsrTaskParams {
  audioUrl: string;
  format?: string;
  codec?: string;
  rate?: number;
  channel?: number;
  bits?: number;
  enableSpeakerInfo?: boolean;
  ssdVersion?: string;
  showUtterances?: boolean;
}

export interface SubmitAsrTaskResult {
  taskId: string;
  logId?: string;
}

export interface QueryAsrTaskResult {
  success: boolean;
  status: 'processing' | 'completed' | 'failed';
  text?: string;
  utterances?: RecordingUtterance[];
  statusCode?: string;
  message?: string;
  error?: string;
}

export interface PollAsrOptions {
  /** 轮询基础间隔毫秒数，未指定时由 durationSec 自动推算，严格保证最短 >= 10,000ms (10s) */
  intervalMs?: number;
  /** 进度状态回调 */
  onProgress?: (message: string) => void;
  /** 是否已被外部取消 */
  isCancelled?: () => boolean;
  /** 最大等待毫秒数（默认 300,000ms = 5分钟） */
  maxTimeoutMs?: number;
}

/** 抽象的 HTTP POST 执行函数类型 */
export type AsrHttpPostExecutor = <T = any>(
  path: string,
  body?: unknown,
) => Promise<{ ok: boolean; status: number; data: T; error?: string }>;

/**
 * 根据录音时长自适应计算基础轮询间隔（严格保证最短不低于 10s）
 *
 * @param durationSec 音频时长（秒）
 * @returns 毫秒间隔数 (>= 10,000ms)
 */
export function calcAdaptivePollInterval(durationSec?: number): number {
  if (!durationSec || durationSec <= 300) {
    return 10000; // <5分钟: 10s
  }
  if (durationSec <= 1800) {
    return 15000; // 5~30分钟: 15s
  }
  if (durationSec <= 3600) {
    return 20000; // 30~60分钟: 20s
  }
  return 30000; // >1小时: 30s
}

/**
 * 提交音频转写任务
 */
export async function submitAsrTaskCore(
  httpPost: AsrHttpPostExecutor,
  params: SubmitAsrTaskParams,
): Promise<SubmitAsrTaskResult> {
  const res = await httpPost<{
    success: boolean;
    data: SubmitAsrTaskResult;
    error?: string;
    message?: string;
  }>('/api/client/asr/submit', params);

  const actualError = res.error || res.data?.error || res.data?.message;

  if (!res.ok || !res.data?.success || !res.data?.data?.taskId) {
    throw new Error(actualError || '提交录音转写任务失败');
  }

  return res.data.data;
}

/**
 * 单次查询转写任务进度与结果
 */
export async function queryAsrTaskCore(
  httpPost: AsrHttpPostExecutor,
  taskId: string,
  durationSec?: number,
): Promise<QueryAsrTaskResult> {
  const res = await httpPost<{
    success: boolean;
    data: QueryAsrTaskResult;
    error?: string;
    message?: string;
  }>('/api/client/asr/query', {
    taskId,
    durationSec: durationSec && durationSec > 0 ? durationSec : undefined,
  });

  const actualError = res.error || res.data?.error || res.data?.message;

  if (!res.ok || !res.data?.success || !res.data?.data) {
    throw new Error(actualError || '查询录音转写进度失败');
  }

  return res.data.data;
}

/**
 * 轮询等待转写任务完成（完全由服务端接口状态驱动终态，绝不自作主张判超时）
 */
export async function pollAsrResultCore(
  httpPost: AsrHttpPostExecutor,
  taskId: string,
  options: PollAsrOptions & { durationSec?: number } = {},
): Promise<{ text: string; utterances: RecordingUtterance[] }> {
  const {
    durationSec,
    intervalMs = calcAdaptivePollInterval(durationSec),
    onProgress,
    isCancelled,
    maxTimeoutMs = 300_000,
  } = options;

  const baseIntervalMs = Math.max(10000, intervalMs);
  const startTime = Date.now();

  while (true) {
    if (isCancelled?.()) {
      throw new Error('用户已取消转写');
    }

    if (Date.now() - startTime > maxTimeoutMs) {
      throw new Error(`音频转写等待超时（已等待超过 ${Math.round(maxTimeoutMs / 1000)} 秒），请稍后重试`);
    }

    const res = await queryAsrTaskCore(httpPost, taskId, durationSec);

    // 终态 1: 识别成功
    if (res.status === 'completed') {
      return {
        text: res.text || '',
        utterances: res.utterances || [],
      };
    }

    // 终态 2: 服务端明确返回失败（音频损坏/无法下载/过期丢失等）
    if (res.status === 'failed') {
      throw new Error(res.error || res.message || '语音转写处理失败');
    }

    // 运行中状态 (processing / 45000001)：展示友好中文进度
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    onProgress?.(`语音识别转写中 (${elapsedSec}s)...`);

    // 渐进式退避策略：
    let nextDelay = baseIntervalMs;
    if (elapsedSec > 300) {
      nextDelay = Math.max(20000, Math.min(30000, Math.round(baseIntervalMs * 1.5)));
    } else if (elapsedSec > 60) {
      nextDelay = Math.max(12000, Math.round(baseIntervalMs * 1.2));
    }

    // 增加随机抖动 (±400ms)，避免并发轮询共振
    const jitter = Math.floor(Math.random() * 800) - 400;
    const actualInterval = Math.max(10000, nextDelay + jitter);

    await new Promise(resolve => setTimeout(resolve, actualInterval));
  }
}
