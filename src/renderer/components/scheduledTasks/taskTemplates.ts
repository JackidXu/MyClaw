import type { PlanType } from './utils';

export const ScheduledTaskTemplateId = {
  NextMonthTopics: 'next_month_topics',
  MonthlyBusinessReview: 'monthly_business_review',
  MonthlyPaymentRisk: 'monthly_payment_risk',
  WeeklyDataReview: 'weekly_data_review',
  WeeklyVipReport: 'weekly_vip_report',
  WeeklyCognitiveConflict: 'weekly_cognitive_conflict',
  DailyContentScript: 'daily_content_script',
  DailyHotspotShoot: 'daily_hotspot_shoot',
  DailyMomentsReach: 'daily_moments_reach',
} as const;
export type ScheduledTaskTemplateId =
  typeof ScheduledTaskTemplateId[keyof typeof ScheduledTaskTemplateId];

export const ScheduledTaskTemplateCategory = {
  Monthly: 'monthly',
  Weekly: 'weekly',
  Daily: 'daily',
} as const;
export type ScheduledTaskTemplateCategory =
  typeof ScheduledTaskTemplateCategory[keyof typeof ScheduledTaskTemplateCategory];

export const ScheduledTaskTemplatePlanType = {
  Daily: 'daily',
  Weekly: 'weekly',
  Monthly: 'monthly',
} as const;

interface ScheduledTaskTemplateSchedule {
  planType: Extract<PlanType, 'daily' | 'weekly' | 'monthly'>;
  hour: number;
  minute: number;
  weekdays?: number[];
  monthDay?: number;
}

export interface ScheduledTaskTemplate {
  id: ScheduledTaskTemplateId;
  category: ScheduledTaskTemplateCategory;
  titleKey: string;
  descriptionKey: string;
  scheduleBadgeKey: string;
  scheduleLabelKey: string;
  teamKey: string;
  promptKey: string;
  schedule: ScheduledTaskTemplateSchedule;
}

