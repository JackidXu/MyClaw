import { AuthSubscriptionStatus } from '@shared/auth/constants';

import type {
  CreditItem,
  CreditsResetCampaignStatus,
  FreeCreditsReward,
} from '../store/slices/authSlice';

export interface AccountPlanPresentation {
  label: string;
  expiresAt: string | null;
  canUpgrade: boolean;
}

export const AccountPlanAnalyticsTier = {
  Advanced: 'advanced',
  Basic: 'basic',
  Enterprise: 'enterprise',
  Excellent: 'excellent',
  Professional: 'professional',
  Standard: 'standard',
  Unknown: 'unknown',
} as const;

export type AccountPlanAnalyticsTier =
  typeof AccountPlanAnalyticsTier[keyof typeof AccountPlanAnalyticsTier];

export interface AccountPlanAnalyticsContext {
  accountMode: 'personal' | 'enterprise' | 'unknown';
  subscriptionStatus: string;
  planTier: AccountPlanAnalyticsTier;
  hasSubscriptionPlan: boolean;
  canUpgrade: boolean;
}

const EXCELLENT_PLAN_LABEL_PATTERN = /(?:卓越|excellent)/i;
const MAINLAND_CHINA_MOBILE_PATTERN = /^1[3-9]\d{9}$/;
const PLAN_TIER_PATTERNS: Array<{
  pattern: RegExp;
  tier: AccountPlanAnalyticsTier;
}> = [
  { pattern: /(?:卓越|excellent)/i, tier: AccountPlanAnalyticsTier.Excellent },
  { pattern: /(?:专业|professional|\bpro\b)/i, tier: AccountPlanAnalyticsTier.Professional },
  { pattern: /(?:进阶|advanced)/i, tier: AccountPlanAnalyticsTier.Advanced },
  { pattern: /(?:标准|standard)/i, tier: AccountPlanAnalyticsTier.Standard },
  { pattern: /(?:基础|免费|basic|free)/i, tier: AccountPlanAnalyticsTier.Basic },
];

const formatPlanLabel = (label: string, isEnglish: boolean): string => {
  const trimmedLabel = label.trim();
  if (!trimmedLabel || isEnglish || trimmedLabel.endsWith('套餐')) {
    return trimmedLabel;
  }
  return `${trimmedLabel}套餐`;
};

const normalizePotentialPhoneNumber = (value: string): string => (
  value.trim().replace(/[\s-]/g, '').replace(/^\+?86/, '')
);

export function maskPhoneLikeAccountName(value?: string | null): string {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return '';

  const normalizedPhone = normalizePotentialPhoneNumber(trimmedValue);
  if (MAINLAND_CHINA_MOBILE_PATTERN.test(normalizedPhone)) {
    return `****${normalizedPhone.slice(-4)}`;
  }

  return trimmedValue;
}

export function getAccountMenuDisplayName(input: {
  fallback: string;
  profileNickname?: string | null;
  userNickname?: string | null;
  userPhone?: string | null;
}): string {
  const profileName = maskPhoneLikeAccountName(input.profileNickname);
  if (profileName) return profileName;

  const userName = maskPhoneLikeAccountName(input.userNickname);
  if (userName) return userName;

  const normalizedPhone = normalizePotentialPhoneNumber(input.userPhone ?? '');
  if (normalizedPhone) {
    return `****${normalizedPhone.slice(-4)}`;
  }

  return input.fallback;
}

export function getAccountPlanPresentation(
  creditItems: CreditItem[],
  isEnglish: boolean,
): AccountPlanPresentation | null {
  const subscription = creditItems.find(item => item.type === 'subscription');
  if (!subscription) return null;

  return {
    label: formatPlanLabel(
      isEnglish ? subscription.labelEn || subscription.label : subscription.label,
      isEnglish,
    ),
    expiresAt: subscription.expiresAt,
    canUpgrade: !EXCELLENT_PLAN_LABEL_PATTERN.test(`${subscription.label} ${subscription.labelEn}`),
  };
}

export function getAccountPlanAnalyticsContext(input: {
  accountMode?: 'personal' | 'enterprise' | null;
  creditItems: CreditItem[];
  planName?: string | null;
  subscriptionStatus?: string | null;
}): AccountPlanAnalyticsContext {
  const subscription = input.creditItems.find(item => item.type === 'subscription');
  const accountMode = input.accountMode ?? 'unknown';
  const subscriptionStatus = input.subscriptionStatus?.trim() || (
    accountMode === 'enterprise'
      ? AuthSubscriptionStatus.Enterprise
      : subscription
        ? AuthSubscriptionStatus.Active
        : AuthSubscriptionStatus.Free
  );
  const canUpgrade = subscription
    ? !EXCELLENT_PLAN_LABEL_PATTERN.test(`${subscription.label} ${subscription.labelEn}`)
    : accountMode !== 'enterprise';

  if (accountMode === 'enterprise' || subscriptionStatus === AuthSubscriptionStatus.Enterprise) {
    return {
      accountMode,
      subscriptionStatus,
      planTier: AccountPlanAnalyticsTier.Enterprise,
      hasSubscriptionPlan: Boolean(subscription),
      canUpgrade,
    };
  }

  if (!subscription && subscriptionStatus === AuthSubscriptionStatus.Free) {
    return {
      accountMode,
      subscriptionStatus,
      planTier: AccountPlanAnalyticsTier.Basic,
      hasSubscriptionPlan: false,
      canUpgrade,
    };
  }

  const labelSource = [
    input.planName,
    subscription?.label,
    subscription?.labelEn,
  ].filter(Boolean).join(' ');
  const matchedTier = PLAN_TIER_PATTERNS.find(({ pattern }) => pattern.test(labelSource));

  return {
    accountMode,
    subscriptionStatus,
    planTier: matchedTier?.tier ?? AccountPlanAnalyticsTier.Unknown,
    hasSubscriptionPlan: Boolean(subscription),
    canUpgrade,
  };
}

export function getFinalRewards(
  status?: CreditsResetCampaignStatus,
): FreeCreditsReward[] {
  const rewards = status?.freeCreditsRewards?.length
    ? status.freeCreditsRewards
    : status?.freeCreditsReward
      ? [status.freeCreditsReward]
      : [];
  return [...rewards].sort((a, b) => a.claimDeadline.localeCompare(b.claimDeadline));
}
