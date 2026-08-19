import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import React, { useEffect, useMemo, useState } from 'react';

import {
  HtmlShareAccessMode,
  type HtmlShareAccessMode as HtmlShareAccessModeValue,
  HtmlShareDisabledSource,
  type HtmlShareDisabledSource as HtmlShareDisabledSourceValue,
  HtmlShareStatus,
  type HtmlShareStatus as HtmlShareStatusValue,
} from '../../../shared/htmlShare/constants';
import { matchesLibraryCloudAvailability } from '../../../shared/library/cloudAvailability';
import {
  LibraryCategory,
  LibraryCloudAvailabilityFilter,
  type LibraryCloudAvailabilityFilter as LibraryCloudAvailabilityFilterValue,
  LibraryItemKind,
} from '../../../shared/library/constants';
import type {
  DeployedSiteItem,
  LibraryCloudItem,
  LibraryCloudListData,
  LibrarySessionRef,
  SharedFileItem,
} from '../../../shared/library/types';
import type { SiteDetail } from '../../../shared/site/constants';
import { copyTextToClipboard } from '../../services/clipboard';
import { i18nService } from '../../services/i18n';
import { showToast } from '../../utils/localFileActions';
import { buildArtifactFileShareCopyText } from '../artifacts/artifactFileShareCopy';
import type {
  ArtifactFileSharePermission as ArtifactFileSharePermissionValue,
} from '../artifacts/artifactFileSharePermission';
import {
  ArtifactFileSharePermission,
  ArtifactFileSharePermissionChangeAction,
  buildArtifactFileSharePermissionPlan,
  deriveArtifactFileSharePermission,
} from '../artifacts/artifactFileSharePermission';
import CardOverflowMenu, { type CardOverflowMenuItem } from '../common/CardOverflowMenu';
import FileTypeIcon from '../icons/fileTypes/FileTypeIcon';
import { SitesView } from '../sites';
import Tooltip, { TooltipAlign, TooltipPosition } from '../ui/Tooltip';
import { LIBRARY_ACTION_MENU_WIDTH_PX } from './libraryActionMenuPresentation';
import LibraryAvailabilityDropdown from './LibraryAvailabilityDropdown';
import LibraryCategoryDropdown from './LibraryCategoryDropdown';
import {
  formatLibraryTime,
  getLibraryAccessModeLabel,
  getLibraryDisplayFileName,
} from './libraryItemPresentation';
import LibraryShareConfirmDialog from './LibraryShareConfirmDialog';
const CATEGORY_FILTERS = [
  LibraryCategory.All,
  LibraryCategory.Slides,
  LibraryCategory.Web,
  LibraryCategory.Document,
  LibraryCategory.Spreadsheet,
  LibraryCategory.Image,
  LibraryCategory.Media,
  LibraryCategory.Site,
  LibraryCategory.Other,
] as const;

const STATUS_FILTERS = [
  LibraryCloudAvailabilityFilter.All,
  LibraryCloudAvailabilityFilter.Available,
  LibraryCloudAvailabilityFilter.Unavailable,
] as const;

interface LibraryCloudViewProps {
  data: LibraryCloudListData;
  loading: boolean;
  loadingMore: boolean;
  error?: string;
  isAuthenticated: boolean;
  category: LibraryCategory;
  status: LibraryCloudAvailabilityFilterValue;
  favoritesOnly: boolean;
  keywordInput: string;
  loadMoreSentinelRef: React.RefObject<HTMLDivElement>;
  onCategoryChange: (category: LibraryCategory) => void;
  onStatusChange: (status: LibraryCloudAvailabilityFilterValue) => void;
  onToggleFavoritesOnly: () => void;
  onKeywordInputChange: (keyword: string) => void;
  onRefresh: () => void;
  onDetailOpen: () => void;
  onShowLogin: () => void;
  onOpenSession: (session: LibrarySessionRef) => void;
  onItemUpdated: (item: LibraryCloudItem) => void;
  onItemDeleted: (item: LibraryCloudItem) => void;
  onToggleFavorite: (item: LibraryCloudItem) => void;
  hideSites?: boolean;
  sitesReadOnly?: boolean;
}

