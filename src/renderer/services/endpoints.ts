/**
 * 集中管理所有业务 API 端点。
 * 后续新增的业务接口也应在此文件中配置。
 */

import { configService } from './config';

export const isTestModeEnabled = () => {
  return configService.getConfig().app?.testMode === true;
};

// 自动更新
export const getUpdateCheckUrl = () =>
  `https://scrm0.cdn.banchengyun.com/heyclaw/downloads/version.json?_t=${Date.now()}`;

// 手动检查更新
export const getManualUpdateCheckUrl = () =>
  `https://scrm0.cdn.banchengyun.com/heyclaw/downloads/version.json?_t=${Date.now()}`;

export const getFallbackDownloadUrl = () =>
  'https://claw.chaohui.ai/';

// Skill 商店
export const getSkillStoreUrl = () => `${getServerApiBaseUrl()}/api/skills`;

// Kit 商店
export const getKitStoreUrl = () => `${getServerApiBaseUrl()}/api/kits`;

// 快速发问
export const getQuickActionsUrl = () => `${getServerApiBaseUrl()}/api/quick-actions`;

// 用户个人信息与余额 (基于 Bearer 令牌鉴权)
export const getUserProfileUrl = () =>
  `${getServerApiBaseUrl()}/api/client/user-profile`;

// 修改密码
export const getChangePasswordUrl = () =>
  `${getServerApiBaseUrl()}/api/client/change-password`;

// 问题反馈
export const getFeedbackUrl = () =>
  `${getServerApiBaseUrl()}/api/feedback`;

// 文件上传
export const getUploadUrl = (folder = 'feedback', filename = '') =>
  `${getServerApiBaseUrl()}/api/upload?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(filename)}`;

// 登录地址
export const getLoginOvermindUrl = () => isTestModeEnabled()
  ? 'https://api-overmind.heyclaw.com/openapi/get/luna/hardware/lobsterai/test/login-url'
  : 'https://api-overmind.heyclaw.com/openapi/get/luna/hardware/lobsterai/prod/login-url';

// Portal 页面
const PORTAL_BASE_TEST = 'https://inner.heyclaw.com/portal#';
const PORTAL_BASE_PROD = 'https://portal.heyclaw.com/portal#';

const getPortalBase = () => isTestModeEnabled() ? PORTAL_BASE_TEST : PORTAL_BASE_PROD;

export const PortalPricingKeyfrom = {
  HtmlShare: 'html_share',
} as const;

export type PortalPricingKeyfrom =
  (typeof PortalPricingKeyfrom)[keyof typeof PortalPricingKeyfrom];

export const getPortalLoginUrl = () => `${getPortalBase()}/login`;
export const getPortalPricingUrl = (keyfrom?: PortalPricingKeyfrom) => (
  `${getPortalBase()}/pricing${keyfrom ? `?keyfrom=${encodeURIComponent(keyfrom)}` : ''}`
);
export const getPortalProfileUrl = () => `${getPortalBase()}/profile`;
export const getPortalCreditsDetailUrl = () => `${getPortalBase()}/profile/detail`;
export const getPortalRechargeUrl = () => `${getPortalBase()}/`;
export const getPortalInvitationUrl = () => `${getPortalBase()}/invitation`;
export const getPortalCreditsResetActivityUrl = (campaignCode?: string) => (
  `${getPortalBase()}/profile?activity=credits_reset${campaignCode ? `&campaignCode=${encodeURIComponent(campaignCode)}` : ''}`
);

export const getServerApiBaseUrl = (): string => {
  if (isTestModeEnabled()) {
    return 'http://localhost:8082';
  }
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    return 'http://localhost:8082';
  }
  return 'https://admin.claw.chaohui.ai';
};

export const getEnterpriseMemberProfileUrl = (enterpriseId: number) => (
  `${getPortalBase()}/enterprise/profile/${encodeURIComponent(String(enterpriseId))}`
);

const getEnterpriseConsoleBaseUrl = (enterpriseId: number) => (
  `${getPortalBase()}/enterprise/console/${encodeURIComponent(String(enterpriseId))}`
);

export const getEnterpriseOverviewUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/overview`
);

export const getEnterpriseUsageUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/usage`
);

export const getEnterpriseBillingUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/billing`
);

export const getEnterpriseRechargeUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/recharge`
);
