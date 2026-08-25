import { app } from 'electron';

import { HtmlSharePublicRoute } from '../../shared/htmlShare/constants';
import type { SqliteStore } from '../sqliteStore';

let cachedTestMode: boolean | null = null;

/**
 * Read testMode from store and cache it.
 * Call once at startup and again whenever app_config changes.
 */
export function refreshEndpointsTestMode(store: SqliteStore): void {
  const appConfig = store.get<any>('app_config');
  cachedTestMode = appConfig?.app?.testMode === true;
}

/**
 * Whether the app is in test mode.
 * Uses cached value after init; falls back to !app.isPackaged before init.
 */
export const isTestModeEnabled = (): boolean => {
  return !app?.isPackaged || cachedTestMode === true;
};

/**
 * Server API base URL — switches based on testMode.
 * Used for auth exchange/refresh, models, proxy, etc.
 */
export const getServerApiBaseUrl = (): string => {
  return isTestModeEnabled()
    ? 'http://localhost:8082'
    : 'https://admin.claw.chaohui.ai';
};

export const getHtmlSharePublicBaseUrl = (): string => {
  return `${getServerApiBaseUrl()}${HtmlSharePublicRoute.Root}`;
};

export const getUpdateCheckUrl = (): string => (
  `https://scrm0.cdn.banchengyun.com/heyclaw/downloads/version.json?_t=${Date.now()}`
);

export const getManualUpdateCheckUrl = (): string => (
  `https://scrm0.cdn.banchengyun.com/heyclaw/downloads/version.json?_t=${Date.now()}`
);

export const getFallbackDownloadUrl = (): string => (
  'https://claw.chaohui.ai/'
);

export const getSkillStoreUrl = (): string => `${getServerApiBaseUrl()}/api/skills`;

// Portal 页面
const PORTAL_BASE_TEST = 'https://lobsterai.inner.youdao.com/portal#';
const PORTAL_BASE_PROD = 'https://lobsterai.youdao.com/portal#';

const getPortalBase = (): string => isTestModeEnabled() ? PORTAL_BASE_TEST : PORTAL_BASE_PROD;

export const getPortalTasksUrl = (): string => `${getPortalBase()}/profile/detail?tab=tasks`;

export const getKitStoreUrl = (): string => `${getServerApiBaseUrl()}/api/kits`;

export const getQuickActionsUrl = (): string => `${getServerApiBaseUrl()}/api/quick-actions`;
