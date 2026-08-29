import {
  ActivityPlacement,
  type ActivityResult,
  ActivityServerErrorCode,
  ActivitySlotState,
  DailyCheckInAction,
  type DailyCheckInActionResponse,
  type DailyCheckInContextResponse,
  type DailyCheckInDescriptor,
} from '@shared/activity/constants';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';

import { i18nService } from '../services/i18n';
import { vipService } from '../services/vipService';
import type { RootState } from '../store';
import {
  canClaimDailyCheckIn,
  getDailyCheckInAuthScopeKey,
  isActiveDailyCheckInContext,
  isDailyCheckInContext,
  isDailyCheckInDescriptor,
} from './dailyCheckInActivityState';
import {
  startDailyCheckInAutoRefresh,
} from './dailyCheckInAutoRefresh';
import { logSidebarExperienceDiagnostic } from './sidebarExperienceDiagnostics';

const DAILY_CHECK_IN_UPDATED_EVENT = 'lobster:daily-check-in-updated';

interface DailyCheckInLoadOptions {
  retryRevision?: boolean;
  silent?: boolean;
}

export const DailyCheckInLoadResultStatus = {
  Ready: 'ready',
  Unavailable: 'unavailable',
  Failed: 'failed',
} as const;

export interface DailyCheckInSnapshot {
  descriptor: DailyCheckInDescriptor;
  context: DailyCheckInContextResponse;
}

type DailyCheckInLoadResult =
  | {
      status: typeof DailyCheckInLoadResultStatus.Ready;
      snapshot: DailyCheckInSnapshot;
    }
  | {
      status: typeof DailyCheckInLoadResultStatus.Unavailable;
      code?: number;
    }
  | {
      status: typeof DailyCheckInLoadResultStatus.Failed;
      code?: number;
    };

interface ScopedDailyCheckInSnapshot {
  accountScope: string;
  snapshot: DailyCheckInSnapshot;
}

export interface UseDailyCheckInActivityOptions {
  enabled?: boolean;
  autoRefresh?: boolean;
  initialSnapshot?: DailyCheckInSnapshot | null;
  loadOnMount?: boolean;
}

export interface UseDailyCheckInActivityResult {
  snapshot: DailyCheckInSnapshot | null;
  loading: boolean;
  claiming: boolean;
  refresh: () => Promise<void>;
  claim: () => Promise<DailyCheckInActionResponse>;
}

export class DailyCheckInRequestError extends Error {
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'DailyCheckInRequestError';
    this.code = code;
  }
}

export class DailyCheckInStaleRequestError extends Error {
  constructor() {
    super('Daily check-in request no longer belongs to the active account');
    this.name = 'DailyCheckInStaleRequestError';
  }
}

export async function loadDailyCheckInSnapshot({
  retryRevision = true,
}: Pick<DailyCheckInLoadOptions, 'retryRevision'> = {}): Promise<DailyCheckInLoadResult> {
  const slot = await window.electron.activity.getSlot({
    placement: ActivityPlacement.DesktopSidebar,
  });
  if (!slot.success) {
    return {
      status: DailyCheckInLoadResultStatus.Failed,
      code: slot.code,
    };
  }
  if (!slot.data
      || slot.data.slotState !== ActivitySlotState.Available
      || !isDailyCheckInDescriptor(slot.data.activity)) {
    return { status: DailyCheckInLoadResultStatus.Unavailable };
  }

  const descriptor = slot.data.activity;
  const context = await window.electron.activity.getContext({
    placement: ActivityPlacement.DesktopSidebar,
    activityCode: descriptor.activityCode,
    configRevision: descriptor.configRevision,
  });
  if (!context.success) {
    if (retryRevision
        && context.code === ActivityServerErrorCode.RevisionMismatch) {
      return loadDailyCheckInSnapshot({ retryRevision: false });
    }
    return {
      status: DailyCheckInLoadResultStatus.Failed,
      code: context.code,
    };
  }
  if (!isActiveDailyCheckInContext(context.data)
      || context.data.activityCode !== descriptor.activityCode
      || context.data.configRevision !== descriptor.configRevision) {
    return { status: DailyCheckInLoadResultStatus.Unavailable };
  }
  return {
    status: DailyCheckInLoadResultStatus.Ready,
    snapshot: { descriptor, context: context.data },
  };
}

function createIdempotencyKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `daily-check-in-${suffix}`.slice(0, 64);
}

