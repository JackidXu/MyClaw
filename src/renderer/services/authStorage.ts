/**
 * HeyClaw 认证凭证与本地存储管理模块
 * 
 * 职责：
 * 1. 集中定义核心认证凭证及用户本地偏好 Storage Key
 * 2. 提供纯净且统一的凭证清理逻辑（保留本地偏好如昵称、头像，清理敏感鉴权三要素）
 * 3. 统一收敛全站退出登录流程 (logoutAndDeactivate)
 */

export const AUTH_STORAGE_KEYS = {
  // 核心鉴权三要素
  Session: "heyclaw_session",
  ApiKey: "heyclaw_api_key",
  UserId: "heyclaw_user_id",
  // 本地偏好（退出登录时保留）
  UserName: "heyclaw_user_name",
  UserAvatar: "heyclaw_user_avatar",
} as const;

/**
 * 清除本地核心鉴权凭证
 * 注意：保留用户在本地设置的偏好昵称 (heyclaw_user_name) 与头像 (heyclaw_user_avatar)
 */
export function clearAuthCredentials(): void {
  localStorage.removeItem(AUTH_STORAGE_KEYS.Session);
  localStorage.removeItem(AUTH_STORAGE_KEYS.ApiKey);
  localStorage.removeItem(AUTH_STORAGE_KEYS.UserId);

  // 同步通知主进程清理持久化的用户 Token
  void window.electron?.auth?.syncUserSession?.("");
}

export interface LogoutOptions {
  /** 是否静默退出（不弹出 Toast 提示，如冷启动凭据缺失自动复位场景），默认 false */
  silent?: boolean;
  /** 自定义 Toast 提示文案，默认 "登录已过期或已退出，请重新登录" */
  toastMessage?: string;
}

/**
 * 统一退出登录与下线流程
 * 1. 清除本地鉴权凭据
 * 2. 统一展示 Toast 提示（非 silent 模式）
 * 3. 派发 app:deactivate 事件同步清理 Provider 配置、重启网关并切回未激活登录页
 */
export function logoutAndDeactivate(options?: LogoutOptions): void {
  const { silent = false, toastMessage = "登录已过期或已退出，请重新登录" } = options || {};

  // 1. 清理凭证
  clearAuthCredentials();

  // 2. 统一提示（仅在非静默模式下触发）
  if (!silent && toastMessage) {
    window.dispatchEvent(
      new CustomEvent("app:showToast", {
        detail: toastMessage,
      }),
    );
  }

  // 3. 统一触发系统退出激活事件（由 App.tsx 重置 Provider 配置、重启 OpenClaw Gateway 并切回登录状态）
  window.dispatchEvent(new CustomEvent("app:deactivate"));
}
