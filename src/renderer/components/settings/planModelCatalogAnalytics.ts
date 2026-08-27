import {
  LogReporterAction,
  reportYdAnalyzer,
} from '../../services/logReporter';

export const PlanModelCatalogAnalyticsCategory = {
  Image: 'image',
  Text: 'text',
  Video: 'video',
} as const;

export type PlanModelCatalogAnalyticsCategory =
  typeof PlanModelCatalogAnalyticsCategory[keyof typeof PlanModelCatalogAnalyticsCategory];

export const PlanModelCatalogAnalyticsSource = {
  CatalogToolbar: 'settings_plan_model_catalog',
  SettingsShortcut: 'settings_shortcut',
  SettingsSidebar: 'settings_sidebar',
} as const;

export type PlanModelCatalogAnalyticsSource =
  typeof PlanModelCatalogAnalyticsSource[keyof typeof PlanModelCatalogAnalyticsSource];

export const PlanModelCatalogAnalyticsActionType = {
  CategoryChange: 'category_change',
  OpenPricing: 'open_pricing',
  OpenTab: 'open_tab',
} as const;

export type PlanModelCatalogAnalyticsActionType =
  typeof PlanModelCatalogAnalyticsActionType[keyof typeof PlanModelCatalogAnalyticsActionType];

export const PlanModelCatalogAnalyticsResult = {
  Failed: 'failed',
  Success: 'success',
} as const;

export type PlanModelCatalogAnalyticsResult =
  typeof PlanModelCatalogAnalyticsResult[keyof typeof PlanModelCatalogAnalyticsResult];

export interface PlanModelCatalogCounts {
  image: number;
  text: number;
  video: number;
}

interface PlanModelCatalogAnalyticsEvent {
  actionType: PlanModelCatalogAnalyticsActionType;
  activeCategory?: PlanModelCatalogAnalyticsCategory;
  errorCode?: string;
  modelCounts?: PlanModelCatalogCounts;
  previousCategory?: PlanModelCatalogAnalyticsCategory;
  previousTab?: string;
  result?: PlanModelCatalogAnalyticsResult;
  source: PlanModelCatalogAnalyticsSource;
  targetCategory?: PlanModelCatalogAnalyticsCategory;
  targetTab?: string;
  visibleModelCount?: number;
}

const normalizeModelCount = (value: number): number => (
  Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
);

export function getPlanModelCatalogCountParams(
  counts: PlanModelCatalogCounts,
): {
  imageModelCount: number;
  textModelCount: number;
  totalModelCount: number;
  videoModelCount: number;
} {
  const imageModelCount = normalizeModelCount(counts.image);
  const textModelCount = normalizeModelCount(counts.text);
  const videoModelCount = normalizeModelCount(counts.video);
  return {
    imageModelCount,
    textModelCount,
    totalModelCount: imageModelCount + textModelCount + videoModelCount,
    videoModelCount,
  };
}

export function reportPlanModelCatalogAction({
  actionType,
  activeCategory,
  errorCode,
  modelCounts,
  previousCategory,
  previousTab,
  result,
  source,
  targetCategory,
  targetTab,
  visibleModelCount,
}: PlanModelCatalogAnalyticsEvent): void {
  console.debug('[PlanModelCatalog] reporting plan model catalog analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.PlanModelCatalogAction,
    source,
    actionType,
    activeCategory,
    previousCategory,
    targetCategory,
    previousTab,
    targetTab,
    result,
    errorCode,
    visibleModelCount,
    ...(modelCounts ? getPlanModelCatalogCountParams(modelCounts) : {}),
  });
}
