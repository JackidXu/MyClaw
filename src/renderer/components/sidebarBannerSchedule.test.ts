import { beforeEach, describe, expect, test, vi } from 'vitest';

const storeMock = vi.hoisted(() => ({
  getItem: vi.fn(),
  removeItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('../services/store', () => ({
  localStore: storeMock,
}));

import type { ClientBanner } from './sidebarAdBannerState';
import {
  createCachedBannerSchedule,
  expireCachedBannerSchedule,
  getActiveCachedBanners,
  getNextBannerScheduleEventDelay,
  getSidebarBannerScheduleCacheKey,
  readCachedBannerSchedule,
  saveCachedBannerSchedule,
  SIDEBAR_BANNER_SCHEDULE_CACHE_MAX_AGE_MS,
} from './sidebarBannerSchedule';

const SERVER_TIME = '2026-08-27T04:00:00Z';
const SERVER_TIME_MS = Date.parse(SERVER_TIME);

const banner = (
  onlineAt = '2026-08-27T03:00:00',
  offlineAt = '2026-08-27T04:05:00',
): ClientBanner => ({
  id: 42,
  activityDescription: 'Banner 42',
  linkUrl: 'https://lobsterai.youdao.com/banner/42',
  imageUrl: 'https://nos.example.com/banner-42.png',
  onlineAt,
  offlineAt,
  updatedAt: '2026-08-27T03:30:00',
});

describe('sidebar banner schedule', () => {
  beforeEach(() => {
    storeMock.getItem.mockReset();
    storeMock.removeItem.mockReset();
    storeMock.setItem.mockReset();
    storeMock.removeItem.mockResolvedValue(undefined);
    storeMock.setItem.mockResolvedValue(undefined);
  });

  test('expires a cached banner locally at its server offline time', () => {
    const schedule = createCachedBannerSchedule({
      serverTime: SERVER_TIME,
      nextRefreshAt: '2026-08-27T04:05:00Z',
      banners: [banner()],
    }, 1000)!;

    expect(getActiveCachedBanners(schedule, 1000 + 299_999)).toHaveLength(1);
    expect(getActiveCachedBanners(schedule, 1000 + 300_000)).toEqual([]);
    expect(expireCachedBannerSchedule(schedule, 1000 + 300_000).banners).toEqual([]);
  });

  test('reschedules when admin extends or shortens the offline time', () => {
    const original = createCachedBannerSchedule({
      serverTime: SERVER_TIME,
      nextRefreshAt: '2026-08-27T04:05:00Z',
      banners: [banner()],
    }, 0)!;
    const extended = createCachedBannerSchedule({
      serverTime: SERVER_TIME,
      nextRefreshAt: '2026-08-27T04:10:00Z',
      banners: [banner(undefined, '2026-08-27T04:10:00')],
    }, 0)!;
    const shortened = createCachedBannerSchedule({
      serverTime: SERVER_TIME,
      nextRefreshAt: null,
      banners: [banner(undefined, '2026-08-27T03:59:59')],
    }, 0)!;

    expect(getNextBannerScheduleEventDelay(original, 0)).toBe(5 * 60 * 1000);
    expect(getNextBannerScheduleEventDelay(extended, 0)).toBe(10 * 60 * 1000);
    expect(getActiveCachedBanners(shortened, 0)).toEqual([]);
  });

  test('persists and restores a fresh schedule', async () => {
    const schedule = createCachedBannerSchedule({
      serverTime: SERVER_TIME,
      nextRefreshAt: null,
      banners: [banner()],
    }, SERVER_TIME_MS)!;
    storeMock.getItem.mockResolvedValue(schedule);

    await saveCachedBannerSchedule(schedule);
    await expect(readCachedBannerSchedule(undefined, SERVER_TIME_MS)).resolves.toEqual(schedule);
    expect(storeMock.setItem).toHaveBeenCalledWith(
      getSidebarBannerScheduleCacheKey(),
      schedule,
    );
  });

  test('rejects stale and clock-rollback cache entries', async () => {
    const schedule = createCachedBannerSchedule({
      serverTime: SERVER_TIME,
      nextRefreshAt: null,
      banners: [banner()],
    }, 1000)!;
    storeMock.getItem.mockResolvedValue(schedule);

    await expect(readCachedBannerSchedule(
      undefined,
      1000 + SIDEBAR_BANNER_SCHEDULE_CACHE_MAX_AGE_MS + 1,
    )).resolves.toBeNull();
    await expect(readCachedBannerSchedule(undefined, 999)).resolves.toBeNull();
    expect(storeMock.removeItem).toHaveBeenCalledWith(getSidebarBannerScheduleCacheKey());
  });
});
