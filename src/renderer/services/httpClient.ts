/**
 * HeyClaw 统一 HTTP 请求客户端与全局错误拦截服务
 */

export interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  /** 是否跳过自动附带 Authorization 头，默认 false */
  skipAuth?: boolean;
  /** 是否跳过 401 全局拦截处理，默认 false */
  skip401Handler?: boolean;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
}

// 401 全局防抖锁（3秒内只触发一次 Toast 和登录弹窗，防止并发风暴）
let last401TriggerTime = 0;

export function handleUnauthorized() {
  const now = Date.now();
  if (now - last401TriggerTime < 3000) {
    return;
  }
  last401TriggerTime = now;

  // 清除失效的本地凭据
  localStorage.removeItem('heyclaw_session');
  void window.electron?.auth?.syncUserSession?.('');

  // 触发全局 Toast
  window.dispatchEvent(
    new CustomEvent('app:showToast', {
      detail: '登录已过期或凭证失效，请重新登录',
    }),
  );

  // 触发未授权全局事件唤起登录弹窗
  window.dispatchEvent(new CustomEvent('app:unauthorized'));
}

export class HttpClient {
  /**
   * 通用请求核心方法
   */
  public async request<T = any>(options: RequestOptions): Promise<ApiResponse<T>> {
    const { url, method = 'GET', headers = {}, body, skipAuth = false, skip401Handler = false } = options;

    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (!skipAuth && !finalHeaders['Authorization'] && !finalHeaders['authorization']) {
      const session = localStorage.getItem('heyclaw_session');
      if (session) {
        finalHeaders['Authorization'] = `Bearer ${session}`;
      }
    }

    let payloadBody: any = undefined;
    if (body !== undefined && body !== null) {
      payloadBody = typeof body === 'string' ? body : JSON.stringify(body);
    }

    try {
      const resp = (await window.electron.api.fetch({
        url,
        method,
        headers: finalHeaders,
        body: payloadBody,
      })) as { ok: boolean; status?: number; data?: any };

      const status = resp.status || (resp.ok ? 200 : 500);

      // 401 / 403 及业务未授权包体拦截处理
      const data = resp.data;
      const isAuthErrorBody =
        data &&
        typeof data === 'object' &&
        ((data.success === false && (data.error?.includes('未授权') || data.error?.includes('请先登录') || data.message?.includes('未授权') || data.message?.includes('请先登录'))) ||
          data.code === 10001 ||
          data.code === 401);

      if ((status === 401 || status === 403 || isAuthErrorBody) && !skip401Handler) {
        handleUnauthorized();
      }

      return {
        ok: resp.ok,
        status,
        data: resp.data,
      };
    } catch (err: any) {
      console.error(`[HttpClient] Request failed: ${method} ${url}`, err);
      return {
        ok: false,
        status: 0,
        data: { success: false, error: err?.message || '网络连接异常' } as any,
      };
    }
  }

  public get<T = any>(url: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>({ url, method: 'GET', headers });
  }

  public post<T = any>(url: string, body?: any, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>({ url, method: 'POST', body, headers });
  }

  public put<T = any>(url: string, body?: any, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>({ url, method: 'PUT', body, headers });
  }

  public delete<T = any>(url: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>({ url, method: 'DELETE', headers });
  }
}

export const httpClient = new HttpClient();
