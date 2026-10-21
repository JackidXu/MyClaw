/**
 * 录音转写客户端服务 (ASR Service)
 *
 * 通过 httpClient 调用 admin-claw 服务端接口，对接火山引擎豆包录音文件识别大模型 2.0。
 */

import type { RecordingUtterance } from '../../shared/recordingCard/localRecording';
import { httpClient } from './httpClient';

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
}

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

export class AsrService {
  /**
   * 提交音频转写任务
   */
  async submitTask(params: SubmitAsrTaskParams): Promise<SubmitAsrTaskResult> {
    const res = await httpClient.admin.post<{
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
  async queryTask(taskId: string, durationSec?: number): Promise<QueryAsrTaskResult> {
    const res = await httpClient.admin.post<{
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
   * 轮询等待转写任务完成
   *
   * 【核心架构设计】：完全由服务端查询接口状态驱动终态，客户端绝对不自作主张判定超时失败！
   * 只要任务处于 processing（45000001 等排队或处理中），客户端平缓退避轮询，绝不误杀正在 GPU 队列中计算的长音频。
   */
  async pollAsrResult(
    taskId: string,
    options: PollAsrOptions & { durationSec?: number } = {},
  ): Promise<{ text: string; utterances: RecordingUtterance[] }> {
    const {
      durationSec,
      intervalMs = calcAdaptivePollInterval(durationSec),
      onProgress,
      isCancelled,
    } = options;

    const baseIntervalMs = Math.max(10000, intervalMs);
    const startTime = Date.now();

    while (true) {
      if (isCancelled?.()) {
        throw new Error('用户已取消转写');
      }

      const res = await this.queryTask(taskId, durationSec);

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
      // - 1分钟内: 保持 baseIntervalMs (>= 10s)
      // - 1~5分钟: 在基础间隔上适度延长 1.2 倍
      // - 5分钟以上: 延长至 20s~30s，大幅节约网络消耗，静候火山处理完成
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
}

export const asrService = new AsrService();
