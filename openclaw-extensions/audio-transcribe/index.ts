import { Type } from '@sinclair/typebox';
// @ts-expect-error plugin-sdk exists natively inside the openclaw gateway sandbox
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

type PluginConfig = {
  callbackUrl: string;
  secret: string;
  requestTimeoutMs: number;
};

type AudioTranscribeRequest = {
  filePath?: string;
  audioUrl?: string;
  prompt?: string;
  sessionKey: string;
  toolCallId: string;
};

type AudioTranscribeResponse = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
};

const DEFAULT_TIMEOUT_MS = 300_000; // 5 分钟超时，满足长音频转写等待

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parsePluginConfig = (value: unknown): PluginConfig => {
  const raw = isRecord(value) ? value : {};
  return {
    callbackUrl: typeof raw.callbackUrl === 'string' ? raw.callbackUrl.trim() : '',
    secret: typeof raw.secret === 'string' ? raw.secret.trim() : '',
    requestTimeoutMs: typeof raw.requestTimeoutMs === 'number' ? raw.requestTimeoutMs : DEFAULT_TIMEOUT_MS,
  };
};

async function callAudioTranscribeBridge(
  config: PluginConfig,
  request: AudioTranscribeRequest,
): Promise<AudioTranscribeResponse> {
  const controller = new AbortController();
  const timeoutMs = config.requestTimeoutMs || DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.callbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mcp-bridge-secret': config.secret,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Audio transcribe HTTP ${response.status}: ${text.trim() || response.statusText}`);
    }

    if (!text.trim()) {
      return { content: [{ type: 'text', text: '（未识别到有效的音频文字内容）' }] };
    }

    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.content)) {
      return parsed as AudioTranscribeResponse;
    }

    return {
      content: [{ type: 'text', text: typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2) }],
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { content: [{ type: 'text', text: '音频转写请求超时，请稍后重试。' }], isError: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `音频转写失败: ${message}` }], isError: true };
  } finally {
    clearTimeout(timer);
  }
}

const plugin = {
  id: 'audio-transcribe',
  name: 'AudioTranscribe',
  description: 'Audio speech-to-text transcription powered by HeyClaw and Volcano Engine ASR.',
  configSchema: {
    parse(value: unknown): PluginConfig {
      return parsePluginConfig(value);
    },
  },

  register(api: OpenClawPluginApi) {
    const config = parsePluginConfig(api.pluginConfig);

    if (!config.callbackUrl) {
      api.logger.info('[audio-transcribe] skipped: callbackUrl not configured.');
      return;
    }

    api.registerTool((ctx: any) => {
      const sessionKey = ctx.sessionKey ?? '';

      return {
        name: 'heyclaw_audio_transcribe',
        label: 'Audio Transcribe',
        description:
          '音频与录音文件语音识别转写工具。当用户提供了音频文件（如 .mp3, .m4a, .wav, .ogg, .flac, .aac 等格式）或音频链接，需要读取其中的语音内容、整理会议纪要、提炼关键信息或根据录音写文案时，必须调用本工具。绝对禁止用 view_file 或 read 尝试直接读取音频二进制。',
        parameters: Type.Object({
          filePath: Type.Optional(Type.String({ description: '待转写的本地音频文件绝对路径' })),
          audioUrl: Type.Optional(Type.String({ description: '待转写的网络音频文件链接（支持公网 http/https 或 tos:// 链接）' })),
          prompt: Type.Optional(Type.String({ description: '转写场景提示或领域专业词指引（可选）' })),
        }),
        async execute(id: string, params: unknown) {
          const rawArgs = (params ?? {}) as Record<string, unknown>;
          const filePath = typeof rawArgs.filePath === 'string' ? rawArgs.filePath.trim() : undefined;
          const audioUrl = typeof rawArgs.audioUrl === 'string' ? rawArgs.audioUrl.trim() : undefined;
          const prompt = typeof rawArgs.prompt === 'string' ? rawArgs.prompt.trim() : undefined;

          if (!filePath && !audioUrl) {
            return {
              content: [{ type: 'text', text: 'heyclaw_audio_transcribe 必须提供 filePath（本地音频路径）或 audioUrl（网络音频链接）其一。' }],
              isError: true,
            };
          }

          try {
            api.logger.info(`[audio-transcribe] tool invoked: toolCallId=${id} filePath="${filePath || ''}" audioUrl="${audioUrl || ''}"`);
            const startedAt = Date.now();
            const result = await callAudioTranscribeBridge(config, {
              filePath,
              audioUrl,
              prompt,
              sessionKey,
              toolCallId: id,
            });
            api.logger.info(`[audio-transcribe] completed: toolCallId=${id} elapsedMs=${Date.now() - startedAt} isError=${result.isError === true}`);
            return result;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            api.logger.error(`[audio-transcribe] tool failed: toolCallId=${id} error=${message}`);
            return { content: [{ type: 'text', text: `音频转写失败: ${message}` }], isError: true };
          }
        },
      };
    });

    api.logger.info('[audio-transcribe] registered heyclaw_audio_transcribe tool.');
  },
};

export default plugin;
