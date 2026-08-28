import {
  type LogEventAction,
  LogReporterAction,
  LogReporterActionPrefix,
  LogReporterCategory,
  LogReporterEndpoint,
  LogReporterEntry,
  LogReporterProduct,
} from '../../shared/analytics/constants';
import { store } from '../store';
import { configService } from './config';

export {
  LogReporterAction,
  LogReporterActionPrefix,
  LogReporterCategory,
  LogReporterEndpoint,
  LogReporterEntry,
  LogReporterProduct,
};

type LogParamValue = string | number | boolean | null | undefined;

export type { LogEventAction };

export type LogEventParams = Record<string, LogParamValue> & {
  action: LogEventAction;
};

const logCommons = {
  _npid: LogReporterProduct.LobsterAI,
  _ncat: LogReporterCategory.Actions,
} as const;

export interface BuildLogUrlOptions {
  appVersion?: string;
  arch?: string;
  firstKeyfrom?: string;
  installationId?: string | null;
  language?: string;
  latestKeyfrom?: string;
  platform?: string;
  userId?: string;
  timestamp?: number;
}

const getWindowPlatform = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.electron?.platform || '';
};

const getWindowArch = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.electron?.arch || '';
};

export const buildLogUrl = (
  params: LogEventParams,
  options: BuildLogUrlOptions = {},
): string => {
  const url = new URL(LogReporterEndpoint.YoudaoAnalyzer);
  const config = configService.getConfig();
  const userId = options.userId ?? store.getState().auth.user?.yid ?? '';
  const installationId = options.installationId ?? null;
  const logParams: Record<string, LogParamValue> = {
    ...params,
    ...logCommons,
    app_version: options.appVersion ?? '',
    os_platform: options.platform ?? getWindowPlatform(),
    os_arch: options.arch ?? getWindowArch(),
    language: options.language ?? config.language,
    uuid: installationId,
    firstKeyfrom: options.firstKeyfrom,
    latestKeyfrom: options.latestKeyfrom,
    is_logged_in: userId.trim().length > 0,
    log_Usid: userId,
    uts: options.timestamp ?? Date.now(),
  };

  Object.entries(logParams).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.href;
};

export const reportYdAnalyzer = async (_params: LogEventParams): Promise<boolean> => {
  return false;
};
