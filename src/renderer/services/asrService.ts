/**
 * 录音转写客户端服务 (ASR Service)
 *
 * 渲染进程封装，直接复用 src/shared/asr/asrCore.ts 核心状态机与契约。
 */

import {
  calcAdaptivePollInterval,
  type PollAsrOptions,
  pollAsrResultCore,
  queryAsrTaskCore,
  type QueryAsrTaskResult,
  submitAsrTaskCore,
  type SubmitAsrTaskParams,
  type SubmitAsrTaskResult,
} from '../../shared/asr/asrCore';
import type { RecordingUtterance } from '../../shared/recordingCard/localRecording';
import { httpClient } from './httpClient';

export type {
  PollAsrOptions,
  QueryAsrTaskResult,
  SubmitAsrTaskParams,
  SubmitAsrTaskResult,
};
export { calcAdaptivePollInterval };

export class AsrService {
  /**
   * 提交音频转写任务
   */
  async submitTask(params: SubmitAsrTaskParams): Promise<SubmitAsrTaskResult> {
    return submitAsrTaskCore(
      (path, body) => httpClient.admin.post(path, body),
      params,
    );
  }

  /**
   * 单次查询转写任务进度与结果
   */
  async queryTask(taskId: string, durationSec?: number): Promise<QueryAsrTaskResult> {
    return queryAsrTaskCore(
      (path, body) => httpClient.admin.post(path, body),
      taskId,
      durationSec,
    );
  }

  /**
   * 轮询等待转写任务完成
   */
  async pollAsrResult(
    taskId: string,
    options: PollAsrOptions & { durationSec?: number } = {},
  ): Promise<{ text: string; utterances: RecordingUtterance[] }> {
    return pollAsrResultCore(
      (path, body) => httpClient.admin.post(path, body),
      taskId,
      options,
    );
  }
}

export const asrService = new AsrService();
