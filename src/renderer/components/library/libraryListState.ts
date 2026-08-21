import {
  LibrarySharedStatusFilter,
  type LibrarySharedStatusFilter as LibrarySharedStatusFilterValue,
} from '../../../shared/library/constants';
import type {
  LibraryCloudListData,
  LibraryLocalListData,
  LibrarySharedStatusCounts,
  SharedFileItem,
} from '../../../shared/library/types';

type CloudStatusCountData = Pick<LibraryCloudListData, 'counts'> & {
  sharedStatusCounts?: Partial<LibrarySharedStatusCounts>;
};

export const getLibrarySharedStatusCount = (
  data: CloudStatusCountData,
  status: LibrarySharedStatusFilterValue,
): number | undefined => {
  const count = data.sharedStatusCounts?.[status];
  if (typeof count === 'number' && Number.isFinite(count)) return count;

  // Older main-process builds do not return status facets. Keep the page
  // usable during renderer HMR and only show the source total we can trust.
  return status === LibrarySharedStatusFilter.All
    && Number.isFinite(data.counts.sharedFile)
    ? data.counts.sharedFile
    : undefined;
};

export const matchesLibrarySharedStatus = (
  item: Pick<SharedFileItem, 'status'>,
  status: LibrarySharedStatusFilterValue,
): boolean => (
  status === LibrarySharedStatusFilter.All || item.status === status
);

export const hideLibraryLocalItems = (
  data: LibraryLocalListData,
): LibraryLocalListData => ({
  list: [],
  hasMore: false,
  counts: data.counts,
});

export const hideLibraryCloudItems = (
  data: LibraryCloudListData,
): LibraryCloudListData => ({
  list: [],
  hasMore: false,
  counts: data.counts,
  sharedStatusCounts: data.sharedStatusCounts,
  ...(data.serverNow === undefined ? {} : { serverNow: data.serverNow }),
});
