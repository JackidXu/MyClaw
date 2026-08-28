import { app, net } from 'electron';

import type { SqliteStore } from '../sqliteStore';
import { recordApiTraffic } from './networkInterceptor';

export type HttpTarget = 'admin' | 'biz';

export interface MainHttpRequestOptions {
  headers?: Record<string, string>;
  skipAuth?: boolean;
  /** 目标后端，默认 'admin' */
  target?: HttpTarget;
}

export interface MainApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

let sqliteStoreGetter: (() => SqliteStore | null) | null = null;
let unauthorizedBroadcastHandler: (() => void) | null = null;

/** 注入主进程 SqliteStore 访问器 */
export function setMainHttpClientStoreGetter(getter: () => SqliteStore | null): void {
  sqliteStoreGetter = getter;
}

/** 注入未授权广播通知器（用于 401 触发全局登录弹窗） */
export function setUnauthorizedBroadcastHandler(handler: () => void): void {
  unauthorizedBroadcastHandler = handler;
}

import { getAdminBaseUrl, getBizBaseUrl } from '../../shared/endpoints';

export { getAdminBaseUrl, getBizBaseUrl };

/** 解析完整目标 URL */
export function resolveTargetUrl(pathOrUrl: string, target: HttpTarget = 'admin'): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  const baseUrl = target === 'biz' ? getBizBaseUrl() : getAdminBaseUrl();
  return `${baseUrl.replace(/\/+$/, '')}${cleanPath}`;
}

/**
 * 主进程统一 HTTP 请求客户端
 * 自动注入 Authorization、X-Client-Version、X-App-Platform、Content-Type
 */
export class MainHttpClient {
  private getCommonHeaders(options?: MainHttpRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    // 统一附带应用版本和平台信息
    try {
      const version = app?.getVersion?.();
      if (version && !headers['X-Client-Version']) {
        headers['X-Client-Version'] = version;
      }
      if (!headers['X-App-Platform']) {
        headers['X-App-Platform'] = process.platform;
      }
    } catch {
      // 容错处理
    }

    // 自动附带用户长效访问令牌
    if (!options?.skipAuth && !headers['Authorization']) {
      const store = sqliteStoreGetter?.() || null;
      const token = store?.get<string>('user_access_token');
      if (token && typeof token === 'string' && token.trim()) {
        headers['Authorization'] = `Bearer ${token.trim()}`;
      }
    }

    return headers;
  }

  private handleAuthFailure(): void {
    try {
      const store = sqliteStoreGetter?.() || null;
      store?.delete('user_access_token');
      unauthorizedBroadcastHandler?.();
    } catch {
      // 容错
    }
  }

  public async request<T = any>(
    urlOrPath: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
    body?: unknown,
    options?: MainHttpRequestOptions,
  ): Promise<MainApiResponse<T>> {
    const fullUrl = resolveTargetUrl(urlOrPath, options?.target || 'admin');
    const finalHeaders = this.getCommonHeaders(options);
    const payload = (method !== 'GET' && body !== undefined)
      ? (typeof body === 'string' ? body : JSON.stringify(body))
      : undefined;

    const reqId = `main_http_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    recordApiTraffic({
      id: reqId,
      type: 'request',
      timestamp: Date.now(),
      method: method.toUpperCase(),
      url: fullUrl,
      headers: finalHeaders,
      body,
    });

    try {
      const response = await net.fetch(fullUrl, {
        method,
        headers: finalHeaders,
        body: payload,
      });

      let responseData: any = null;
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = text;
      }

      recordApiTraffic({
        id: reqId,
        type: 'response',
        timestamp: Date.now(),
        method: method.toUpperCase(),
        url: fullUrl,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        responseData,
      });

      // 401 未授权 或 PHP 10001 登录失效判断 (403 代表无权限，不应退出登录)
      const isPhpAuthError = responseData && typeof responseData === 'object' && (
        responseData.code === 10001 ||
        (typeof responseData.message === 'string' && (responseData.message.includes('未登录') || responseData.message.includes('认证失败')))
      );

      if ((response.status === 401 || isPhpAuthError) && !options?.skipAuth) {
        this.handleAuthFailure();
      }

      return {
        ok: response.ok,
        status: response.status,
        data: responseData as T,
        error: !response.ok
          ? (typeof responseData === 'object' && (responseData?.error || responseData?.message)
            ? (responseData.error || responseData.message)
            : `HTTP ${response.status}`)
          : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordApiTraffic({
        id: reqId,
        type: 'error',
        timestamp: Date.now(),
        method: method.toUpperCase(),
        url: fullUrl,
        error: message,
      });
      return {
        ok: false,
        status: 0,
        data: null as unknown as T,
        error: message,
      };
    }
  }

  /** Admin 中枢服务接口 (Node: admin-claw) */
  public readonly admin = {
    get: <T = any>(path: string, options?: Omit<MainHttpRequestOptions, 'target'>) =>
      this.request<T>(path, 'GET', undefined, { ...options, target: 'admin' }),
    post: <T = any>(path: string, body?: unknown, options?: Omit<MainHttpRequestOptions, 'target'>) =>
      this.request<T>(path, 'POST', body, { ...options, target: 'admin' }),
    put: <T = any>(path: string, body?: unknown, options?: Omit<MainHttpRequestOptions, 'target'>) =>
      this.request<T>(path, 'PUT', body, { ...options, target: 'admin' }),
    delete: <T = any>(path: string, options?: Omit<MainHttpRequestOptions, 'target'>) =>
      this.request<T>(path, 'DELETE', undefined, { ...options, target: 'admin' }),
  };

  /** Biz 业务后端接口 (PHP: scrm) */
  public readonly biz = {
    get: <T = any>(path: string, options?: Omit<MainHttpRequestOptions, 'target'>) =>
      this.request<T>(path, 'GET', undefined, { ...options, target: 'biz' }),
    post: <T = any>(path: string, body?: unknown, options?: Omit<MainHttpRequestOptions, 'target'>) =>
      this.request<T>(path, 'POST', body, { ...options, target: 'biz' }),
    put: <T = any>(path: string, body?: unknown, options?: Omit<MainHttpRequestOptions, 'target'>) =>
      this.request<T>(path, 'PUT', body, { ...options, target: 'biz' }),
    delete: <T = any>(path: string, options?: Omit<MainHttpRequestOptions, 'target'>) =>
      this.request<T>(path, 'DELETE', undefined, { ...options, target: 'biz' }),
  };
}

export const mainHttpClient = new MainHttpClient();
