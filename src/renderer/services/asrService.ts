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
  enable_speaker_info?: boolean;
  ssd_version?: string;
  show_utterances?: boolean;
}

export interface SubmitAsrTaskResult {
  task_id: string;
  log_id?: string;
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
  /** 轮询间隔毫秒数，默认 2500ms */
  intervalMs?: number;
  /** 超时毫秒数，默认 10 分钟 (600,000ms) */
  timeoutMs?: number;
  /** 进度状态回调 */
  onProgress?: (message: string) => void;
  /** 是否已被外部取消 */
  isCancelled?: () => boolean;
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
    }>('/api/client/asr/submit', params);

    if (!res.data.success || !res.data.data?.task_id) {
      throw new Error(res.data.error || '提交录音转写任务失败');
    }

    return res.data.data;
  }

  /**
   * 单次查询转写任务进度与结果
   */
  async queryTask(taskId: string): Promise<QueryAsrTaskResult> {
    const res = await httpClient.admin.post<{
      success: boolean;
      data: QueryAsrTaskResult;
      error?: string;
    }>('/api/client/asr/query', { task_id: taskId });

    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || '查询录音转写进度失败');
    }

    return res.data.data;
  }

  /**
   * 轮询等待转写任务完成
   */
  async pollAsrResult(
    taskId: string,
    options: PollAsrOptions = {},
  ): Promise<{ text: string; utterances: RecordingUtterance[] }> {
    const {
      intervalMs = 2500,
      timeoutMs = 600000,
      onProgress,
      isCancelled,
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (isCancelled?.()) {
        throw new Error('用户已取消转写');
      }

      const res = await this.queryTask(taskId);

      if (res.status === 'completed') {
        return {
          text: res.text || '',
          utterances: res.utterances || [],
        };
      }

      if (res.status === 'failed') {
        throw new Error(res.error || res.message || '语音转写处理失败');
      }

      // 处理中状态：统一展示友好中文进度，不透传底层英文消息或技术细节
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      onProgress?.(`语音识别转写中 (${elapsedSec}s)...`);

      // 等待下一次轮询
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('语音转写超时，请稍后在列表中重试或检查音频质量');
  }
}

export const asrService = new AsrService();