export const SCHEDULED_TASK_TEMPLATES: readonly ScheduledTaskTemplate[] = [
  // 🗓 每月例行
  {
    id: ScheduledTaskTemplateId.NextMonthTopics,
    category: ScheduledTaskTemplateCategory.Monthly,
    titleKey: 'scheduledTasksTemplateNextMonthTopicsTitle',
    descriptionKey: 'scheduledTasksTemplateNextMonthTopicsDesc',
    scheduleBadgeKey: 'scheduledTasksTemplateNextMonthTopicsBadge',
    scheduleLabelKey: 'scheduledTasksTemplateNextMonthTopicsSchedule',
    teamKey: 'scheduledTasksTemplateNextMonthTopicsTeam',
    promptKey: 'scheduledTasksTemplateNextMonthTopicsPrompt',
    schedule: {
      planType: ScheduledTaskTemplatePlanType.Monthly,
      hour: 9,
      minute: 0,
      monthDay: 1,
    },
  },
  {
    id: ScheduledTaskTemplateId.MonthlyBusinessReview,
    category: ScheduledTaskTemplateCategory.Monthly,
    titleKey: 'scheduledTasksTemplateMonthlyBusinessReviewTitle',
    descriptionKey: 'scheduledTasksTemplateMonthlyBusinessReviewDesc',
    scheduleBadgeKey: 'scheduledTasksTemplateMonthlyBusinessReviewBadge',
    scheduleLabelKey: 'scheduledTasksTemplateMonthlyBusinessReviewSchedule',
    teamKey: 'scheduledTasksTemplateMonthlyBusinessReviewTeam',
    promptKey: 'scheduledTasksTemplateMonthlyBusinessReviewPrompt',
    schedule: {
      planType: ScheduledTaskTemplatePlanType.Monthly,
      hour: 18,
      minute: 0,
      monthDay: 28,
    },
  },
  {
    id: ScheduledTaskTemplateId.MonthlyPaymentRisk,
    category: ScheduledTaskTemplateCategory.Monthly,
    titleKey: 'scheduledTasksTemplateMonthlyPaymentRiskTitle',
    descriptionKey: 'scheduledTasksTemplateMonthlyPaymentRiskDesc',
    scheduleBadgeKey: 'scheduledTasksTemplateMonthlyPaymentRiskBadge',
    scheduleLabelKey: 'scheduledTasksTemplateMonthlyPaymentRiskSchedule',
    teamKey: 'scheduledTasksTemplateMonthlyPaymentRiskTeam',
    promptKey: 'scheduledTasksTemplateMonthlyPaymentRiskPrompt',
    schedule: {
      planType: ScheduledTaskTemplatePlanType.Monthly,
      hour: 10,
      minute: 0,
      monthDay: 28,
    },
  },
  // 📆 每周例行
  {
    id: ScheduledTaskTemplateId.WeeklyDataReview,
    category: ScheduledTaskTemplateCategory.Weekly,
    titleKey: 'scheduledTasksTemplateWeeklyDataReviewTitle',
    descriptionKey: 'scheduledTasksTemplateWeeklyDataReviewDesc',
    scheduleBadgeKey: 'scheduledTasksTemplateWeeklyDataReviewBadge',
    scheduleLabelKey: 'scheduledTasksTemplateWeeklyDataReviewSchedule',
    teamKey: 'scheduledTasksTemplateWeeklyDataReviewTeam',
    promptKey: 'scheduledTasksTemplateWeeklyDataReviewPrompt',
    schedule: {
      planType: ScheduledTaskTemplatePlanType.Weekly,
      hour: 9,
      minute: 30,
      weekdays: [1],
    },
  },
  {
    id: ScheduledTaskTemplateId.WeeklyVipReport,
    category: ScheduledTaskTemplateCategory.Weekly,
    titleKey: 'scheduledTasksTemplateWeeklyVipReportTitle',
    descriptionKey: 'scheduledTasksTemplateWeeklyVipReportDesc',
    scheduleBadgeKey: 'scheduledTasksTemplateWeeklyVipReportBadge',
    scheduleLabelKey: 'scheduledTasksTemplateWeeklyVipReportSchedule',
    teamKey: 'scheduledTasksTemplateWeeklyVipReportTeam',
    promptKey: 'scheduledTasksTemplateWeeklyVipReportPrompt',
    schedule: {
      planType: ScheduledTaskTemplatePlanType.Weekly,
      hour: 17,
      minute: 30,
      weekdays: [5],
    },
  },
  {
    id: ScheduledTaskTemplateId.WeeklyCognitiveConflict,
    category: ScheduledTaskTemplateCategory.Weekly,
    titleKey: 'scheduledTasksTemplateWeeklyCognitiveConflictTitle',
    descriptionKey: 'scheduledTasksTemplateWeeklyCognitiveConflictDesc',
    scheduleBadgeKey: 'scheduledTasksTemplateWeeklyCognitiveConflictBadge',
    scheduleLabelKey: 'scheduledTasksTemplateWeeklyCognitiveConflictSchedule',
    teamKey: 'scheduledTasksTemplateWeeklyCognitiveConflictTeam',
    promptKey: 'scheduledTasksTemplateWeeklyCognitiveConflictPrompt',
    schedule: {
      planType: ScheduledTaskTemplatePlanType.Weekly,
      hour: 20,
      minute: 0,
      weekdays: [7],
    },
  },
  // 📅 每日例行
  {
    id: ScheduledTaskTemplateId.DailyContentScript,
    category: ScheduledTaskTemplateCategory.Daily,
    titleKey: 'scheduledTasksTemplateDailyContentScriptTitle',
    descriptionKey: 'scheduledTasksTemplateDailyContentScriptDesc',
    scheduleBadgeKey: 'scheduledTasksTemplateDailyContentScriptBadge',
    scheduleLabelKey: 'scheduledTasksTemplateDailyContentScriptSchedule',
    teamKey: 'scheduledTasksTemplateDailyContentScriptTeam',
    promptKey: 'scheduledTasksTemplateDailyContentScriptPrompt',
    schedule: {
      planType: ScheduledTaskTemplatePlanType.Daily,
      hour: 9,
      minute: 0,
    },
  },
  {
    id: ScheduledTaskTemplateId.DailyHotspotShoot,
    category: ScheduledTaskTemplateCategory.Daily,
    titleKey: 'scheduledTasksTemplateDailyHotspotShootTitle',
    descriptionKey: 'scheduledTasksTemplateDailyHotspotShootDesc',
    scheduleBadgeKey: 'scheduledTasksTemplateDailyHotspotShootBadge',
    scheduleLabelKey: 'scheduledTasksTemplateDailyHotspotShootSchedule',
    teamKey: 'scheduledTasksTemplateDailyHotspotShootTeam',
    promptKey: 'scheduledTasksTemplateDailyHotspotShootPrompt',
    schedule: {
      planType: ScheduledTaskTemplatePlanType.Daily,
      hour: 11,
      minute: 30,
    },
  },
  {
    id: ScheduledTaskTemplateId.DailyMomentsReach,
    category: ScheduledTaskTemplateCategory.Daily,
    titleKey: 'scheduledTasksTemplateDailyMomentsReachTitle',
    descriptionKey: 'scheduledTasksTemplateDailyMomentsReachDesc',
    scheduleBadgeKey: 'scheduledTasksTemplateDailyMomentsReachBadge',
    scheduleLabelKey: 'scheduledTasksTemplateDailyMomentsReachSchedule',
    teamKey: 'scheduledTasksTemplateDailyMomentsReachTeam',
    promptKey: 'scheduledTasksTemplateDailyMomentsReachPrompt',
    schedule: {
      planType: ScheduledTaskTemplatePlanType.Daily,
      hour: 19,
      minute: 0,
    },
  },
];
