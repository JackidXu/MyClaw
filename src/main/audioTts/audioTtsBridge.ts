import crypto from 'crypto';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import { mainHttpClient } from '../libs/mainHttpClient';

export interface AudioTtsOptions {
  text: string;
  outputPath?: string;
  speaker?: string;
  speedRatio?: number;
  loudnessRate?: number;
  enableSubtitle?: boolean;
  sessionKey?: string;
}

export interface AudioTtsResult {
  filePath: string;
  format: string;
  sizeBytes: number;
  textWords: number;
  words?: any[];
}

/**
 * 将相对路径或未指定路径解析为本地安全的存储路径
 */
function resolveOutputPath(userOutputPath?: string, format = 'mp3'): string {
  if (userOutputPath && userOutputPath.trim()) {
    const rawPath = userOutputPath.trim();
    if (path.isAbsolute(rawPath)) {
      return rawPath;
    }
  }

  // 默认在 HeyClaw 工作区或临时目录生成
  const baseDir = path.join(app.getPath('userData'), 'generated-audio');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const filename = `tts-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${format}`;
  return path.join(baseDir, filename);
}

/**
 * 执行语音合成
 */
export async function executeAudioTts(
  options: AudioTtsOptions,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const text = options.text?.trim();

  if (!text) {
    return {
      content: [{ type: 'text', text: '必须提供待合成文本 (text)。' }],
      isError: true,
    };
  }

  try {
    const targetFormat = 'mp3';
    const targetPath = resolveOutputPath(options.outputPath, targetFormat);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 语速比例换算：火山引擎 speech_rate 范围为 [-50, 100]，默认 0 表示 1.0 倍速，100 表示 2.0 倍速，-50 表示 0.5 倍速
    let volcSpeechRate = 0;
    if (typeof options.speedRatio === 'number' && !isNaN(options.speedRatio)) {
      if (options.speedRatio >= 1.0) {
        volcSpeechRate = Math.min(100, Math.round((options.speedRatio - 1.0) * 100));
      } else {
        volcSpeechRate = Math.max(-50, Math.round((options.speedRatio - 1.0) * 100));
      }
    }

    const resp = await mainHttpClient.admin.post<{
      success: boolean;
      data?: {
        audioBase64: string;
        format: string;
        words?: any[];
        textWords?: number;
        sizeBytes?: number;
      };
      error?: string;
    }>('/api/client/tts/synthesize', {
      text,
      speaker: options.speaker || 'zh_female_vv_uranus_bigtts',
      format: targetFormat,
      sampleRate: 24000,
      speechRate: volcSpeechRate,
      loudnessRate: options.loudnessRate ?? 0,
      enableSubtitle: options.enableSubtitle ?? true,
    });

    if (!resp.data?.success || !resp.data?.data?.audioBase64) {
      throw new Error(resp.data?.error || '服务端返回的语音合成数据为空');
    }

    const { audioBase64, format, words, textWords } = resp.data.data;
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    await fs.promises.writeFile(targetPath, audioBuffer);

    const sections: string[] = ['### 语音合成完成'];
    sections.push(`**音频保存路径**: \`${targetPath}\``);
    sections.push(`**音频格式**: ${format.toUpperCase()} (24000Hz)`);
    sections.push(`**文件大小**: ${(audioBuffer.length / 1024).toFixed(1)} KB`);
    sections.push(`**计费字数**: ${textWords ?? text.length} 字`);

    if (Array.isArray(words) && words.length > 0) {
      const lastWord = words[words.length - 1];
      const durationSec = typeof lastWord?.endTime === 'number' ? lastWord.endTime.toFixed(2) : undefined;
      if (durationSec) {
        sections.push(`**音频时长**: 约 ${durationSec} 秒`);
      }
    }

    return {
      content: [{ type: 'text', text: sections.join('\n') }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `语音合成失败: ${message}` }],
      isError: true,
    };
  }
}
