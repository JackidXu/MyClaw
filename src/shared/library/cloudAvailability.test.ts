import { describe, expect, test } from 'vitest';

import { HtmlShareAccessMode, HtmlShareStatus } from '../htmlShare/constants';
import { SiteKind, SiteStatus } from '../site/constants';
import { getLibraryCloudAvailability } from './cloudAvailability';
import {
  LibraryCategory,
  LibraryCloudAvailabilityFilter,
  LibraryItemKind,
} from './constants';
import type { DeployedSiteItem, SharedFileItem } from './types';

const base = {
  title: 'item',
  category: LibraryCategory.Document,
  sortTime: 1,
  createdAt: 1,
  isFavorite: false,
};

const sharedItem = (status: HtmlShareStatus): SharedFileItem => ({
  ...base,
  itemKind: LibraryItemKind.SharedFile,
  itemId: 'share-1',
  shareId: 'share-1',
  url: 'https://share.example/1',
  sourceType: 'document_file',
  accessMode: HtmlShareAccessMode.Public,
  status,
});

const siteItem = (siteStatus: SiteStatus, shareStatus: HtmlShareStatus): DeployedSiteItem => ({
  ...base,
  category: LibraryCategory.Site,
  itemKind: LibraryItemKind.DeployedSite,
  itemId: 'site-1',
  shareId: 'site-1',
  url: 'https://site.example',
  siteKind: SiteKind.StaticSite,
  siteStatus,
  shareStatus,
  accessMode: HtmlShareAccessMode.Public,
});

describe('getLibraryCloudAvailability', () => {
  test('maps live shares to available and closed shares to unavailable', () => {
    expect(getLibraryCloudAvailability(sharedItem(HtmlShareStatus.Live)))
      .toBe(LibraryCloudAvailabilityFilter.Available);
    expect(getLibraryCloudAvailability(sharedItem(HtmlShareStatus.Disabled)))
      .toBe(LibraryCloudAvailabilityFilter.Unavailable);
  });

  test('only treats online sites with a live share as available', () => {
    expect(getLibraryCloudAvailability(siteItem(SiteStatus.Online, HtmlShareStatus.Live)))
      .toBe(LibraryCloudAvailabilityFilter.Available);
    expect(getLibraryCloudAvailability(siteItem(SiteStatus.Deploying, HtmlShareStatus.Live)))
      .toBe(LibraryCloudAvailabilityFilter.Unavailable);
    expect(getLibraryCloudAvailability(siteItem(SiteStatus.Online, HtmlShareStatus.Disabled)))
      .toBe(LibraryCloudAvailabilityFilter.Unavailable);
  });
});
