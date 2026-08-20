import { describe, expect, test } from 'vitest';

import { parsePublishingAccessExpiry } from './PublishingTrialStatus';

describe('PublishingTrialStatus', () => {
  test('recognizes a server-provided share expiration timestamp', () => {
    expect(parsePublishingAccessExpiry('2026-08-20T10:00:00+08:00')).toBe(
      Date.parse('2026-08-20T10:00:00+08:00'),
    );
  });

  test('does not mark missing or malformed expiration values as trials', () => {
    expect(parsePublishingAccessExpiry(undefined)).toBeUndefined();
    expect(parsePublishingAccessExpiry('not-a-date')).toBeUndefined();
  });
});
