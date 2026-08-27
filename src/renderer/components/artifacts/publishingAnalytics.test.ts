import {
  PublishingCountMode,
  PublishingIdentityType,
  PublishingResourceKind,
} from '@shared/publishing/constants';
import { describe, expect, test, vi } from 'vitest';

import { reportYdAnalyzer } from '@/services/logReporter';

import { ArtifactPreviewActionSource, ArtifactPublishEntryPoint } from './artifactAnalytics';
import { ArtifactSubscriptionFeature } from './artifactSubscriptionGate';
import {
  createPublishingAnalyticsAttempt,
  createPublishingAnalyticsDialog,
  PublishingAnalyticsActionType,
  PublishingAnalyticsCtaId,
  PublishingAnalyticsDeploymentPhase,
  PublishingAnalyticsDialogType,
  PublishingAnalyticsFinalStatus,
  PublishingAnalyticsOperationType,
  PublishingAnalyticsResult,
  PublishingAnalyticsTarget,
  reportPublishingDeploymentResult,
  reportPublishingDialogAction,
  reportPublishingDialogExposure,
} from './publishingAnalytics';

vi.mock('@/services/logReporter', async () => {
  const actual = await vi.importActual<typeof import('@/services/logReporter')>(
    '@/services/logReporter',
  );
  return { ...actual, reportYdAnalyzer: vi.fn() };
});

describe('publishing analytics', () => {
  test('keeps an attempt id across exposure and click without private resource data', () => {
    vi.mocked(reportYdAnalyzer).mockClear();
    const attempt = createPublishingAnalyticsAttempt({
      feature: ArtifactSubscriptionFeature.Share,
      resourceKind: PublishingResourceKind.File,
      operationType: PublishingAnalyticsOperationType.Create,
      source: ArtifactPreviewActionSource.LibraryList,
      entryPoint: ArtifactPublishEntryPoint.LibraryMenu,
      surface: 'my_files',
      pageViewId: 'page-view-1',
      hasExistingResource: false,
    });
    const dialog = createPublishingAnalyticsDialog(
      attempt,
      PublishingAnalyticsDialogType.TrialNotice,
      {
        resourceKind: PublishingResourceKind.File,
        identityType: PublishingIdentityType.Free,
        countMode: PublishingCountMode.Total,
        used: 2,
        limit: 10,
        canReleaseByClosing: false,
      },
      7200,
    );

    reportPublishingDialogExposure(dialog);
    reportPublishingDialogAction(dialog, {
      actionType: PublishingAnalyticsActionType.Click,
      ctaId: PublishingAnalyticsCtaId.Primary,
      target: PublishingAnalyticsTarget.Continue,
    });

    const calls = vi.mocked(reportYdAnalyzer).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toMatchObject({
      attemptId: attempt.attemptId,
      exposureId: dialog.exposureId,
      surface: 'my_files',
      pageViewId: 'page-view-1',
      quotaUsed: 2,
      quotaLimit: 10,
      trialAccessTtlSeconds: 7200,
    });
    expect(calls[1][0]).toMatchObject({
      attemptId: attempt.attemptId,
      exposureId: dialog.exposureId,
      operationId: expect.any(String),
      target: PublishingAnalyticsTarget.Continue,
      dialogVisibleMs: expect.any(Number),
    });
    expect(JSON.stringify(calls)).not.toContain('filePath');
    expect(JSON.stringify(calls)).not.toContain('shareCode');
  });

  test('reports both readable deployment id names during schema migration', () => {
    vi.mocked(reportYdAnalyzer).mockClear();
    const attempt = createPublishingAnalyticsAttempt({
      feature: ArtifactSubscriptionFeature.Deployment,
      resourceKind: PublishingResourceKind.Site,
      operationType: PublishingAnalyticsOperationType.Create,
      source: ArtifactPreviewActionSource.ArtifactPanel,
      entryPoint: ArtifactPublishEntryPoint.ArtifactToolbar,
      hasExistingResource: false,
    });

    reportPublishingDeploymentResult(attempt, {
      operationId: 'operation-1',
      operationType: PublishingAnalyticsOperationType.Create,
      eventPhase: PublishingAnalyticsDeploymentPhase.Accepted,
      finalStatus: PublishingAnalyticsFinalStatus.Publishing,
      siteId: 'site-1',
      deploymentId: 'deployment-1',
      result: PublishingAnalyticsResult.Success,
    });

    expect(reportYdAnalyzer).toHaveBeenCalledWith(expect.objectContaining({
      siteId: 'site-1',
      deploymentId: 'deployment-1',
      deployId: 'deployment-1',
    }));
  });
});