export function useDailyCheckInActivity(
  {
    enabled = true,
    autoRefresh = true,
    initialSnapshot = null,
    loadOnMount = true,
  }: UseDailyCheckInActivityOptions = {},
): UseDailyCheckInActivityResult {
  const authAccountScope = useSelector(
    (state: RootState) => getDailyCheckInAuthScopeKey(
      state.auth.ownerAccountKey,
      state.auth.accountGeneration,
    ),
  );
  const [scopedSnapshot, setScopedSnapshot] = useState<ScopedDailyCheckInSnapshot | null>(
    () => (initialSnapshot
      ? {
          accountScope: authAccountScope,
          snapshot: initialSnapshot,
        }
      : null),
  );
  const snapshot = scopedSnapshot?.accountScope === authAccountScope
    ? scopedSnapshot.snapshot
    : null;
  const [loading, setLoading] = useState(
    () => enabled && loadOnMount && !initialSnapshot,
  );
  const [claiming, setClaiming] = useState(false);
  const activeLoadRequestIdRef = useRef(0);
  const activeClaimRequestIdRef = useRef(0);

  const load = useCallback(async (
    { retryRevision = true, silent = false }: DailyCheckInLoadOptions = {},
  ): Promise<void> => {
    const requestId = ++activeLoadRequestIdRef.current;
    const requestAccountScope = authAccountScope;
    const isCurrentRequest = () => requestId === activeLoadRequestIdRef.current;

    if (!enabled) {
      if (isCurrentRequest()) {
        setScopedSnapshot(null);
        setLoading(false);
      }
      return;
    }
    if (isCurrentRequest() && !silent) setLoading(true);
    try {
      const result = await loadDailyCheckInSnapshot({ retryRevision });
      if (!isCurrentRequest()) return;
      if (result.status === DailyCheckInLoadResultStatus.Ready) {
        setScopedSnapshot({
          accountScope: requestAccountScope,
          snapshot: result.snapshot,
        });
        return;
      }
      if (result.status === DailyCheckInLoadResultStatus.Unavailable) {
        setScopedSnapshot(null);
        return;
      }
      if (!silent
          || result.code === ActivityServerErrorCode.NotActive
          || result.code === ActivityServerErrorCode.NotFound) {
        setScopedSnapshot(null);
      }
    } catch (error) {
      if (isCurrentRequest()) {
        logSidebarExperienceDiagnostic(
          'warn',
          'failed to load daily check-in activity',
          error,
        );
        if (!silent) setScopedSnapshot(null);
      }
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, [authAccountScope, enabled]);

  const refresh = useCallback(
    () => load({ silent: true }),
    [load],
  );

  useEffect(() => {
    if (!loadOnMount) {
      setLoading(false);
      return;
    }
    void load();
  }, [authAccountScope, load, loadOnMount]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handleActivityUpdate = () => void refresh();
    window.addEventListener(
      DAILY_CHECK_IN_UPDATED_EVENT,
      handleActivityUpdate,
    );
    return () => window.removeEventListener(
      DAILY_CHECK_IN_UPDATED_EVENT,
      handleActivityUpdate,
    );
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !autoRefresh) return undefined;
    return startDailyCheckInAutoRefresh(refresh);
  }, [autoRefresh, enabled, refresh]);

  const claim = useCallback(async (): Promise<DailyCheckInActionResponse> => {
    const claimRequestId = ++activeClaimRequestIdRef.current;
    const requestAccountScope = authAccountScope;
    const isCurrentClaim = () => claimRequestId === activeClaimRequestIdRef.current;

    if (!snapshot || !canClaimDailyCheckIn(snapshot.context)) {
      throw new DailyCheckInRequestError(
        i18nService.t('dailyCheckInClaimFailed'),
      );
    }

    setClaiming(true);
    try {
      const response = (await window.electron.activity.executeAction({
        placement: ActivityPlacement.DesktopSidebar,
        activityCode: snapshot.descriptor.activityCode,
        configRevision: snapshot.descriptor.configRevision,
        actionId: DailyCheckInAction.CheckIn,
        idempotencyKey: createIdempotencyKey(),
      })) as ActivityResult<DailyCheckInActionResponse>;

      if (!isCurrentClaim() || requestAccountScope !== authAccountScope) {
        throw new DailyCheckInStaleRequestError();
      }

      if (!response.success) {
        throw new DailyCheckInRequestError(
          response.error || i18nService.t('dailyCheckInClaimFailed'),
          response.code,
        );
      }

      if (response.data?.context && isDailyCheckInContext(response.data.context)) {
        setScopedSnapshot({
          accountScope: requestAccountScope,
          snapshot: {
            descriptor: snapshot.descriptor,
            context: response.data.context,
          },
        });
      } else {
        void refresh();
      }

      window.dispatchEvent(new CustomEvent(DAILY_CHECK_IN_UPDATED_EVENT));
      void vipService.refreshStatus().catch((error: unknown) => {
        logSidebarExperienceDiagnostic(
          'warn',
          'failed to refresh credits after daily check-in claim',
          error,
        );
      });

      return response.data;
    } finally {
      if (isCurrentClaim()) setClaiming(false);
    }
  }, [authAccountScope, refresh, snapshot]);

  return {
    snapshot,
    loading,
    claiming,
    refresh,
    claim,
  };
}
