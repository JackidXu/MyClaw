import { describe, expect, test } from 'vitest';

import { HtmlShareStatus } from '../../../shared/htmlShare/constants';
import { LibrarySharedStatusFilter } from '../../../shared/library/constants';
import {
  getLibrarySharedStatusCount,
  hideLibraryCloudItems,
  hideLibraryLocalItems,
  matchesLibrarySharedStatus,
} from './libraryListState';

describe('library list state', () => {
  test('hides local items without clearing the source count', () => {
    expect(hideLibraryLocalItems({
      list: [],
      nextCursor: 'local-next',
      hasMore: true,
      counts: { total: 12, available: 10, missing: 2 },
    })).toEqual({
      list: [],
      hasMore: false,
      counts: { total: 12, available: 10, missing: 2 },
    });
  });

  test('hides cloud items without clearing share and site counts', () => {
    expect(hideLibraryCloudItems({
      list: [],
      nextCursor: 'cloud-next',
      hasMore: true,
      counts: { sharedFile: 83, deployedSite: 14 },
      sharedStatusCounts: { all: 83, live: 70, disabled: 13 },
    })).toEqual({
      list: [],
      hasMore: false,
      counts: { sharedFile: 83, deployedSite: 14 },
      sharedStatusCounts: { all: 83, live: 70, disabled: 13 },
    });
  });

  test('reads exact shared status facets when provided', () => {
    const data = {
      counts: { sharedFile: 83, deployedSite: 14 },
      sharedStatusCounts: { all: 83, live: 70, disabled: 13 },
    };

    expect(getLibrarySharedStatusCount(data, LibrarySharedStatusFilter.All)).toBe(83);
    expect(getLibrarySharedStatusCount(data, LibrarySharedStatusFilter.Live)).toBe(70);
    expect(getLibrarySharedStatusCount(data, LibrarySharedStatusFilter.Disabled)).toBe(13);
  });

  test('keeps legacy cloud responses renderable without status facets', () => {
    const legacyData = {
      counts: { sharedFile: 83, deployedSite: 14 },
    };

    expect(getLibrarySharedStatusCount(legacyData, LibrarySharedStatusFilter.All)).toBe(83);
    expect(getLibrarySharedStatusCount(legacyData, LibrarySharedStatusFilter.Live)).toBeUndefined();
    expect(
      getLibrarySharedStatusCount(legacyData, LibrarySharedStatusFilter.Disabled),
    ).toBeUndefined();
  });

  test('filters mixed legacy results by the selected shared status', () => {
    const liveItem = { status: HtmlShareStatus.Live };
    const disabledItem = { status: HtmlShareStatus.Disabled };

    expect(matchesLibrarySharedStatus(liveItem, LibrarySharedStatusFilter.All)).toBe(true);
    expect(matchesLibrarySharedStatus(disabledItem, LibrarySharedStatusFilter.All)).toBe(true);
    expect(matchesLibrarySharedStatus(liveItem, LibrarySharedStatusFilter.Live)).toBe(true);
    expect(matchesLibrarySharedStatus(disabledItem, LibrarySharedStatusFilter.Live)).toBe(false);
    expect(matchesLibrarySharedStatus(liveItem, LibrarySharedStatusFilter.Disabled)).toBe(false);
    expect(matchesLibrarySharedStatus(disabledItem, LibrarySharedStatusFilter.Disabled)).toBe(true);
  });
});
