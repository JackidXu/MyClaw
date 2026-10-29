/**
 * 集中管理所有业务 API 端点。
 */

import { isValidLlmTraceId } from '../../shared/cowork/llmTurnUsage';
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
  SiteDeployment: 'site_deployment',
} as const;

export type PortalPricingKeyfrom =
  (typeof PortalPricingKeyfrom)[keyof typeof PortalPricingKeyfrom];

export interface PortalPricingUrlOptions {
  traceId?: string;
  offerToken?: string;
  tab?: 'subscription' | 'boost';
}

export const getPortalLoginUrl = () => `${getPortalBase()}/login`;
export const getPortalPricingUrl = (
  keyfrom?: PortalPricingKeyfrom,
  options: PortalPricingUrlOptions = {},
) => {
  const query = new URLSearchParams();
  if (keyfrom) query.set('keyfrom', keyfrom);
  if (options.traceId) query.set('trace_id', options.traceId);
  if (options.offerToken) query.set('offerToken', options.offerToken);
  if (options.tab) query.set('tab', options.tab);
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : '';
  return `${getPortalBase()}/pricing${suffix}`;
};
const PENNY_BANNER_TARGET = 'penny';
export const getPortalSubscriptionTrialUrl = (campaignCode?: string, options: { checkout?: boolean } = {}) => {
  const query = new URLSearchParams({ tab: 'subscription', banner: PENNY_BANNER_TARGET });
  if (campaignCode) query.set('trialCampaign', campaignCode);
  if (options.checkout) query.set('trialCheckout', '1');
  return `${getPortalBase()}/pricing?${query}`;
};

// Sidebar banners have no campaign type field. Preserve configured destinations and
// attribution, adding the slide target only to Portal links for the penny offer.
export const getClientBannerTargetUrl = (linkUrl: string, description: string): string => {
  const describesTrial = /(?:^|[^\d])0\.01(?:[^\d]|$)/.test(description);
  if (!linkUrl) return describesTrial ? getPortalSubscriptionTrialUrl() : getPortalInvitationUrl();
  try {
    const url = new URL(linkUrl);
    if (![new URL(PORTAL_BASE_TEST).origin, new URL(PORTAL_BASE_PROD).origin].includes(url.origin)) return linkUrl;
    const hashRoute = url.hash.startsWith('#/');
    const route = new URL(hashRoute ? url.hash.slice(1) : url.pathname + url.search, url.origin);
    const isPricing = hashRoute
      ? ['/', '/pricing'].includes(route.pathname)
      : ['/', '/pricing', '/portal', '/portal/'].includes(route.pathname);
    if (!isPricing || !(describesTrial || route.searchParams.has('trialCampaign') || route.searchParams.get('banner') === PENNY_BANNER_TARGET)) return linkUrl;
    route.searchParams.set('banner', PENNY_BANNER_TARGET);
    route.searchParams.set('tab', 'subscription');
    if (hashRoute) url.hash = route.pathname + route.search;
    else url.search = route.search;
    return url.toString();
  } catch {
    return linkUrl;
  }
};

export const getPortalProfileUrl = () => `${getPortalBase()}/profile`;
export const getPortalTurnUsageUrl = (traceId: string) => {
  const query = new URLSearchParams({ tab: 'used' });
  if (isValidLlmTraceId(traceId)) query.set('usageTrace', traceId);
  return `${getPortalProfileUrl()}?${query}`;
};
export const getPortalCreditsDetailUrl = () => `${getPortalBase()}/profile/detail`;
export const getPortalRechargeUrl = () => `${getPortalBase()}/`;
export const getPortalInvitationUrl = () => `${getPortalBase()}/invitation`;
export const getPortalCreditsResetActivityUrl = (campaignCode?: string) => (
  `${getPortalBase()}/profile?activity=credits_reset${campaignCode ? `&campaignCode=${encodeURIComponent(campaignCode)}` : ''}`
);

/**
 * 有道自建服务器基础端点 (有道账号/刷新/分享等)
 */
export const getServerApiBaseUrl = (): string => {
  return isTestModeEnabled()
    ? 'https://lobsterai-server.inner.youdao.com'
    : 'https://lobsterai-server.youdao.com';
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
