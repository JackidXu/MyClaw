import { describe, expect, test, vi } from 'vitest';

import {
  getIMSessionDisplayTitle,
  getIMSessionPlatformLogo,
} from './imSessionDisplay';

describe('getIMSessionDisplayTitle', () => {
  test('strips only the matching platform prefix', () => {
    expect(getIMSessionDisplayTitle('[微信] group:o9cq', 'weixin')).toEqual({
      title: 'group:o9cq',
      strippedPrefix: true,
    });
    expect(getIMSessionDisplayTitle('[微信] group:o9cq', 'feishu')).toEqual({
      title: '[微信] group:o9cq',
      strippedPrefix: false,
    });
  });

  test('keeps user-authored channel-looking titles without a platform', () => {
    expect(getIMSessionDisplayTitle('[微信] 营销方案', null)).toEqual({
      title: '[微信] 营销方案',
      strippedPrefix: false,
    });
  });

  test('strips NIM direct title prefixes without removing chat type context', () => {
    expect(getIMSessionDisplayTitle('云信-P2P-张三', 'nim')).toEqual({
      title: 'P2P-张三',
      strippedPrefix: true,
    });
  });

  test('supports the claw email IM channel display variants', () => {
    expect(getIMSessionDisplayTitle('[龙虾邮箱] inbox:user', 'email')).toEqual({
      title: 'inbox:user',
      strippedPrefix: true,
    });
    expect(getIMSessionDisplayTitle('[邮件] inbox:user', 'email')).toEqual({
      title: 'inbox:user',
      strippedPrefix: true,
    });
  });

  test('ignores and logs unknown platforms without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(getIMSessionPlatformLogo('unknown-channel')).toBeNull();
      expect(getIMSessionPlatformLogo('unknown-channel')).toBeNull();
      expect(getIMSessionDisplayTitle('[微信] title', 'unknown-channel')).toEqual({
        title: '[微信] title',
        strippedPrefix: false,
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        '[IMSessionDisplay] Ignoring unknown IM platform for session list:',
        'unknown-channel',
      );
    } finally {
      warn.mockRestore();
    }
  });
});
