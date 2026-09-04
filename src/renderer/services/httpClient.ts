import { getAdminBaseUrl } from '../../shared/endpoints';
import { logoutAndDeactivate } from './authStorage';

export type HttpTarget = 'admin' | 'biz';

export interface RequestOptions {
  /** 相对路径 (如 /api/vip/status) 或完整 URL */
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  /** 目标后端：'admin' (Node admin-claw) 或 'biz' (PHP scrm)，默认 'admin' */
  target?: HttpTarget;
  /** 是否跳过自动附带 Authorization 头，默认 false */
  skipAuth?: boolean;
  /** 是否跳过 401 全局拦截处理，默认 false */
  skip401Handler?: boolean;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

// 401 全局防抖锁（3秒内只触发一次，防止并发风暴）
let last401TriggerTime = 0;

export function handleUnauthorized() {
  const now = Date.now();
  if (now - last401TriggerTime < 3000) {
    return;
  }
  last401TriggerTime = now;

  logoutAndDeactivate({ toastMessage: '登录已过期或凭证失效，请重新登录' });
}

export class HttpClient {
  /**
   * 通用请求核心方法
   */
  public async request<T = any>(options: RequestOptions): Promise<ApiResponse<T>> {
    const { url, method = 'GET', headers = {}, body, target = 'admin', skipAuth = false, skip401Handler = false } = options;

    let payloadBody: any = undefined;
    if (body !== undefined && body !== null) {
      payloadBody = typeof body === 'string' ? body : JSON.stringify(body);
    }

    try {
      const resp = (await window.electron.api.fetch({
        url,
        method,
        headers,
        body: payloadBody,
        target,
        skipAuth,
      })) as { ok: boolean; status?: number; data?: any };

      const status = resp.status || (resp.ok ? 200 : 500);

      // 全局未授权识别：401/403 状态码、PHP 业务状态码 10001、或包体明确提示未授权/未登录
      const data = resp.data;
      const isAuthErrorBody =
        data &&
        typeof data === 'object' &&
        ((data.success === false && (data.error?.includes('未授权') || data.error?.includes('请先登录') || data.message?.includes('未授权') || data.message?.includes('请先登录'))) ||
          data.code === 10001 ||
          data.code === 401 ||
          (typeof data.message === 'string' && (data.message.includes('认证失败') || data.message.includes('未登录'))));

      if ((status === 401 || status === 403 || isAuthErrorBody) && !skip401Handler && !skipAuth) {
        handleUnauthorized();
      }

      return {
        ok: resp.ok,
        status,
        data: resp.data,
        error: !resp.ok ? (typeof data === 'object' && (data?.error || data?.message) ? (data.error || data.message) : `HTTP ${status}`) : undefined,
      };
    } catch (err: any) {
      console.error(`[HttpClient] Request failed: ${method} [${target}] ${url}`, err);
      return {
        ok: false,
        status: 0,
        data: { success: false, error: err?.message || '网络连接异常' } as any,
        error: err?.message || '网络连接异常',
      };
    }
  }

  /**
   * Admin 中枢服务接口 (Node: admin-claw)
   * 自动路由到 Node 端，无需关心域名拼接
   */
  public readonly admin = {
    get: <T = any>(path: string, headers?: Record<string, string>): Promise<ApiResponse<T>> =>
      this.request<T>({ url: path, method: 'GET', headers, target: 'admin' }),
    post: <T = any>(path: string, body?: any, headers?: Record<string, string>): Promise<ApiResponse<T>> =>
      this.request<T>({ url: path, method: 'POST', body, headers, target: 'admin' }),
    put: <T = any>(path: string, body?: any, headers?: Record<string, string>): Promise<ApiResponse<T>> =>
      this.request<T>({ url: path, method: 'PUT', body, headers, target: 'admin' }),
    delete: <T = any>(path: string, headers?: Record<string, string>): Promise<ApiResponse<T>> =>
      this.request<T>({ url: path, method: 'DELETE', headers, target: 'admin' }),
  };

  /**
   * Biz 业务后端接口 (PHP: scrm)
   * 自动路由到 PHP 端，无需关心域名拼接
   */
  public readonly biz = {
    get: <T = any>(path: string, headers?: Record<string, string>): Promise<ApiResponse<T>> =>
      this.request<T>({ url: path, method: 'GET', headers, target: 'biz' }),
    post: <T = any>(path: string, body?: any, headers?: Record<string, string>): Promise<ApiResponse<T>> =>
      this.request<T>({ url: path, method: 'POST', body, headers, target: 'biz' }),
    put: <T = any>(path: string, body?: any, headers?: Record<string, string>): Promise<ApiResponse<T>> =>
      this.request<T>({ url: path, method: 'PUT', body, headers, target: 'biz' }),
    delete: <T = any>(path: string, headers?: Record<string, string>): Promise<ApiResponse<T>> =>
      this.request<T>({ url: path, method: 'DELETE', headers, target: 'biz' }),
  };

  /**
   * 通用二进制/文件上传方法 (支持附带用户凭据及自动未授权拦截)
   */
  public async uploadFile<T = any>(
    pathOrUrl: string,
    file: File | Blob,
    options?: {
      headers?: Record<string, string>;
      skipAuth?: boolean;
      target?: HttpTarget;
    },
  ): Promise<ApiResponse<T>> {
    // 渲染端如果传入相对路径，由 Electron 统一解析或者走相对路径
    const session = localStorage.getItem('heyclaw_session');
    const headers: Record<string, string> = {
      'Content-Type': file.type || 'application/octet-stream',
      ...(options?.headers || {}),
    };

    if (!options?.skipAuth && !headers['Authorization'] && session) {
      headers['Authorization'] = `Bearer ${session}`;
    }

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      // 如果不是 http(s) 开头，默认拼接 Admin 服务器端点
      const finalUrl = /^https?:\/\//i.test(pathOrUrl)
        ? pathOrUrl
        : `${getAdminBaseUrl()}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;

      xhr.open('POST', finalUrl, true);

      Object.entries(headers).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v);
      });

      xhr.onload = () => {
        let parsedData: any = null;
        try {
          parsedData = JSON.parse(xhr.responseText);
        } catch {
          parsedData = xhr.responseText;
        }

        const isSuccess = xhr.status >= 200 && xhr.status < 300;
        const isAuthError =
          xhr.status === 401 ||
          (parsedData &&
            typeof parsedData === 'object' &&
            (parsedData.code === 10001 ||
              parsedData.code === 401 ||
              parsedData.error?.includes('未授权') ||
              parsedData.error?.includes('请先登录')));

        if (isAuthError && !options?.skipAuth) {
          handleUnauthorized();
        }

        resolve({
          ok: isSuccess,
          status: xhr.status,
          data: parsedData,
          error: !isSuccess ? (parsedData?.error || parsedData?.message || `HTTP ${xhr.status}`) : undefined,
        });
      };

      xhr.onerror = () => {
        resolve({
          ok: false,
          status: 0,
          data: { success: false, error: '网络请求异常，请检查网络连接' } as any,
          error: '网络请求异常，请检查网络连接',
        });
      };

      xhr.send(file);
    });
  }
}

export const httpClient = new HttpClient();
