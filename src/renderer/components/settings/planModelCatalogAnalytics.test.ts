import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../services/logReporter', async () => {
  const actual = await vi.importActual<typeof import('../../services/logReporter')>(
    '../../services/logReporter',
  );
  return { ...actual, reportYdAnalyzer: vi.fn() };
});

import {
  LogReporterAction,
  reportYdAnalyzer,
} from '../../services/logReporter';
import {
  getPlanModelCatalogCountParams,
  PlanModelCatalogAnalyticsActionType,
  PlanModelCatalogAnalyticsCategory,
  PlanModelCatalogAnalyticsResult,
  PlanModelCatalogAnalyticsSource,
  reportPlanModelCatalogAction,
} from './planModelCatalogAnalytics';

beforeEach(() => {
  vi.mocked(reportYdAnalyzer).mockReset();
});

describe('planModelCatalogAnalytics', () => {
  test('normalizes model counts before reporting', () => {
    expect(getPlanModelCatalogCountParams({
      image: 2.9,
      text: 24,
      video: -1,
    })).toEqual({
      imageModelCount: 2,
      textModelCount: 24,
      totalModelCount: 26,
      videoModelCount: 0,
    });
  });

  test('reports tab and category actions with safe aggregate fields', () => {
    reportPlanModelCatalogAction({
      actionType: PlanModelCatalogAnalyticsActionType.OpenTab,
      previousTab: 'general',
      source: PlanModelCatalogAnalyticsSource.SettingsSidebar,
      targetTab: 'planModelIntro',
    });
    reportPlanModelCatalogAction({
      actionType: PlanModelCatalogAnalyticsActionType.CategoryChange,
      activeCategory: PlanModelCatalogAnalyticsCategory.Text,
      modelCounts: {
        image: 5,
        text: 24,
        video: 4,
      },
      previousCategory: PlanModelCatalogAnalyticsCategory.Text,
      source: PlanModelCatalogAnalyticsSource.CatalogToolbar,
      targetCategory: PlanModelCatalogAnalyticsCategory.Image,
      visibleModelCount: 5,
    });

    const calls = vi.mocked(reportYdAnalyzer).mock.calls;
    expect(calls[0][0]).toMatchObject({
      action: LogReporterAction.PlanModelCatalogAction,
      actionType: PlanModelCatalogAnalyticsActionType.OpenTab,
      previousTab: 'general',
      source: PlanModelCatalogAnalyticsSource.SettingsSidebar,
      targetTab: 'planModelIntro',
    });
    expect(calls[1][0]).toMatchObject({
      action: LogReporterAction.PlanModelCatalogAction,
      actionType: PlanModelCatalogAnalyticsActionType.CategoryChange,
      activeCategory: PlanModelCatalogAnalyticsCategory.Text,
      imageModelCount: 5,
      source: PlanModelCatalogAnalyticsSource.CatalogToolbar,
      targetCategory: PlanModelCatalogAnalyticsCategory.Image,
      textModelCount: 24,
      totalModelCount: 33,
      videoModelCount: 4,
      visibleModelCount: 5,
    });
    const payload = JSON.stringify(calls);
    expect(payload).not.toContain('DeepSeek-V4-Flash');
    expect(payload).not.toContain('https://lobsterai.youdao.com');
  });

  test('reports pricing open result without error details', () => {
    reportPlanModelCatalogAction({
      actionType: PlanModelCatalogAnalyticsActionType.OpenPricing,
      activeCategory: PlanModelCatalogAnalyticsCategory.Video,
      errorCode: 'open_external_failed',
      result: PlanModelCatalogAnalyticsResult.Failed,
      source: PlanModelCatalogAnalyticsSource.CatalogToolbar,
    });

    expect(reportYdAnalyzer).toHaveBeenCalledWith(expect.objectContaining({
      action: LogReporterAction.PlanModelCatalogAction,
      actionType: PlanModelCatalogAnalyticsActionType.OpenPricing,
      activeCategory: PlanModelCatalogAnalyticsCategory.Video,
      errorCode: 'open_external_failed',
      result: PlanModelCatalogAnalyticsResult.Failed,
    }));
    expect(JSON.stringify(vi.mocked(reportYdAnalyzer).mock.calls))
      .not.toContain('shell.openExternal failed with private details');
  });
});
