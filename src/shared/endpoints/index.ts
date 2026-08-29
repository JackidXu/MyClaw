/**
 * HeyClaw 双端统一业务服务域名配置 (Single Source of Truth)
 * 供主进程与渲染进程共同导入，内部自动适配开发与生产环境，调用无需任何入参。
 */

export const HEYCLAW_ADMIN_BASE_DEV = 'http://localhost:8082';
export const HEYCLAW_ADMIN_BASE_PROD = 'https://admin.claw.chaohui.ai';

export const HEYCLAW_BIZ_BASE_DEV = 'https://dev-zhike.banchengyun.com';
export const HEYCLAW_BIZ_BASE_PROD = 'https://zhike.banchengyun.com';

/** 判断当前是否处于本地开发/测试环境 (兼容 Node/CommonJS 与浏览器环境) */
export function isDevelopmentEnvironment(): boolean {
  // 1. 渲染进程 (Browser / Vite)
  if (typeof window !== 'undefined') {
    // 兼容 Vite 客户端环境构建标记
    const metaEnv = typeof (globalThis as any).import?.meta?.env !== 'undefined'
      ? (globalThis as any).import.meta.env
      : (typeof window !== 'undefined' && (window as any).__VITE_DEV__ !== undefined)
      ? (window as any).__VITE_DEV__
      : undefined;

    if (metaEnv && typeof metaEnv.DEV === 'boolean') {
      return metaEnv.DEV;
    }

    if (window.location) {
      return (
        window.location.port === '5175' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
      );
    }
  }

  // 2. 主进程 (Node.js / Electron process)
  if (typeof process !== 'undefined' && process.env) {
    try {
      // 若在 Electron 主进程中，安全获取 app.isPackaged 状态
      const electron = typeof require === 'function' ? require('electron') : null;
      if (electron?.app?.isPackaged) {
        return false;
      }
    } catch {
      // 忽略 require 错误
    }

    return process.env.NODE_ENV === 'development';
  }

  return false;
}

/** 获取 Admin 基础域名 (Node: admin-claw)，内部自动识别环境 */
export function getAdminBaseUrl(): string {
  return isDevelopmentEnvironment() ? HEYCLAW_ADMIN_BASE_DEV : HEYCLAW_ADMIN_BASE_PROD;
}

/** 获取 Biz 业务后端基础域名 (PHP: scrm)，内部自动识别环境 */
export function getBizBaseUrl(): string {
  return isDevelopmentEnvironment() ? HEYCLAW_BIZ_BASE_DEV : HEYCLAW_BIZ_BASE_PROD;
}
