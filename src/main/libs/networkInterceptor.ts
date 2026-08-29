import { type BrowserWindow, ipcMain } from 'electron';

export interface ApiTrafficEntry {
  id: string;
  type: 'request' | 'response' | 'error';
  timestamp: number;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  status?: number;
  statusText?: string;
  ok?: boolean;
  responseData?: any;
  error?: string;
}

let mainWindowRef: BrowserWindow | null = null;
const pendingTrafficQueue: ApiTrafficEntry[] = [];
let isInterceptorInstalled = false;

// 注册渲染进程就绪主动拉取通道
try {
  if (typeof ipcMain !== 'undefined' && typeof ipcMain?.handle === 'function') {
    ipcMain.handle('api:traffic-log:ready', () => {
      const buffered = [...pendingTrafficQueue];
      pendingTrafficQueue.length = 0;
      return buffered;
    });
  }
} catch {
  // Ignore in testing environments where ipcMain mock is not defined
}

/**
 * 关联主窗口，窗口就绪时自动清空并投递缓冲的请求日志
 */
export function setTrafficLogMainWindow(window: BrowserWindow | null): void {
  mainWindowRef = window;
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    flushPendingTraffic();
  }
}

function flushPendingTraffic(): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  if (pendingTrafficQueue.length === 0) return;

  const entriesToSend = [...pendingTrafficQueue];
  pendingTrafficQueue.length = 0;

  for (const entry of entriesToSend) {
    sendEntryToRenderer(entry);
  }
}

function sendEntryToRenderer(entry: ApiTrafficEntry): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    try {
      mainWindowRef.webContents.send('api:traffic-log', entry);
      return;
    } catch {
      // 窗口不可用时缓存
    }
  }
  // 窗口未就绪或正在加载，放入队列缓存
  if (pendingTrafficQueue.length < 500) {
    pendingTrafficQueue.push(entry);
  }
}

/**
 * 判断是否属于需要过滤的内部心跳/本地非业务请求（如本地打包热更新 Vite ping、OpenClaw 内部网关健康检查）
 */
function shouldLogUrl(url: string): boolean {
  if (!url) return false;
  // 过滤 Vite / HMR / DevTools 内部轮询
  if (url.includes('/@vite/') || url.includes('/@react-refresh') || url.endsWith('.hot-update.json')) {
    return false;
  }
  // 过滤 OpenClaw 内部本地网关健康检查与心跳（18789端口或 health/ready 路由）
  if (url.includes(':18789') || url.includes('/healthz') || url.includes('/health') || url.includes('/ready')) {
    return false;
  }
  return true;
}

/**
 * 手动记录/上报 API 请求流量（供 api:fetch 或其他通道复用）
 */
export function recordApiTraffic(entry: ApiTrafficEntry): void {
  if (!shouldLogUrl(entry.url)) return;
  sendEntryToRenderer(entry);
}


/**
 * 安装底层网络请求拦截器（仅在 Dev 模式运行）
 */
