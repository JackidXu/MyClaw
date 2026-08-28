import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ComputerDesktopIcon,
  StopIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  BrowserCredentialLoginStatus,
} from '@shared/browserCredentials/constants';
import type {
  AgentBrowserHostResponse,
  AgentBrowserHostState,
} from '@shared/browserWebAccess/constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { i18nService } from '@/services/i18n';

interface AgentBrowserInAppPanelProps {
  sessionId: string;
  visible: boolean;
}

const applyResponseState = (
  response: AgentBrowserHostResponse,
  setState: React.Dispatch<React.SetStateAction<AgentBrowserHostState | null>>,
): void => {
  if (response.state) setState(response.state);
};

const AgentBrowserInAppPanel: React.FC<AgentBrowserInAppPanelProps> = ({
  sessionId,
  visible,
}) => {
  const [state, setState] = useState<AgentBrowserHostState | null>(null);
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const browserViewportRef = useRef<HTMLDivElement>(null);
  const addressFocusedRef = useRef(false);
  const syncFrameRef = useRef<number | null>(null);

  const selectedTab = state?.tabs.find(tab => tab.pageId === state.selectedPageId);
  const credentialLoginBusy = state?.credentialLogin?.status === BrowserCredentialLoginStatus.AwaitingApproval
    || state?.credentialLogin?.status === BrowserCredentialLoginStatus.SigningIn;
  const credentialLoginStatusKey = state?.credentialLogin
    ? {
        [BrowserCredentialLoginStatus.AwaitingApproval]: 'agentBrowserCredentialAwaitingApproval',
        [BrowserCredentialLoginStatus.SigningIn]: 'agentBrowserCredentialSigningIn',
        [BrowserCredentialLoginStatus.Authenticated]: 'agentBrowserCredentialAuthenticated',
        [BrowserCredentialLoginStatus.Submitted]: 'agentBrowserCredentialSubmitted',
        [BrowserCredentialLoginStatus.NeedsMfa]: 'agentBrowserCredentialNeedsMfa',
        [BrowserCredentialLoginStatus.NeedsCaptcha]: 'agentBrowserCredentialNeedsCaptcha',
        [BrowserCredentialLoginStatus.Denied]: 'agentBrowserCredentialDenied',
        [BrowserCredentialLoginStatus.Failed]: 'agentBrowserCredentialFailed',
      }[state.credentialLogin.status]
    : undefined;

  useEffect(() => {
    if (!addressFocusedRef.current) {
      setAddress(selectedTab?.url === 'about:blank' ? '' : selectedTab?.url ?? '');
    }
  }, [selectedTab?.url]);

  useEffect(() => {
    const browserApi = window.electron?.openclaw?.browser;
    if (!browserApi) return undefined;
    let cancelled = false;
    void browserApi.getHostState({ sessionId }).then(response => {
      if (!cancelled) applyResponseState(response, setState);
    }).catch(() => {});
    const unsubscribe = browserApi.onHostState(event => {
      setState(event.state);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId]);

  const syncNativeView = useCallback(() => {
    const browserApi = window.electron?.openclaw?.browser;
    const element = browserViewportRef.current;
    if (!browserApi || !element) return;
    const rect = element.getBoundingClientRect();
    const centerX = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
    const centerY = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(centerX, centerY);
    const unobscured = Boolean(hit && (hit === element || element.contains(hit)));
    const shouldShow = visible
      && rect.width >= 2
      && rect.height >= 2
      && unobscured;
    void browserApi.setHostView({
      sessionId,
      visible: shouldShow,
      ...(shouldShow
        ? {
            bounds: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            },
          }
        : {}),
    }).then(response => applyResponseState(response, setState)).catch(() => {});
  }, [sessionId, visible]);

  const scheduleNativeViewSync = useCallback(() => {
    if (syncFrameRef.current !== null) window.cancelAnimationFrame(syncFrameRef.current);
    syncFrameRef.current = window.requestAnimationFrame(() => {
      syncFrameRef.current = null;
      syncNativeView();
    });
  }, [syncNativeView]);

  useEffect(() => {
    const element = browserViewportRef.current;
    if (!element) return undefined;
    const resizeObserver = new ResizeObserver(scheduleNativeViewSync);
    resizeObserver.observe(element);
    const mutationObserver = new MutationObserver(scheduleNativeViewSync);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    window.addEventListener('resize', scheduleNativeViewSync);
    window.addEventListener('scroll', scheduleNativeViewSync, true);
    scheduleNativeViewSync();
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', scheduleNativeViewSync);
      window.removeEventListener('scroll', scheduleNativeViewSync, true);
      if (syncFrameRef.current !== null) window.cancelAnimationFrame(syncFrameRef.current);
      void window.electron?.openclaw?.browser.setHostView({ sessionId, visible: false });
    };
  }, [scheduleNativeViewSync, sessionId]);

  const runAction = useCallback(async (
    action: () => Promise<AgentBrowserHostResponse>,
  ) => {
    const response = await action();
    applyResponseState(response, setState);
  }, []);

  const handleNavigate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address.trim()) return;
    setSubmitting(true);
    try {
      await runAction(() => window.electron.openclaw.browser.navigateHost({
        sessionId,
        url: address,
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <button
          type="button"
          disabled={credentialLoginBusy || !selectedTab?.canGoBack}
          onClick={() => void runAction(() => window.electron.openclaw.browser.goBackHost({ sessionId }))}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-surface-raised hover:text-foreground disabled:opacity-35"
          title={i18nService.t('agentBrowserBack')}
          aria-label={i18nService.t('agentBrowserBack')}
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={credentialLoginBusy || !selectedTab?.canGoForward}
          onClick={() => void runAction(() => window.electron.openclaw.browser.goForwardHost({ sessionId }))}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-surface-raised hover:text-foreground disabled:opacity-35"
          title={i18nService.t('agentBrowserForward')}
          aria-label={i18nService.t('agentBrowserForward')}
        >
          <ArrowRightIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={credentialLoginBusy || !selectedTab}
          onClick={() => void runAction(() => selectedTab?.loading
            ? window.electron.openclaw.browser.stopHost({ sessionId })
            : window.electron.openclaw.browser.reloadHost({ sessionId }))}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-surface-raised hover:text-foreground disabled:opacity-35"
          title={i18nService.t(selectedTab?.loading ? 'agentBrowserStop' : 'agentBrowserReload')}
          aria-label={i18nService.t(selectedTab?.loading ? 'agentBrowserStop' : 'agentBrowserReload')}
        >
          {selectedTab?.loading
            ? <StopIcon className="h-3.5 w-3.5" />
            : <ArrowPathIcon className="h-4 w-4" />}
        </button>
        <form onSubmit={handleNavigate} className="min-w-0 flex-1">
          <input
            value={address}
            onChange={event => setAddress(event.target.value)}
            onFocus={() => { addressFocusedRef.current = true; }}
            onBlur={() => { addressFocusedRef.current = false; }}
            placeholder={i18nService.t('agentBrowserAddressPlaceholder')}
            disabled={submitting || credentialLoginBusy}
            className="h-7 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-foreground outline-none placeholder:text-muted focus:border-primary"
          />
        </form>
        <span className="hidden shrink-0 text-[11px] text-muted xl:inline">
          {i18nService.t('agentBrowserInteractive')}
        </span>
      </div>

      {state?.tabs.length ? (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface px-2">
          <select
            value={state.selectedPageId ?? ''}
            disabled={credentialLoginBusy}
            onChange={event => void runAction(() => window.electron.openclaw.browser.selectHostPage({
              sessionId,
              pageId: Number(event.target.value),
            }))}
            className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
          >
            {state.tabs.map(tab => (
              <option key={tab.pageId} value={tab.pageId}>
                {tab.title || tab.url || `#${tab.pageId}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={credentialLoginBusy || !state.selectedPageId}
            onClick={() => state.selectedPageId && void runAction(() =>
              window.electron.openclaw.browser.closeHostPage({
                sessionId,
                pageId: state.selectedPageId!,
              }))}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-secondary hover:bg-surface-raised hover:text-foreground disabled:opacity-35"
            title={i18nService.t('agentBrowserCloseTab')}
            aria-label={i18nService.t('agentBrowserCloseTab')}
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {state?.error ? (
        <div className="shrink-0 truncate border-b border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-700 dark:text-amber-300" title={state.error}>
          {state.error}
        </div>
      ) : null}

      {credentialLoginStatusKey ? (
        <div className="shrink-0 border-b border-primary/20 bg-primary/10 px-3 py-1 text-[11px] text-primary">
          {i18nService.t(credentialLoginStatusKey)}
        </div>
      ) : null}

      <div
        ref={browserViewportRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-surface"
      >
        {!state?.tabs.length ? (
          <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center text-secondary">
            <ComputerDesktopIcon className="h-10 w-10 text-muted" />
            <p className="text-sm">{i18nService.t('agentBrowserInAppEmpty')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AgentBrowserInAppPanel;
