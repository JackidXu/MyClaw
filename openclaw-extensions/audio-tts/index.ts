import { Type } from '@sinclair/typebox';
// @ts-expect-error plugin-sdk exists natively inside the openclaw gateway sandbox
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

type PluginConfig = {
  callbackUrl: string;
  secret: string;
};

type AudioTtsRequest = {
  text: string;
  outputPath?: string;
  speaker?: string;
  speedRatio?: number;
  loudnessRate?: number;
  enableSubtitle?: boolean;
  sessionKey: string;
  toolCallId: string;
};

type AudioTtsResponse = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parsePluginConfig = (value: unknown): PluginConfig => {
  const raw = isRecord(value) ? value : {};
  return {
    callbackUrl: typeof raw.callbackUrl === 'string' ? raw.callbackUrl.trim() : '',
    secret: typeof raw.secret === 'string' ? raw.secret.trim() : '',
  };
};

async function callAudioTtsBridge(
  config: PluginConfig,
  request: AudioTtsRequest,
): Promise<AudioTtsResponse> {
  try {
    const response = await fetch(config.callbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mcp-bridge-secret': config.secret,
      },
      body: JSON.stringify(request),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Audio TTS HTTP ${response.status}: ${text.trim() || response.statusText}`);
    }

    if (!text.trim()) {
      return { content: [{ type: 'text', text: '（语音合成服务未返回内容）' }] };
    }

    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.content)) {
      return parsed as AudioTtsResponse;
    }

    return {
      content: [{ type: 'text', text: typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `语音合成调用失败: ${message}` }], isError: true };
  }
}

const plugin = {
  id: 'audio-tts',
  name: 'AudioTTS',
  description: 'Text-to-speech audio synthesis powered by HeyClaw and Volcano Engine Doubao TTS 2.0.',
  configSchema: {
    parse(value: unknown): PluginConfig {
      return parsePluginConfig(value);
    },
  },

  register(api: OpenClawPluginApi) {
    const config = parsePluginConfig(api.pluginConfig);

    if (!config.callbackUrl) {
      api.logger.info('[audio-tts] skipped: callbackUrl not configured.');
      return;
    }

    api.registerTool((ctx: any) => {
      const sessionKey = ctx.sessionKey ?? '';

      return {
        name: 'heyclaw_audio_tts',
        label: 'Audio TTS',
        description:
          '高品质文本转语音合成（TTS）工具。当需要将文案、台词、短视频旁白、演讲稿朗读并导出为高保真语音文件（MP3）时，调用本工具。支持字级别时间戳、调节语速与高自然度情感声线。',
        parameters: Type.Object({
          text: Type.String({ description: '需要转换为语音的文本内容' }),
          outputPath: Type.Optional(Type.String({ description: '输出音频文件的绝对路径，若不指定则自动在系统生成目录生成 MP3 文件' })),
          speaker: Type.Optional(Type.String({ description: '音色ID，默认使用官方优质女声 zh_female_vv_uranus_bigtts' })),
          speedRatio: Type.Optional(Type.Number({ description: '语速比例，默认 1.0，范围 0.5 到 2.0' })),
          loudnessRate: Type.Optional(Type.Number({ description: '音量调节，默认 0，范围 -50 到 100' })),
          enableSubtitle: Type.Optional(Type.Boolean({ description: '是否生成字级别时间戳，默认 true' })),
        }),
        execute: async (toolCallId: string, params: any) => {
          api.logger.info(`[audio-tts] heyclaw_audio_tts tool called with text length: ${params.text?.length || 0}`);

          const text = typeof params?.text === 'string' ? params.text.trim() : '';
          if (!text) {
            return {
              content: [{ type: 'text', text: 'heyclaw_audio_tts 必须提供待合成的文本内容 text。' }],
            };
          }

          const response = await callAudioTtsBridge(config, {
            text,
            outputPath: typeof params?.outputPath === 'string' ? params.outputPath.trim() : undefined,
            speaker: typeof params?.speaker === 'string' ? params.speaker.trim() : undefined,
            speedRatio: typeof params?.speedRatio === 'number' ? params.speedRatio : undefined,
            loudnessRate: typeof params?.loudnessRate === 'number' ? params.loudnessRate : undefined,
            enableSubtitle: typeof params?.enableSubtitle === 'boolean' ? params.enableSubtitle : undefined,
            sessionKey,
            toolCallId,
          });

          return response;
        },
      };
    });

    api.logger.info('[audio-tts] registered heyclaw_audio_tts tool.');
  },
};

export default plugin;

