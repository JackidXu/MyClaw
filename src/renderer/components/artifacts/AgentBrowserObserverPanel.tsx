import {
  ArrowPathIcon,
  ComputerDesktopIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  type AgentBrowserObservation,
  AgentBrowserObservationStatus,
} from '@shared/browserWebAccess/constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { i18nService } from '@/services/i18n';

const OBSERVATION_REFRESH_INTERVAL_MS = 3_000;

interface AgentBrowserObserverPanelProps {
  sessionId: string;
  observation: AgentBrowserObservation | null;
}

const AgentBrowserObserverPanel: React.FC<AgentBrowserObserverPanelProps> = ({
  sessionId,
  observation,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const selectedTargetIdRef = useRef<string | undefined>(observation?.targetId);

  useEffect(() => {
    selectedTargetIdRef.current = observation?.targetId;
  }, [observation?.targetId]);

  const refresh = useCallback(async (targetId?: string) => {
    if (!window.electron?.openclaw?.browser || isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await window.electron.openclaw.browser.refreshObservation({ sessionId, targetId });
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh(selectedTargetIdRef.current);
    const timer = window.setInterval(() => {
      void refresh(selectedTargetIdRef.current);
    }, OBSERVATION_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const handleTargetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const targetId = event.target.value;
    selectedTargetIdRef.current = targetId;
    void refresh(targetId);
  };

  const isLoading = observation?.status === AgentBrowserObservationStatus.Loading;
  const isError = observation?.status === AgentBrowserObservationStatus.Error;
  const hasScreenshot = Boolean(observation?.screenshotDataUrl);
  const updatedTime = observation?.updatedAt
    ? new Date(observation.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <ComputerDesktopIcon className="h-4 w-4 shrink-0 text-secondary" />
        {observation?.tabs.length ? (
          <select
            value={observation.targetId ?? ''}
            onChange={handleTargetChange}
            className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
            title={observation.url}
          >
            {observation.tabs.map(tab => (
              <option key={tab.targetId} value={tab.targetId}>
                {tab.title || tab.url || tab.suggestedTargetId || tab.targetId}
              </option>
            ))}
          </select>
        ) : (
          <div className="min-w-0 flex-1 truncate text-xs text-secondary">
            {i18nService.t('agentBrowserTab')}
          </div>
        )}
        <span className="hidden shrink-0 text-[11px] text-muted sm:inline">
          {i18nService.t('agentBrowserReadOnly')}{updatedTime ? ` · ${updatedTime}` : ''}
        </span>
        <button
          type="button"
          onClick={() => void refresh(selectedTargetIdRef.current)}
          disabled={isRefreshing}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface-raised hover:text-foreground disabled:opacity-50"
          title={i18nService.t('agentBrowserRefresh')}
          aria-label={i18nService.t('agentBrowserRefresh')}
        >
          <ArrowPathIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {observation?.url ? (
        <div
          className="shrink-0 truncate border-b border-border bg-surface px-3 py-1.5 text-[11px] text-secondary"
          title={observation.url}
        >
          {observation.url}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-surface">
        {hasScreenshot ? (
          <img
            src={observation?.screenshotDataUrl}
            alt={observation?.title || i18nService.t('agentBrowserTab')}
            className="max-h-full max-w-full select-none object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center text-secondary">
            {isError ? (
              <ExclamationTriangleIcon className="h-9 w-9 text-amber-500" />
            ) : (
              <ComputerDesktopIcon className="h-10 w-10 text-muted" />
            )}
            <p className="text-sm">
              {isLoading || isRefreshing
                ? i18nService.t('agentBrowserLoading')
                : isError
                  ? i18nService.t('agentBrowserUnavailable')
                  : i18nService.t('agentBrowserEmpty')}
            </p>
          </div>
        )}

        {(isLoading || isRefreshing) && hasScreenshot ? (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[11px] text-secondary shadow-sm backdrop-blur">
            <ArrowPathIcon className="h-3 w-3 animate-spin" />
            {i18nService.t('agentBrowserLoading')}
          </div>
        ) : null}

        {isError && hasScreenshot ? (
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-background/95 px-3 py-2 text-xs text-secondary shadow-sm backdrop-blur">
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-500" />
            <span>{i18nService.t('agentBrowserUnavailable')}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AgentBrowserObserverPanel;
