import fs from 'fs';
import path from 'path';

import {
  pollAsrResultCore,
  submitAsrTaskCore,
} from '../../shared/asr/asrCore';
import type { RecordingUtterance } from '../../shared/recordingCard/localRecording';
import { mainHttpClient } from '../libs/mainHttpClient';
import { fetchAudioUploadPresignedUrl } from '../services/audioUploadService';

export interface AudioTranscribeOptions {
  filePath?: string;
  audioUrl?: string;
  prompt?: string;
  sessionKey?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  '.amr': 'audio/amr',
  '.opus': 'audio/ogg',
};

function formatMsToTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * 将音频转写结果格式化为易于大模型理解和提炼的结构化 Markdown 文本
 */
export function formatAudioTranscribeResult(params: {
  fileName?: string;
  durationSec?: number;
  text: string;
  utterances?: RecordingUtterance[];
}): string {
  const { fileName, durationSec, text, utterances } = params;
  const sections: string[] = ['### 音频转写结果'];

  const metaParts: string[] = [];
  if (fileName) metaParts.push(`**文件名称**: ${fileName}`);
  if (durationSec && durationSec > 0) {
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    metaParts.push(`**音频时长**: ${mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`}`);
  }
  if (metaParts.length > 0) {
    sections.push(metaParts.join(' | '));
  }

  // 说话人分段逐字稿
  if (Array.isArray(utterances) && utterances.length > 0) {
    sections.push('#### 分段记录（带时间戳与说话人）：');
    for (const u of utterances) {
      const timeStr = `[${formatMsToTime(u.startTime)} ~ ${formatMsToTime(u.endTime)}]`;
      const speakerStr = u.speaker ? `**${u.speaker}**: ` : '';
      sections.push(`${timeStr} ${speakerStr}${u.text}`);
    }
    sections.push('\n#### 完整逐字稿正文：');
    sections.push(text.trim() || '（无正文）');
  } else {
    sections.push('#### 逐字稿内容：');
    sections.push(text.trim() || '（未识别到有效文字）');
  }

  return sections.join('\n\n');
}

/**
 * 统一执行音频转写
 * 1. 若为本地路径，复用公共 fetchAudioUploadPresignedUrl 获取预签名并直传 TOS
 * 2. 复用 submitAsrTaskCore 向 Node 后端提交任务
 * 3. 复用 pollAsrResultCore 轮询状态机等待转写完成
 */
export async function executeAudioTranscribe(
  options: AudioTranscribeOptions,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const filePath = options.filePath?.trim();
  let audioUrl = options.audioUrl?.trim();

  if (!filePath && !audioUrl) {
    return {
      content: [{ type: 'text', text: '必须提供音频本地文件路径 filePath 或网络链接 audioUrl。' }],
      isError: true,
    };
  }

  const fileName = filePath ? path.basename(filePath) : undefined;
  const fileExt = filePath ? path.extname(filePath).toLowerCase() : '';

  try {
    // 步骤 1: 若为本地音频文件，使用公共服务上传至 TOS
    if (filePath) {
      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: 'text', text: `指定的本地音频文件不存在: ${filePath}` }],
          isError: true,
        };
      }

      // 复用公共 fetchAudioUploadPresignedUrl
      const presign = await fetchAudioUploadPresignedUrl();
      const fileBuffer = await fs.promises.readFile(filePath);
      const mimeType = MIME_BY_EXT[fileExt] || 'application/octet-stream';

      // PUT 直传 TOS
      const uploadResp = await fetch(presign.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
        },
        body: fileBuffer,
      });

      if (!uploadResp.ok) {
        const uploadErr = await uploadResp.text().catch(() => '');
        return {
          content: [{ type: 'text', text: `音频上传至云存储失败 (HTTP ${uploadResp.status}): ${uploadErr}` }],
          isError: true,
        };
      }

      audioUrl = presign.tos_url || presign.upload_url.split('?')[0];
      if (!audioUrl) {
        audioUrl = `tos://chaohui/${presign.key}`;
      }
    }

    if (!audioUrl) {
      return {
        content: [{ type: 'text', text: '未能解析有效的音频地址' }],
        isError: true,
      };
    }

    // 步骤 2: 复用 submitAsrTaskCore 提交任务
    const formatName = fileExt ? fileExt.replace(/^\./, '') : 'mp3';
    const submitResult = await submitAsrTaskCore(
      (path, body) => mainHttpClient.admin.post(path, body),
      {
        audioUrl,
        format: formatName === 'ogg' ? 'ogg' : formatName,
        codec: formatName === 'ogg' ? 'opus' : undefined,
      },
    );

    // 步骤 3: 复用 pollAsrResultCore 轮询状态机
    const asrResult = await pollAsrResultCore(
      (path, body) => mainHttpClient.admin.post(path, body),
      submitResult.taskId,
    );

    let durationSec = 0;
    if (asrResult.utterances && asrResult.utterances.length > 0) {
      const maxEndMs = Math.max(...asrResult.utterances.map(u => Number(u.endTime) || 0));
      if (maxEndMs > 0) {
        durationSec = Math.ceil(maxEndMs / 1000);
      }
    }

    const formatted = formatAudioTranscribeResult({
      fileName,
      durationSec,
      text: asrResult.text || '',
      utterances: asrResult.utterances,
    });

    return {
      content: [{ type: 'text', text: formatted }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `音频转写失败: ${message}` }],
      isError: true,
    };
  }
}