interface ShareDetailState {
  item: SharedFileItem;
  loading: boolean;
  saving: boolean;
  error?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

const readString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const readNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const readBoolean = (value: unknown): boolean | undefined => (
  typeof value === 'boolean' ? value : undefined
);

const readDateMillis = (value: unknown): number | undefined => {
  const text = readString(value);
  if (!text) return undefined;
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
};

const deriveDisabledSource = (
  detail: Record<string, unknown>,
): HtmlShareDisabledSourceValue | undefined => {
  const explicit = readString(detail.disabledSource);
  if (Object.values(HtmlShareDisabledSource).includes(
    explicit as HtmlShareDisabledSourceValue,
  )) {
    return explicit as HtmlShareDisabledSourceValue;
  }
  if (detail.status !== HtmlShareStatus.Disabled || !detail.disabledAt) return undefined;
  if (detail.disabledByUserId !== undefined && detail.disabledByUserId !== null) {
    return HtmlShareDisabledSource.User;
  }
  if (detail.disabledByAdminId !== undefined && detail.disabledByAdminId !== null) {
    return HtmlShareDisabledSource.Admin;
  }
  if (detail.moderationStatus === 'rejected') return HtmlShareDisabledSource.Moderation;
  if (detail.disabledReason === 'active share limit exceeded') {
    return HtmlShareDisabledSource.ActiveLimit;
  }
  return HtmlShareDisabledSource.System;
};

const mergeShareDetail = (
  item: SharedFileItem,
  value: unknown,
): SharedFileItem => {
  const detail = asRecord(value);
  if (!detail) return item;
  const status = readString(detail.status);
  const accessMode = readString(detail.accessMode);
  const createdAt = readDateMillis(detail.createdAt);
  const nextStatus = status && Object.values(HtmlShareStatus).includes(
    status as HtmlShareStatusValue,
  )
    ? status as HtmlShareStatusValue
    : item.status;
  const nextAccessMode = accessMode && Object.values(HtmlShareAccessMode).includes(
    accessMode as HtmlShareAccessModeValue,
  )
    ? accessMode as HtmlShareAccessModeValue
    : item.accessMode;
  const merged: SharedFileItem = {
    ...item,
    ...(readString(detail.title) ? { title: readString(detail.title) as string } : {}),
    status: nextStatus,
    accessMode: nextAccessMode,
    ...(readString(detail.entryFile) ? { entryFile: readString(detail.entryFile) } : {}),
    ...(readNumber(detail.totalBytes) !== undefined
      ? { totalBytes: readNumber(detail.totalBytes) }
      : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(readString(detail.updatedAt) ? { updatedAt: readString(detail.updatedAt) } : {}),
    ...(readString(detail.contentUpdatedAt)
      ? { contentUpdatedAt: readString(detail.contentUpdatedAt) }
      : {}),
    disabledSource: nextStatus === HtmlShareStatus.Live
      ? undefined
      : deriveDisabledSource({ ...detail, status: nextStatus }) ?? item.disabledSource,
  };

  if (nextAccessMode === HtmlShareAccessMode.Public) {
    delete merged.shareCode;
    delete merged.shareCodeUnavailable;
    return merged;
  }

  const shareCode = readString(detail.shareCode);
  const shareCodeUnavailable = readBoolean(detail.shareCodeUnavailable);
  if (shareCode) {
    merged.shareCode = shareCode;
    merged.shareCodeUnavailable = false;
  } else if (shareCodeUnavailable !== undefined) {
    merged.shareCodeUnavailable = shareCodeUnavailable;
    if (shareCodeUnavailable) delete merged.shareCode;
  }
  return merged;
};

const loadLatestSharedFileItem = async (
  baseItem: SharedFileItem,
): Promise<SharedFileItem> => {
  if (baseItem.clientSourceKey) {
    try {
      const sourceResult = await window.electron.htmlShare.getBySource({
        sourceType: baseItem.sourceType,
        clientSourceKey: baseItem.clientSourceKey,
      });
      const sourceShare = asRecord(sourceResult.share);
      if (
        sourceResult.success
        && readString(sourceShare?.shareId) === baseItem.shareId
      ) {
        return mergeShareDetail(baseItem, sourceResult.share);
      }
    } catch {
      // Fall back to the share-id lookup when source lookup is unavailable.
    }
  }

  try {
    const result = await window.electron.htmlShare.get(baseItem.shareId);
    return result.success ? mergeShareDetail(baseItem, result.share) : baseItem;
  } catch {
    return baseItem;
  }
};

const isResumeLocked = (source?: HtmlShareDisabledSourceValue | null): boolean => (
  source === HtmlShareDisabledSource.Admin
  || source === HtmlShareDisabledSource.Moderation
  || source === HtmlShareDisabledSource.ActiveLimit
  || source === HtmlShareDisabledSource.System
);

const CloudAvailabilityBadge: React.FC<{ item: LibraryCloudItem }> = ({ item }) => {
  const isAvailable = matchesLibraryCloudAvailability(
    item,
    LibraryCloudAvailabilityFilter.Available,
  );
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${
      isAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-secondary'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        isAvailable ? 'bg-emerald-500' : 'bg-tertiary'
      }`} />
      {i18nService.t(`libraryCloudAvailability_${
        isAvailable
          ? LibraryCloudAvailabilityFilter.Available
          : LibraryCloudAvailabilityFilter.Unavailable
      }`)}
    </span>
  );
};

const HeaderAction: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  align?: TooltipAlign;
}> = ({ label, align = TooltipAlign.Center, className = '', children, ...props }) => (
  <Tooltip content={label} position={TooltipPosition.Bottom} align={align} delay={250}>
    <button
      {...props}
      type="button"
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-secondary transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  </Tooltip>
);

const LIBRARY_SHARE_PERMISSIONS = [
  ArtifactFileSharePermission.Public,
  ArtifactFileSharePermission.Code,
  ArtifactFileSharePermission.Stopped,
] as const;

const LibraryShareConfirmationKind = {
  MakePublic: 'make_public',
  Stop: 'stop',
  Resume: 'resume',
  Discard: 'discard',
} as const;

type LibraryShareConfirmationKind =
  (typeof LibraryShareConfirmationKind)[keyof typeof LibraryShareConfirmationKind];

const LibraryShareSettingsView: React.FC<{
  initialItem: SharedFileItem;
  onBack: () => void;
  onItemUpdated: (item: SharedFileItem) => void;
  onOpenSession: (session: LibrarySessionRef) => void;
  onToggleFavorite: (item: SharedFileItem) => void;
}> = ({ initialItem, onBack, onItemUpdated, onOpenSession, onToggleFavorite }) => {
  const [state, setState] = useState<ShareDetailState>({
    item: initialItem,
    loading: true,
    saving: false,
  });
  const [selectedPermission, setSelectedPermission] = useState<ArtifactFileSharePermissionValue>(
    deriveArtifactFileSharePermission(initialItem),
  );
  const [confirmationKind, setConfirmationKind] = useState<LibraryShareConfirmationKind>();

  useEffect(() => {
    let active = true;
    setState({ item: initialItem, loading: true, saving: false });
    setSelectedPermission(deriveArtifactFileSharePermission(initialItem));
    setConfirmationKind(undefined);
    void loadLatestSharedFileItem(initialItem).then(item => {
      if (!active) return;
      setState({
        item,
        loading: false,
        saving: false,
      });
      setSelectedPermission(deriveArtifactFileSharePermission(item));
    }).catch(error => {
      if (!active) return;
      setState(current => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : i18nService.t('unknownError'),
      }));
    });
    return () => { active = false; };
  }, [initialItem]);

  const item = state.item;
  const lastModifiedAt = readDateMillis(item.contentUpdatedAt)
    ?? readDateMillis(item.updatedAt)
    ?? item.sortTime;
  const committedPermission = deriveArtifactFileSharePermission(item);
  const hasPendingChanges = selectedPermission !== committedPermission;
  const resumeLocked = committedPermission === ArtifactFileSharePermission.Stopped
    && isResumeLocked(item.disabledSource);
  const permissionLocked = state.loading
    || state.saving
    || item.status === HtmlShareStatus.Failed
    || resumeLocked;
  const copyResult = useMemo(() => buildArtifactFileShareCopyText({
    accessMode: item.accessMode,
    labels: {
      link: i18nService.t('htmlShareClipboardLinkLabel'),
      shareCode: i18nService.t('htmlShareCode'),
    },
    shareCode: item.shareCode,
    url: item.url,
  }), [item.accessMode, item.shareCode, item.url]);
  const canUseShare = item.status === HtmlShareStatus.Live && !hasPendingChanges;
  const canCopyShareInformation = canUseShare && !state.saving && copyResult.copyable;

  const openLink = (): void => {
    if (!canUseShare) return;
    void window.electron.shell.openExternal(item.url).then(result => {
      if (!result.success) {
        setState(current => ({ ...current, error: result.error ?? i18nService.t('unknownError') }));
      }
    });
  };

  const copyShareInformation = (): void => {
    if (!canCopyShareInformation || !copyResult.copyable) return;
    void copyTextToClipboard(copyResult.text).then(copied => {
      if (copied) {
        setState(current => ({ ...current, error: undefined }));
        showToast(i18nService.t('copied'));
        return;
      }
      setState(current => ({ ...current, error: i18nService.t('copyFailed') }));
    });
  };

  const applyPermission = async (
    targetPermission: ArtifactFileSharePermissionValue,
  ): Promise<void> => {
    if (state.saving || permissionLocked) return;
    const plan = buildArtifactFileSharePermissionPlan(item, targetPermission);
    if (plan.some(step => (
      step.action === ArtifactFileSharePermissionChangeAction.Blocked
      || step.action === ArtifactFileSharePermissionChangeAction.RestoreActiveLimit
    ))) {
      setConfirmationKind(undefined);
      setState(current => ({
        ...current,
        error: i18nService.t('libraryShareResumeLocked'),
      }));
      return;
    }

    setState(current => ({ ...current, saving: true, error: undefined }));
    let workingItem = item;
    try {
      for (const step of plan) {
        if (step.action === ArtifactFileSharePermissionChangeAction.UpdateAccess) {
          const result = await window.electron.htmlShare.updateAccessMode({
            shareId: item.shareId,
            accessMode: step.accessMode,
          });
          if (!result.success) {
            throw new Error(result.error ?? i18nService.t('htmlShareAccessModeUpdateFailed'));
          }
          workingItem = mergeShareDetail({
            ...workingItem,
            accessMode: result.accessMode ?? step.accessMode,
          }, result);
        } else if (step.action === ArtifactFileSharePermissionChangeAction.UpdateStatus) {
          const result = await window.electron.htmlShare.updateStatus({
            shareId: item.shareId,
            status: step.status,
          });
          if (!result.success) {
            throw new Error(result.error ?? i18nService.t('htmlShareStatusUpdateFailed'));
          }
          workingItem = mergeShareDetail({
            ...workingItem,
            status: result.status ?? step.status,
            disabledSource: result.disabledSource,
          }, result);
        }
      }

      const committedItem = await loadLatestSharedFileItem(workingItem);
      setState({
        item: committedItem,
        loading: false,
        saving: false,
      });
      setSelectedPermission(deriveArtifactFileSharePermission(committedItem));
      setConfirmationKind(undefined);
      onItemUpdated(committedItem);
      showToast(i18nService.t('artifactFileSharePermissionUpdated'));
    } catch (error) {
      const reconciledItem = await loadLatestSharedFileItem(workingItem);
      setState({
        item: reconciledItem,
        loading: false,
        saving: false,
        error: error instanceof Error ? error.message : i18nService.t('unknownError'),
      });
      setConfirmationKind(undefined);
      onItemUpdated(reconciledItem);
    }
  };

  const requestSave = (): void => {
    if (!hasPendingChanges || permissionLocked) return;
    if (selectedPermission === ArtifactFileSharePermission.Stopped) {
      setConfirmationKind(LibraryShareConfirmationKind.Stop);
      return;
    }
    if (committedPermission === ArtifactFileSharePermission.Stopped) {
      setConfirmationKind(LibraryShareConfirmationKind.Resume);
      return;
    }
    if (
      committedPermission === ArtifactFileSharePermission.Code
      && selectedPermission === ArtifactFileSharePermission.Public
    ) {
      setConfirmationKind(LibraryShareConfirmationKind.MakePublic);
      return;
    }
    void applyPermission(selectedPermission);
  };

  const requestBack = (): void => {
    if (hasPendingChanges) {
      setConfirmationKind(LibraryShareConfirmationKind.Discard);
    } else {
      onBack();
    }
  };

  const toggleFavorite = (): void => {
    onToggleFavorite(item);
    setState(current => ({
      ...current,
      item: { ...current.item, isFavorite: !current.item.isFavorite },
    }));
  };

  const confirmationPresentation = useMemo(() => {
    switch (confirmationKind) {
      case LibraryShareConfirmationKind.MakePublic:
        return {
          title: i18nService.t('libraryShareConfirmPublicTitle'),
          message: i18nService.t('libraryShareConfirmPublicMessage'),
          confirmLabel: i18nService.t('libraryShareConfirmPublicAction'),
          destructive: false,
        };
      case LibraryShareConfirmationKind.Stop:
        return {
          title: i18nService.t('libraryShareConfirmStopTitle'),
          message: i18nService.t('libraryShareConfirmStopMessage'),
          confirmLabel: i18nService.t('libraryShareConfirmStopAction'),
          destructive: true,
        };
      case LibraryShareConfirmationKind.Resume:
        return {
          title: i18nService.t('libraryShareConfirmResumeTitle'),
          message: i18nService.t('libraryShareConfirmResumeMessage'),
          confirmLabel: i18nService.t('libraryShareConfirmResumeAction'),
          destructive: false,
        };
      case LibraryShareConfirmationKind.Discard:
        return {
          title: i18nService.t('libraryShareDiscardTitle'),
          message: i18nService.t('libraryShareDiscardMessage'),
          confirmLabel: i18nService.t('libraryShareDiscardAction'),
          destructive: false,
        };
      default:
        return undefined;
    }
  }, [confirmationKind]);

  const confirmPendingAction = (): void => {
    if (confirmationKind === LibraryShareConfirmationKind.Discard) {
      setConfirmationKind(undefined);
      onBack();
      return;
    }
    void applyPermission(selectedPermission);
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 py-6 sm:px-8">
      <div className="w-full max-w-[920px]">
        <button
          type="button"
          onClick={requestBack}
          disabled={state.saving}
          className="inline-flex h-8 items-center gap-1.5 px-1 text-xs text-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {i18nService.t('libraryBackToSharedFiles')}
        </button>

        <div className="mt-3 flex items-center gap-3 border-b border-border pb-5 pt-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
            <FileTypeIcon fileName={getLibraryDisplayFileName(item)} className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-medium text-foreground">{getLibraryDisplayFileName(item)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-secondary">
              <span>{i18nService.t('librarySharedFile')}</span>
              <span aria-hidden="true">·</span>
              <span>{i18nService.t('libraryLastModifiedAt')}: {formatLibraryTime(lastModifiedAt)}</span>
              <span aria-hidden="true">·</span>
              <CloudAvailabilityBadge item={item} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          <HeaderAction
            label={i18nService.t('libraryOpenLink')}
            onClick={openLink}
            disabled={!canUseShare || state.saving}
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </HeaderAction>
          <HeaderAction
            label={item.isFavorite
              ? i18nService.t('libraryRemoveFavorite')
              : i18nService.t('libraryAddFavorite')}
            aria-pressed={item.isFavorite}
            onClick={toggleFavorite}
            className={item.isFavorite ? '!text-amber-500' : ''}
          >
            {item.isFavorite
              ? <StarSolidIcon className="h-4 w-4" />
              : <StarIcon className="h-4 w-4" />}
          </HeaderAction>
          {item.latestSession && (
            <HeaderAction
              label={i18nService.t('libraryRelatedSessions')}
              align={TooltipAlign.End}
              onClick={() => onOpenSession(item.latestSession as LibrarySessionRef)}
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4" />
            </HeaderAction>
          )}
          </div>
        </div>

        {state.error && (
          <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            {state.error}
          </div>
        )}

        {state.loading ? (
          <div className="mt-5 h-52 animate-pulse rounded-xl border border-border bg-surface-raised/50" />
        ) : (
          <div className="mt-5 space-y-3">
            <section className="rounded-xl border border-border p-5">
              <h2 className="text-sm font-semibold text-foreground">
                {i18nService.t('libraryShareAccessSetting')}
              </h2>
              <p className="mt-1 text-xs text-secondary">
                {i18nService.t('libraryShareAccessSettingDescription')}
              </p>

              <div className="mt-4">
                <div className="text-[11px] font-medium text-secondary">
                  {i18nService.t('libraryShareAccessAddress')}
                </div>
                <div className="mt-2 flex min-w-0 items-center gap-3 rounded-lg bg-surface-raised px-3 py-2.5">
                  <p className="min-w-0 flex-1 truncate text-xs text-secondary">{item.url}</p>
                  <button
                    type="button"
                    disabled={!canCopyShareInformation}
                    onClick={copyShareInformation}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:text-tertiary"
                  >
                    <ClipboardDocumentIcon className="h-4 w-4" />
                    {item.accessMode === HtmlShareAccessMode.Code
                      ? i18nService.t('htmlShareCopyLinkAndCode')
                      : i18nService.t('htmlShareCopyLink')}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {LIBRARY_SHARE_PERMISSIONS.map(permission => {
                const selected = selectedPermission === permission;
                const label = permission === ArtifactFileSharePermission.Public
                  ? i18nService.t('htmlShareAccessModePublic')
                  : permission === ArtifactFileSharePermission.Code
                    ? i18nService.t('artifactFileShareCodeAccess')
                    : i18nService.t('artifactFileShareStopAccess');
                const hint = permission === ArtifactFileSharePermission.Public
                  ? i18nService.t('htmlShareAccessModePublicHint')
                  : permission === ArtifactFileSharePermission.Code
                    ? i18nService.t('htmlShareAccessModeCodeHint')
                    : i18nService.t('librarySharePermissionStoppedHint');
                return (
                  <button
                    key={permission}
                    type="button"
                    aria-pressed={selected}
                    disabled={permissionLocked}
                    onClick={() => setSelectedPermission(permission)}
                    className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-surface-raised'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        selected ? 'border-primary' : 'border-border'
                      }`}>
                        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      {label}
                    </span>
                    <span className="mt-2 block text-[11px] leading-4 text-secondary">{hint}</span>
                  </button>
                );
              })}
              </div>

              {item.accessMode === HtmlShareAccessMode.Code && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-raised px-3 py-2.5 text-xs">
                  <span className="text-tertiary">{i18nService.t('htmlShareCode')}</span>
                  <span className="font-medium text-foreground">{item.shareCode ?? '—'}</span>
                </div>
              )}
              {item.accessMode === HtmlShareAccessMode.Code && !item.shareCode && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  {i18nService.t('htmlShareCodeUnavailable')}
                </p>
              )}
              {item.status !== HtmlShareStatus.Live && (
                <p className="mt-2 text-xs text-secondary">
                  {i18nService.t('libraryShareCopyUnavailableWhileStopped')}
                </p>
              )}
              {resumeLocked && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  {i18nService.t('libraryShareResumeLocked')}
                </p>
              )}
              {item.status === HtmlShareStatus.Failed && (
                <p className="mt-3 text-xs text-red-600 dark:text-red-400">
                  {i18nService.t('htmlShareResultStatusFailed')}
                </p>
              )}
              {hasPendingChanges && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    {i18nService.t('librarySharePendingChanges')}
                  </span>
                  <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={state.saving}
                    onClick={() => setSelectedPermission(committedPermission)}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {i18nService.t('libraryShareCancelChanges')}
                  </button>
                  <button
                    type="button"
                    disabled={permissionLocked}
                    onClick={requestSave}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {state.saving
                      ? i18nService.t('saving')
                      : i18nService.t('libraryShareSaveChanges')}
                  </button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border p-5">
              <h2 className="text-sm font-semibold text-foreground">
                {i18nService.t('libraryShareBasicInfo')}
              </h2>
              <p className="mt-1 text-xs text-secondary">
                {i18nService.t('libraryShareBasicInfoHint')}
              </p>
              <div className="mt-4">
                <div className="text-[11px] font-medium text-secondary">
                  {i18nService.t('libraryResourceName')}
                </div>
                <div className="mt-2 h-9 truncate rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-secondary">
                  {getLibraryDisplayFileName(item)}
                </div>
              </div>
              <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-3">
                <div><dt className="text-[11px] text-tertiary">{i18nService.t('libraryResourceType')}</dt><dd className="mt-1 text-xs text-foreground">{i18nService.t(`libraryCategory_${item.category}`)}</dd></div>
                <div><dt className="text-[11px] text-tertiary">{i18nService.t('libraryShareCreatedAt')}</dt><dd className="mt-1 text-xs text-foreground">{formatLibraryTime(item.createdAt)}</dd></div>
                <div><dt className="text-[11px] text-tertiary">{i18nService.t('libraryLastModifiedAt')}</dt><dd className="mt-1 text-xs text-foreground">{formatLibraryTime(lastModifiedAt)}</dd></div>
              </dl>
            </section>
          </div>
        )}

        {confirmationPresentation && (
          <LibraryShareConfirmDialog
            title={confirmationPresentation.title}
            message={confirmationPresentation.message}
            confirmLabel={confirmationPresentation.confirmLabel}
            destructive={confirmationPresentation.destructive}
            busy={state.saving}
            onCancel={() => setConfirmationKind(undefined)}
            onConfirm={confirmPendingAction}
          />
        )}
      </div>
    </div>
  );
};

