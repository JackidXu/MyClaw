import type {
  CreditItem,
  CreditsResetCampaignStatus,
  FreeCreditsReward,
} from '../store/slices/authSlice';

export interface AccountPlanPresentation {
  label: string;
  expiresAt: string | null;
}

const MAINLAND_CHINA_MOBILE_PATTERN = /^1[3-9]\d{9}$/;

const normalizePotentialPhoneNumber = (value: string): string => (
  value.trim().replace(/[\s-]/g, '').replace(/^\+?86/, '')
);

export function maskPhoneLikeAccountName(value?: string | null): string {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return '';

  const normalizedPhone = normalizePotentialPhoneNumber(trimmedValue);
  if (MAINLAND_CHINA_MOBILE_PATTERN.test(normalizedPhone)) {
    return `${normalizedPhone.slice(0, 3)}****${normalizedPhone.slice(-4)}`;
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
  if (MAINLAND_CHINA_MOBILE_PATTERN.test(normalizedPhone)) {
    return `${normalizedPhone.slice(0, 3)}****${normalizedPhone.slice(-4)}`;
  }
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
    label: isEnglish
      ? subscription.labelEn || subscription.label
      : subscription.label,
    expiresAt: subscription.expiresAt,
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
