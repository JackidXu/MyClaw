/**
 * 录音 AI 智能纪要与总结服务
 *
 * 通过统一调用 admin-claw 服务端接口 (/api/client/recording/summary)
 * 由服务端统一调用 DeepSeek-V4.1-Flash 大模型进行商务纪要提炼与决策点提取。
 */

import type {
  RecordingExtractedItem,
  RecordingUtterance,
} from '../../shared/recordingCard/localRecording';
import { httpClient } from './httpClient';

export interface GeneratedSummaryResult {
  title?: string;
  summary: string;
  items: RecordingExtractedItem[];
}

export class RecordingSummaryService {
  /**
   * 基于逐字稿生成智能纪要与决策认知点
   */
  async generateSummary(params: {
    transcriptText: string;
    utterances?: RecordingUtterance[];
    originalFilename?: string;
  }): Promise<GeneratedSummaryResult> {
    const { transcriptText, utterances = [], originalFilename = '' } = params;

    if (!transcriptText || transcriptText.trim().length === 0) {
      return {
        title: originalFilename || '空白录音',
        summary: '本次录音未检测到有效语音交流内容。',
        items: [],
      };
    }

    const rawApiKey = localStorage.getItem('heyclaw_api_key') || '';
    const apiKey = rawApiKey.trim();

    const res = await httpClient.admin.post<{
      success: boolean;
      data: GeneratedSummaryResult;
      error?: string;
    }>('/api/client/recording/summary', {
      transcriptText,
      utterances,
      originalFilename,
      apiKey: apiKey ? (apiKey.startsWith('sk-') ? apiKey : `sk-${apiKey}`) : undefined,
    });

    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || '提炼 AI 纪要失败');
    }

    return res.data.data;
  }
}

export const recordingSummaryService = new RecordingSummaryService();