const LibraryCloudView: React.FC<LibraryCloudViewProps> = ({
  data,
  loading,
  loadingMore,
  error,
  isAuthenticated,
  category,
  status,
  favoritesOnly,
  keywordInput,
  loadMoreSentinelRef,
  onCategoryChange,
  onStatusChange,
  onToggleFavoritesOnly,
  onKeywordInputChange,
  onRefresh,
  onDetailOpen,
  onShowLogin,
  onOpenSession,
  onItemUpdated,
  onItemDeleted,
  onToggleFavorite,
  hideSites = false,
  sitesReadOnly = false,
}) => {
  const [activeItem, setActiveItem] = useState<SharedFileItem>();
  const [activeSite, setActiveSite] = useState<DeployedSiteItem>();
  const [interactionError, setInteractionError] = useState<string>();
  const items = useMemo(() => data.list.filter(item => (
    (!hideSites || item.itemKind !== LibraryItemKind.DeployedSite)
    && (category === LibraryCategory.All || item.category === category)
    && matchesLibraryCloudAvailability(item, status)
  )), [category, data.list, hideSites, status]);

  if (activeItem) {
    return (
      <LibraryShareSettingsView
        initialItem={activeItem}
        onBack={() => setActiveItem(undefined)}
        onItemUpdated={onItemUpdated}
        onOpenSession={onOpenSession}
        onToggleFavorite={onToggleFavorite}
      />
    );
  }

  if (activeSite) {
    const updateActiveSite = (site: SiteDetail): void => {
      const parsedUpdatedAt = Date.parse(site.updatedAt);
      const updatedItem: DeployedSiteItem = {
        ...activeSite,
        title: site.title,
        url: site.url,
        siteKind: site.siteKind,
        siteStatus: site.siteStatus,
        accessMode: site.accessMode,
        updatedAt: site.updatedAt,
        sortTime: Number.isFinite(parsedUpdatedAt) ? parsedUpdatedAt : activeSite.sortTime,
        ...(site.deploymentId ? { deploymentId: site.deploymentId } : {}),
        ...(site.deploymentStatus ? { deploymentStatus: site.deploymentStatus } : {}),
        ...(site.artifactId ? { artifactId: site.artifactId } : {}),
      };
      setActiveSite(updatedItem);
      onItemUpdated(updatedItem);
    };
    return (
      <SitesView
        isAuthenticated={isAuthenticated}
        onCreateSiteByChat={() => undefined}
        isSidebarCollapsed={false}
        onToggleSidebar={() => undefined}
        readOnly={sitesReadOnly}
        embedded
        initialShareId={activeSite.shareId}
        initialDetailTab="settings"
        onBack={() => setActiveSite(undefined)}
        onSiteUpdated={updateActiveSite}
        onSiteDeleted={() => onItemDeleted(activeSite)}
        isFavorite={activeSite.isFavorite}
        onToggleFavorite={() => {
          onToggleFavorite(activeSite);
          setActiveSite(current => current
            ? { ...current, isFavorite: !current.isFavorite }
            : current);
        }}
        onOpenRelatedTask={activeSite.latestSession
          ? () => onOpenSession(activeSite.latestSession as LibrarySessionRef)
          : undefined}
      />
    );
  }

  const copyLink = (item: LibraryCloudItem): void => {
    void copyTextToClipboard(item.url).then(copied => {
      if (!copied) setInteractionError(i18nService.t('copyFailed'));
    });
  };

  const openLink = (item: LibraryCloudItem): void => {
    void window.electron.shell.openExternal(item.url).then(result => {
      if (!result.success) setInteractionError(result.error ?? i18nService.t('unknownError'));
    });
  };

  const openItem = (item: LibraryCloudItem): void => {
    onDetailOpen();
    if (item.itemKind === LibraryItemKind.SharedFile) {
      setActiveItem(item);
    } else {
      setActiveSite(item);
    }
  };

  const buildMenuItems = (item: LibraryCloudItem): CardOverflowMenuItem[] => {
    const menuItems: CardOverflowMenuItem[] = [
      {
        key: 'settings',
        label: item.itemKind === LibraryItemKind.SharedFile
          ? i18nService.t('libraryShareSettings')
          : i18nService.t('libraryManageSite'),
        icon: <Cog6ToothIcon className="h-4 w-4" />,
        onSelect: () => openItem(item),
      },
      {
        key: 'open-link',
        label: i18nService.t('libraryOpenLink'),
        icon: <ArrowTopRightOnSquareIcon className="h-4 w-4" />,
        onSelect: () => openLink(item),
      },
      {
        key: 'copy-link',
        label: i18nService.t('libraryCopyLink'),
        icon: <ClipboardDocumentIcon className="h-4 w-4" />,
        onSelect: () => copyLink(item),
      },
      {
        key: 'favorite',
        label: item.isFavorite
          ? i18nService.t('libraryRemoveFavorite')
          : i18nService.t('libraryAddFavorite'),
        icon: item.isFavorite
          ? <StarSolidIcon className="h-4 w-4 text-amber-500" />
          : <StarIcon className="h-4 w-4" />,
        onSelect: () => onToggleFavorite(item),
      },
    ];
    if (item.latestSession) {
      menuItems.push({
        key: 'related-sessions',
        label: i18nService.t('libraryRelatedSessions'),
        icon: <ChatBubbleLeftRightIcon className="h-4 w-4" />,
        trailing: <span className="text-tertiary">1</span>,
        children: [{
          key: `session:${item.latestSession.sessionId}`,
          label: item.latestSession.title,
          onSelect: () => onOpenSession(item.latestSession as LibrarySessionRef),
        }],
      });
    }
    return menuItems;
  };

  const getSiteDomain = (item: DeployedSiteItem): string => {
    try {
      return new URL(item.url).host;
    } catch {
      return item.url;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-8 py-6">
      <div className="sticky top-0 z-10 border-b border-border bg-background pb-3 pt-1">
        <div className="flex min-w-[760px] items-center gap-3">
          <LibraryCategoryDropdown
            value={category}
            options={CATEGORY_FILTERS.filter(value => (
              !hideSites || value !== LibraryCategory.Site
            ))}
            onChange={onCategoryChange}
          />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <label className="relative w-56">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-tertiary" />
              <input
                value={keywordInput}
                onChange={event => onKeywordInputChange(event.target.value)}
                placeholder={i18nService.t('librarySearchCloudPlaceholder')}
                className="h-9 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-tertiary focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <HeaderAction
              label={i18nService.t('libraryFavorites')}
              aria-pressed={favoritesOnly}
              onClick={onToggleFavoritesOnly}
              disabled={!isAuthenticated}
              className={favoritesOnly
                ? 'bg-amber-500/10 !text-amber-500 hover:!text-amber-500'
                : ''}
            >
              {favoritesOnly
                ? <StarSolidIcon className="h-4 w-4" />
                : <StarIcon className="h-4 w-4" />}
            </HeaderAction>
            <LibraryAvailabilityDropdown
              value={status}
              options={STATUS_FILTERS}
              onChange={onStatusChange}
            />
            <HeaderAction label={i18nService.t('refresh')} align={TooltipAlign.End} onClick={onRefresh} disabled={loading}>
              <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </HeaderAction>
          </div>
        </div>
      </div>

      {(error || interactionError) && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span>{interactionError ?? error}</span>
          <button type="button" onClick={onRefresh} className="ml-3 inline-flex items-center gap-1">
            <ArrowPathIcon className="h-3.5 w-3.5" />{i18nService.t('retry')}
          </button>
        </div>
      )}

      {!isAuthenticated ? (
        <div className="mt-8 rounded-xl border border-border bg-surface px-4 py-8 text-center text-xs">
          <p className="text-secondary">{i18nService.t('libraryLoginForCloud')}</p>
          <button type="button" onClick={onShowLogin} className="mt-3 font-medium text-primary">
            {i18nService.t('login')}
          </button>
        </div>
      ) : loading ? (
        <div className="mt-6 border-y border-border">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-16 animate-pulse border-b border-border bg-surface-raised/40 last:border-b-0" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-border py-16 text-center">
          <h2 className="text-sm font-medium text-foreground">{i18nService.t('libraryCloudEmptyTitle')}</h2>
          <p className="mt-1 text-xs text-secondary">{i18nService.t('libraryCloudEmptyDescription')}</p>
        </div>
      ) : (
        <div className="mt-6 min-w-[760px] border-y border-border">
          <div className="grid grid-cols-[minmax(320px,1fr)_120px_140px_44px] items-center gap-4 border-b border-border px-4 py-2.5 text-[11px] font-medium text-tertiary">
            <span>{i18nService.t('libraryCloudColumnResource')}</span>
            <span>{i18nService.t('librarySharedColumnStatus')}</span>
            <span>{i18nService.t('librarySharedColumnAccess')}</span>
            <span className="text-right">{i18nService.t('librarySharedColumnActions')}</span>
          </div>
          {items.map(item => (
            <div
              key={`${item.itemKind}:${item.shareId}`}
              role="button"
              tabIndex={0}
              onClick={() => openItem(item)}
              onKeyDown={event => {
                if (event.key === 'Enter' && event.currentTarget === event.target) {
                  openItem(item);
                }
              }}
              className="grid min-h-16 grid-cols-[minmax(320px,1fr)_120px_140px_44px] items-center gap-4 border-b border-border px-4 transition-colors last:border-b-0 hover:bg-surface-raised/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/30"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
                  {item.itemKind === LibraryItemKind.DeployedSite ? (
                    <GlobeAltIcon className="h-[18px] w-[18px] text-primary" />
                  ) : (
                    <FileTypeIcon fileName={getLibraryDisplayFileName(item)} className="h-[18px] w-[18px]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {getLibraryDisplayFileName(item)}
                  </div>
                  {item.itemKind === LibraryItemKind.DeployedSite && (
                    <div className="mt-0.5 truncate text-[11px] text-tertiary">
                      {getSiteDomain(item)}
                    </div>
                  )}
                </div>
              </div>
              <CloudAvailabilityBadge item={item} />
              <span className="text-xs text-secondary">{getLibraryAccessModeLabel(item)}</span>
              <CardOverflowMenu
                items={buildMenuItems(item)}
                menuWidthPx={LIBRARY_ACTION_MENU_WIDTH_PX}
                className="!h-8 !w-8 text-tertiary hover:bg-surface hover:text-foreground"
              />
            </div>
          ))}
        </div>
      )}

      {!loading && data.hasMore && (
        <div ref={loadMoreSentinelRef} className="flex h-14 items-center justify-center" aria-live="polite">
          {loadingMore && (
            <>
              <ArrowPathIcon className="h-4 w-4 animate-spin text-tertiary" aria-hidden="true" />
              <span className="sr-only">{i18nService.t('loading')}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LibraryCloudView;
