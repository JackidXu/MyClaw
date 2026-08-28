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

let cachedAppVersion = '';

async function getClientAppVersion(): Promise<string> {
  if (cachedAppVersion) {
    return cachedAppVersion;
  }
  try {
    if (typeof window !== 'undefined' && window.electron?.appInfo?.getVersion) {
      cachedAppVersion = await window.electron.appInfo.getVersion();
    }
  } catch {
    // 静默容错
  }
  return cachedAppVersion;
}

export class HttpClient {
  /**
   * 通用请求核心方法
   */
  public async request<T = any>(options: RequestOptions): Promise<ApiResponse<T>> {
    const { url, method = 'GET', headers = {}, body, skipAuth = false, skip401Handler = false } = options;

    const finalHeaders: Record<string, string> = {
      ...headers,
    };

    try {
      const appVersion = await getClientAppVersion();
      if (appVersion && !finalHeaders['X-Client-Version'] && !finalHeaders['x-client-version']) {
        finalHeaders['X-Client-Version'] = appVersion;
      }
    } catch {
      // 容错兜底：版本号附加失败绝不阻碍请求正常发出
    }

    // 若非 GET 请求且有 body 且未显式指定 Content-Type，默认为 JSON
    if (method !== 'GET' && body !== undefined && !finalHeaders['Content-Type'] && !finalHeaders['content-type']) {
      finalHeaders['Content-Type'] = 'application/json';
    }

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

      // 全局未授权识别：401/403 状态码、PHP 业务状态码 10001、或包体明确提示未授权/未登录
      const data = resp.data;
      const isAuthErrorBody =
        data &&
        typeof data === 'object' &&
        ((data.success === false && (data.error?.includes('未授权') || data.error?.includes('请先登录') || data.message?.includes('未授权') || data.message?.includes('请先登录'))) ||
          data.code === 10001 ||
          data.code === 401 ||
          (typeof data.message === 'string' && (data.message.includes('认证失败') || data.message.includes('未登录'))));

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

  /**
   * 通用二进制/文件上传方法 (支持附带用户凭据及自动未授权拦截)
   */
  public async uploadFile<T = any>(
    url: string,
    file: File | Blob,
    options?: {
      headers?: Record<string, string>;
      skipAuth?: boolean;
    },
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);

      const headers: Record<string, string> = {
        'Content-Type': file.type || 'application/octet-stream',
        ...(options?.headers || {}),
      };

      if (!options?.skipAuth && !headers['Authorization']) {
        const session = localStorage.getItem('heyclaw_session');
        if (session) {
          headers['Authorization'] = `Bearer ${session}`;
        }
      }

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
          xhr.status === 403 ||
          (parsedData &&
            typeof parsedData === 'object' &&
            (parsedData.code === 10001 ||
              parsedData.code === 401 ||
              parsedData.error?.includes('未授权') ||
              parsedData.error?.includes('请先登录')));

        if (isAuthError) {
          handleUnauthorized();
        }

        resolve({
          ok: isSuccess,
          status: xhr.status,
          data: parsedData,
        });
      };

      xhr.onerror = () => {
        resolve({
          ok: false,
          status: 0,
          data: { success: false, error: '网络请求异常，请检查网络连接' } as any,
        });
      };

      xhr.send(file);
    });
  }
}

export const httpClient = new HttpClient();
