import { randomUUID } from 'crypto';

import {
  type LogEventAction,
  LogReporterCategory,
  LogReporterEndpoint,
  LogReporterProduct,
  LogReporterStoreKey,
} from '../../shared/analytics/constants';
import type { SqliteStore } from '../sqliteStore';
import { getKeyfromAttribution } from './keyfromAttribution';

type LogParamValue = string | number | boolean | null | undefined;

export type MainLogEventParams = Record<string, LogParamValue> & {
  action: LogEventAction;
};

type MainLogReporterStore = Pick<SqliteStore, 'get' | 'set'>;

type MainLogReporterResponse = {
  ok: boolean;
  status: number;
};

export interface MainLogReporterOptions {
  appVersion: string;
  fetch: (url: string, signal: AbortSignal) => Promise<MainLogReporterResponse>;
  store: MainLogReporterStore;
  arch?: string;
  platform?: string;
  now?: () => number;
  createInstallationId?: () => string;
  maxConcurrentRequests?: number;
  requestTimeoutMs?: number;
}

export interface MainLogUrlContext {
  appVersion: string;
  arch: string;
  firstKeyfrom: string;
  installationId: string | null;
  language: string;
  latestKeyfrom: string;
  platform: string;
  timestamp: number;
  userId: string;
}

const logCommons = {
  _npid: LogReporterProduct.LobsterAI,
  _ncat: LogReporterCategory.Actions,
} as const;

const MAIN_LOG_REPORTER_REQUEST_TIMEOUT_MS = 10_000;
const MAIN_LOG_REPORTER_MAX_CONCURRENT_REQUESTS = 20;

const getTrimmedString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const getErrorName = (error: unknown): string => {
  if (error instanceof Error && error.name.trim()) return error.name.trim();
  return 'UnknownError';
};

export const buildMainLogUrl = (
  params: MainLogEventParams,
  context: MainLogUrlContext,
): string => {
  const url = new URL(LogReporterEndpoint.YoudaoAnalyzer);
  const logParams: Record<string, LogParamValue> = {
    ...params,
    ...logCommons,
    app_version: context.appVersion,
    os_platform: context.platform,
    os_arch: context.arch,
    language: context.language,
    uuid: context.installationId,
    firstKeyfrom: context.firstKeyfrom,
    latestKeyfrom: context.latestKeyfrom,
    is_logged_in: context.userId.length > 0,
    log_Usid: context.userId,
    uts: context.timestamp,
  };

  Object.entries(logParams).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.href;
};

export class MainLogReporter {
  private readonly options: MainLogReporterOptions;
  private activeRequestCount = 0;

  constructor(options: MainLogReporterOptions) {
    this.options = options;
  }

  async report(params: MainLogEventParams): Promise<boolean> {
    if (!this.isUsageAnalyticsEnabled()) {
      return false;
    }

    if (!params.action.trim()) {
      return false;
    }

    if (this.activeRequestCount >= this.getMaxConcurrentRequests()) {
      return false;
    }

    this.activeRequestCount += 1;
    try {
      const context = this.buildContext();
      const requestTimeoutMs = this.getRequestTimeoutMs();
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), requestTimeoutMs);
      let response: MainLogReporterResponse;
      try {
        response = await this.options.fetch(
          buildMainLogUrl(params, context),
          abortController.signal,
        );
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        return false;
      }
      return true;
    } catch {
      return false;
    } finally {
      this.activeRequestCount -= 1;
    }
  }

  private getMaxConcurrentRequests(): number {
    const configuredLimit = this.options.maxConcurrentRequests;
    return typeof configuredLimit === 'number'
      && Number.isInteger(configuredLimit)
      && configuredLimit > 0
      ? configuredLimit
      : MAIN_LOG_REPORTER_MAX_CONCURRENT_REQUESTS;
  }

  private getRequestTimeoutMs(): number {
    const configuredTimeout = this.options.requestTimeoutMs;
    return typeof configuredTimeout === 'number'
      && Number.isFinite(configuredTimeout)
      && configuredTimeout > 0
      ? configuredTimeout
      : MAIN_LOG_REPORTER_REQUEST_TIMEOUT_MS;
  }

  private isUsageAnalyticsEnabled(): boolean {
    try {
      const config = this.options.store.get<{ usageAnalyticsEnabled?: boolean }>(
        LogReporterStoreKey.AppConfig,
      );
      return config?.usageAnalyticsEnabled === true;
    } catch {
      return false;
    }
  }

  private buildContext(): MainLogUrlContext {
    const config = this.options.store.get<{ language?: string }>(LogReporterStoreKey.AppConfig);
    const authUser = this.options.store.get<Record<string, unknown>>(LogReporterStoreKey.AuthUser);
    const userId = getTrimmedString(authUser?.yid) || getTrimmedString(authUser?.userId);
    const { firstKeyfrom, latestKeyfrom } = getKeyfromAttribution(this.options.store);

    return {
      appVersion: this.options.appVersion,
      arch: this.options.arch ?? process.arch,
      firstKeyfrom,
      installationId: this.getOrCreateInstallationId(),
      language: getTrimmedString(config?.language),
      latestKeyfrom,
      platform: this.options.platform ?? process.platform,
      timestamp: this.options.now?.() ?? Date.now(),
      userId,
    };
  }

  private getOrCreateInstallationId(): string | null {
    try {
      const existing = getTrimmedString(
        this.options.store.get<string>(LogReporterStoreKey.InstallationUuid),
      );
      if (existing) return existing;

      const installationId = this.options.createInstallationId?.() ?? randomUUID();
      this.options.store.set(LogReporterStoreKey.InstallationUuid, installationId);
      return installationId;
    } catch (error) {
      console.warn(`[MainLogReporter] failed to get installation uuid (${getErrorName(error)})`);
      return null;
    }
  }
}