export function installGlobalNetworkInterceptor(isDev: boolean): void {
  if (!isDev || isInterceptorInstalled) return;
  isInterceptorInstalled = true;

  // 1. 拦截 Node.js 全局 fetch (globalThis.fetch)
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch === 'function') {
    globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const method = (init?.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')).toUpperCase();

      if (!shouldLogUrl(url)) {
        return originalFetch.apply(this, [input, init]);
      }

      const reqId = `fetch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      let headers: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          headers = Object.fromEntries(init.headers.entries());
        } else if (Array.isArray(init.headers)) {
          headers = Object.fromEntries(init.headers);
        } else {
          headers = { ...init.headers } as Record<string, string>;
        }
      }

      let bodyData: any = undefined;
      if (init?.body) {
        try {
          bodyData = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        } catch {
          bodyData = init.body;
        }
      }

      // 记录请求
      sendEntryToRenderer({
        id: reqId,
        type: 'request',
        timestamp: Date.now(),
        method,
        url,
        headers,
        body: bodyData,
      });

      try {
        const response = await originalFetch.apply(this, [input, init]);
        const clonedResponse = response.clone();
        
        // 异步提取响应体，避免阻塞网络流
        void (async () => {
          try {
            const contentType = clonedResponse.headers.get('content-type') || '';
            let responseData: any;
            if (contentType.includes('application/json')) {
              responseData = await clonedResponse.json();
            } else if (contentType.includes('text/') || contentType.includes('application/javascript')) {
              const text = await clonedResponse.text();
              responseData = text.length > 20000 ? `${text.slice(0, 20000)}... [truncated]` : text;
            } else {
              responseData = `[Binary/Stream data: ${contentType}]`;
            }

            sendEntryToRenderer({
              id: reqId,
              type: 'response',
              timestamp: Date.now(),
              method,
              url,
              status: response.status,
              statusText: response.statusText,
              ok: response.ok,
              responseData,
            });
          } catch (err: any) {
            sendEntryToRenderer({
              id: reqId,
              type: 'response',
              timestamp: Date.now(),
              method,
              url,
              status: response.status,
              statusText: response.statusText,
              ok: response.ok,
              responseData: `[Failed to read response body: ${err?.message}]`,
            });
          }
        })();

        return response;
      } catch (err: any) {
        sendEntryToRenderer({
          id: reqId,
          type: 'error',
          timestamp: Date.now(),
          method,
          url,
          error: err?.message || String(err),
        });
        throw err;
      }
    };
  }

  // 2. 拦截 Node.js 原生 http & https 模块
  installNodeHttpInterceptor();
}

function installNodeHttpInterceptor(): void {
  try {
    const http = require('http');
    const https = require('https');

    [http, https].forEach((mod: any) => {
      const originalRequest = mod.request;
      const originalGet = mod.get;

      const createWrappedHandler = (originalFn: any, defaultMethod: string) => {
        return function (...args: any[]) {
          let url = '';
          let method = defaultMethod;
          let headers: Record<string, string> = {};

          if (typeof args[0] === 'string') {
            url = args[0];
            if (args[1] && typeof args[1] === 'object') {
              method = (args[1].method || defaultMethod).toUpperCase();
              headers = args[1].headers || {};
            }
          } else if (args[0] && typeof args[0] === 'object') {
            const opts = args[0];
            const protocol = opts.protocol || (mod === https ? 'https:' : 'http:');
            const host = opts.hostname || opts.host || 'localhost';
            const port = opts.port ? `:${opts.port}` : '';
            const path = opts.path || '/';
            url = opts.href || `${protocol}//${host}${port}${path}`;
            method = (opts.method || defaultMethod).toUpperCase();
            headers = opts.headers || {};
          }

          const clientReq = originalFn.apply(this, args);

          if (!shouldLogUrl(url)) {
            return clientReq;
          }

          const reqId = `http_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          let requestBody = '';

          const originalWrite = clientReq.write;
          clientReq.write = function (chunk: any, ...writeArgs: any[]) {
            if (chunk) {
              requestBody += chunk.toString();
            }
            return originalWrite.apply(this, [chunk, ...writeArgs]);
          };

          const originalEnd = clientReq.end;
          clientReq.end = function (chunk: any, ...endArgs: any[]) {
            if (chunk && typeof chunk !== 'function') {
              requestBody += chunk.toString();
            }
            let parsedBody: any = undefined;
            if (requestBody) {
              try {
                parsedBody = JSON.parse(requestBody);
              } catch {
                parsedBody = requestBody;
              }
            }
            sendEntryToRenderer({
              id: reqId,
              type: 'request',
              timestamp: Date.now(),
              method,
              url,
              headers,
              body: parsedBody,
            });
            return originalEnd.apply(this, [chunk, ...endArgs]);
          };

          clientReq.on('response', (res: any) => {
            let responseBody = '';
            res.on('data', (chunk: any) => {
              if (responseBody.length < 50000) {
                responseBody += chunk.toString();
              }
            });
            res.on('end', () => {
              let parsedData: any = responseBody;
              try {
                parsedData = JSON.parse(responseBody);
              } catch {
                parsedData = responseBody;
              }
              sendEntryToRenderer({
                id: reqId,
                type: 'response',
                timestamp: Date.now(),
                method,
                url,
                status: res.statusCode,
                statusText: res.statusMessage,
                ok: res.statusCode >= 200 && res.statusCode < 300,
                responseData: parsedData,
              });
            });
          });

          clientReq.on('error', (err: any) => {
            sendEntryToRenderer({
              id: reqId,
              type: 'error',
              timestamp: Date.now(),
              method,
              url,
              error: err?.message || String(err),
            });
          });

          return clientReq;
        };
      };

      mod.request = createWrappedHandler(originalRequest, 'GET');
      mod.get = createWrappedHandler(originalGet, 'GET');
    });
  } catch (err) {
    console.error('[NetworkInterceptor] Failed to patch Node http/https:', err);
  }
}

