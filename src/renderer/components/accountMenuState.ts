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

const EXCELLENT_PLAN_LABEL_PATTERN = /(?:卓越|excellent)/i;

const formatPlanLabel = (label: string, isEnglish: boolean): string => {
  const trimmedLabel = label.trim();
  if (!trimmedLabel || isEnglish || trimmedLabel.endsWith('套餐')) {
    return trimmedLabel;
  }
  return `${trimmedLabel}套餐`;
};

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
