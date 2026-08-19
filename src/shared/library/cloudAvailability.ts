import { HtmlShareStatus } from '../htmlShare/constants';
import { SiteStatus } from '../site/constants';
import {
  LibraryCloudAvailabilityFilter,
  type LibraryCloudAvailabilityFilter as LibraryCloudAvailabilityFilterValue,
  LibraryItemKind,
} from './constants';
import type { LibraryCloudItem } from './types';

export type LibraryCloudAvailability = Exclude<
  LibraryCloudAvailabilityFilterValue,
  typeof LibraryCloudAvailabilityFilter.All
>;

export const getLibraryCloudAvailability = (
  item: LibraryCloudItem,
): LibraryCloudAvailability => {
  if (item.itemKind === LibraryItemKind.SharedFile) {
    return item.status === HtmlShareStatus.Live
      ? LibraryCloudAvailabilityFilter.Available
      : LibraryCloudAvailabilityFilter.Unavailable;
  }
  return item.siteStatus === SiteStatus.Online && item.shareStatus === HtmlShareStatus.Live
    ? LibraryCloudAvailabilityFilter.Available
    : LibraryCloudAvailabilityFilter.Unavailable;
};

export const matchesLibraryCloudAvailability = (
  item: LibraryCloudItem,
  availability: LibraryCloudAvailabilityFilterValue,
): boolean => (
  availability === LibraryCloudAvailabilityFilter.All
  || getLibraryCloudAvailability(item) === availability
);
