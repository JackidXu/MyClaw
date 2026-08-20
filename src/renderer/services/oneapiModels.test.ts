import { describe, expect, it } from 'vitest';

import { parseOneApiChatModels } from './oneapiModels';

describe('parseOneApiChatModels', () => {
  it('should filter out custom models with owned_by === "custom"', () => {
    const rawModels = [
      { id: 'DeepSeek-V4-flash', owned_by: 'volcengine' },
      { id: 'DeepSeek-V4-pro', owned_by: 'volcengine' },
      { id: 'Doubao-embedding', owned_by: 'custom' },
      { id: 'Custom-GPT', owned_by: 'custom' },
    ];

    const result = parseOneApiChatModels(rawModels);
    expect(result).toHaveLength(2);
    expect(result.map(m => m.id)).toEqual(['DeepSeek-V4-flash', 'DeepSeek-V4-pro']);
  });

  it('should filter out image and video generation models from chat models', () => {
    const rawModels = [
      { id: 'DeepSeek-V4-flash', owned_by: 'volcengine' },
      { id: 'dall-e-3', owned_by: 'openai' },
      { id: 'flux-schnell', owned_by: 'black-forest-labs' },
      { id: 'cogvideox-flash', owned_by: 'zhipu' },
      { id: 'seedance-v1', owned_by: 'volcengine' },
      { id: 'gpt-4o', owned_by: 'openai' },
    ];

    const result = parseOneApiChatModels(rawModels);
    expect(result.map(m => m.id)).toEqual(['DeepSeek-V4-flash', 'gpt-4o']);
  });

  it('should return empty array for empty or invalid input', () => {
    expect(parseOneApiChatModels([])).toEqual([]);
    expect(parseOneApiChatModels(null as any)).toEqual([]);
    expect(parseOneApiChatModels(undefined as any)).toEqual([]);
  });
});
