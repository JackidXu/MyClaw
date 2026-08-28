import {
  PublishingIdentityType,
  type PublishingQuotaErrorData,
  PublishingResourceKind,
} from '@shared/publishing/constants';

import { LogReporterAction, reportYdAnalyzer } from '@/services/logReporter';
import { rememberPublishingConversionAttribution } from '@/services/publishingConversionAttribution';

import {
  type ArtifactPreviewActionSource,
  type ArtifactPublishEntryPoint,
} from './artifactAnalytics';
import {
  ArtifactSubscriptionBlockReason,
  ArtifactSubscriptionFeature,
  type ArtifactSubscriptionFeature as ArtifactSubscriptionFeatureValue,
} from './artifactSubscriptionGate';

export const PublishingAnalyticsEventVersion = 2;
export const PublishingAnalyticsDialogVersion = 2;

export const PublishingAnalyticsOperationType = {
  Create: 'create',
  Manage: 'manage',
  UpdateContent: 'update_content',
  UpdatePermission: 'update_permission',
  Redeploy: 'redeploy',
  Unknown: 'unknown',
} as const;

export type PublishingAnalyticsOperationType =
  typeof PublishingAnalyticsOperationType[keyof typeof PublishingAnalyticsOperationType];

export const PublishingAnalyticsDialogType = {
  LoginRequired: 'login_required',
  TrialNotice: 'trial_notice',
  FreeQuotaExhausted: 'free_quota_exhausted',
  SubscriptionRequired: 'subscription_required',
  ActiveQuotaLimit: 'active_quota_limit',
  EnterpriseUnavailable: 'enterprise_unavailable',
  ShareEditor: 'share_editor',
  DeploymentEditor: 'deployment_editor',
  DeploymentStatus: 'deployment_status',
} as const;

export type PublishingAnalyticsDialogType =
  typeof PublishingAnalyticsDialogType[keyof typeof PublishingAnalyticsDialogType];

export const PublishingAnalyticsActionType = {
  Click: 'click',
  Close: 'close',
} as const;

export type PublishingAnalyticsActionType =
  typeof PublishingAnalyticsActionType[keyof typeof PublishingAnalyticsActionType];

export const PublishingAnalyticsCtaId = {
  Primary: 'primary',
  Secondary: 'secondary',
  Close: 'close',
} as const;

export type PublishingAnalyticsCtaId =
  typeof PublishingAnalyticsCtaId[keyof typeof PublishingAnalyticsCtaId];

export const PublishingAnalyticsTarget = {
  Login: 'login',
  Continue: 'continue',
  Pricing: 'pricing',
  LearnBenefits: 'learn_benefits',
  ManageCloud: 'manage_cloud',
  CreateShare: 'create_share',
  UpdateContent: 'update_content',
  UpdatePermission: 'update_permission',
  CopyLink: 'copy_link',
  CreateDeployment: 'create_deployment',
  Redeploy: 'redeploy',
  Dismiss: 'dismiss',
} as const;

export type PublishingAnalyticsTarget =
  typeof PublishingAnalyticsTarget[keyof typeof PublishingAnalyticsTarget];

export const PublishingAnalyticsResult = {
  Success: 'success',
  Failure: 'fail',
} as const;

export type PublishingAnalyticsResult =
  typeof PublishingAnalyticsResult[keyof typeof PublishingAnalyticsResult];

export const PublishingAnalyticsErrorCategory = {
  ApiUnavailable: 'api_unavailable',
  InvalidSource: 'invalid_source',
  NetworkOrServer: 'network_or_server',
  Quota: 'quota',
  Subscription: 'subscription',
  Unknown: 'unknown',
} as const;

export type PublishingAnalyticsErrorCategory =
  typeof PublishingAnalyticsErrorCategory[keyof typeof PublishingAnalyticsErrorCategory];

export const PublishingAnalyticsDeploymentPhase = {
  Accepted: 'accepted',
  Terminal: 'terminal',
} as const;

export type PublishingAnalyticsDeploymentPhase =
  typeof PublishingAnalyticsDeploymentPhase[keyof typeof PublishingAnalyticsDeploymentPhase];

export const PublishingAnalyticsFinalStatus = {
  Publishing: 'publishing',
  Live: 'live',
  Failed: 'failed',
  Stopped: 'stopped',
  Expired: 'expired',
} as const;

export type PublishingAnalyticsFinalStatus =
  typeof PublishingAnalyticsFinalStatus[keyof typeof PublishingAnalyticsFinalStatus];

export interface PublishingAnalyticsAttemptContext {
  attemptId: string;
  feature: ArtifactSubscriptionFeatureValue;
  resourceKind: typeof PublishingResourceKind.File | typeof PublishingResourceKind.Site;
  operationType: PublishingAnalyticsOperationType;
  source: ArtifactPreviewActionSource;
  entryPoint: ArtifactPublishEntryPoint;
  surface?: string;
  pageViewId?: string;
  hasExistingResource?: boolean;
}

export interface PublishingAnalyticsDialogContext {
  attempt: PublishingAnalyticsAttemptContext;
  dialogType: PublishingAnalyticsDialogType;
  exposureId: string;
  openedAt: number;
  quota?: PublishingQuotaErrorData;
  trialAccessTtlSeconds?: number;
}

const createId = (): string => (
  globalThis.crypto?.randomUUID?.()
  ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
);

export const createPublishingAnalyticsOperationId = createId;

export const createPublishingAnalyticsAttempt = (
  input: Omit<PublishingAnalyticsAttemptContext, 'attemptId'>,
): PublishingAnalyticsAttemptContext => ({
  ...input,
  attemptId: createId(),
});

export const updatePublishingAnalyticsAttempt = (
  attempt: PublishingAnalyticsAttemptContext,
  update: Partial<Pick<
    PublishingAnalyticsAttemptContext,
    'operationType' | 'hasExistingResource'
  >>,
): PublishingAnalyticsAttemptContext => ({ ...attempt, ...update });

export const createPublishingAnalyticsDialog = (
  attempt: PublishingAnalyticsAttemptContext,
  dialogType: PublishingAnalyticsDialogType,
  quota?: PublishingQuotaErrorData,
  trialAccessTtlSeconds?: number,
): PublishingAnalyticsDialogContext => ({
  attempt,
  dialogType,
  exposureId: createId(),
  openedAt: Date.now(),
  quota,
  trialAccessTtlSeconds,
});

export const getPublishingDialogTypeForSubscriptionReason = (
  reason: ArtifactSubscriptionBlockReason,
): PublishingAnalyticsDialogType => {
  if (reason === ArtifactSubscriptionBlockReason.LoginRequired) {
    return PublishingAnalyticsDialogType.LoginRequired;
  }
  if (reason === ArtifactSubscriptionBlockReason.EnterpriseUnavailable) {
    return PublishingAnalyticsDialogType.EnterpriseUnavailable;
  }
  return PublishingAnalyticsDialogType.SubscriptionRequired;
};

export const getPublishingDialogTypeForQuota = (
  quota: PublishingQuotaErrorData,
): PublishingAnalyticsDialogType => (
  quota.identityType === PublishingIdentityType.Free
    ? PublishingAnalyticsDialogType.FreeQuotaExhausted
    : PublishingAnalyticsDialogType.ActiveQuotaLimit
);

const getAttemptParams = (
  attempt: PublishingAnalyticsAttemptContext,
): Record<string, string | number | boolean | undefined> => ({
  eventVersion: PublishingAnalyticsEventVersion,
  attemptId: attempt.attemptId,
  feature: attempt.feature,
  resourceKind: attempt.resourceKind,
  operationType: attempt.operationType,
  source: attempt.source,
  entryPoint: attempt.entryPoint,
  surface: attempt.surface,
  pageViewId: attempt.pageViewId,
  hasExistingResource: attempt.hasExistingResource,
});

const getDialogParams = (
  context: PublishingAnalyticsDialogContext,
): Record<string, string | number | boolean | undefined> => ({
  ...getAttemptParams(context.attempt),
  dialogVersion: PublishingAnalyticsDialogVersion,
  dialogType: context.dialogType,
  exposureId: context.exposureId,
  identityType: context.quota?.identityType,
  countMode: context.quota?.countMode,
  quotaUsed: context.quota?.used,
  quotaLimit: context.quota?.limit,
  canReleaseByClosing: context.quota?.canReleaseByClosing,
  trialAccessTtlSeconds: context.trialAccessTtlSeconds,
});

export const reportPublishingEntryAction = (
  attempt: PublishingAnalyticsAttemptContext,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.PublishingEntryAction,
    actionType: 'click',
    ...getAttemptParams(attempt),
  });
};

export const reportPublishingDialogExposure = (
  context: PublishingAnalyticsDialogContext,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.PublishingDialogExposure,
    actionType: 'exposure',
    ...getDialogParams(context),
  });
};

export interface ReportPublishingDialogActionOptions {
  actionType: PublishingAnalyticsActionType;
  ctaId: PublishingAnalyticsCtaId;
  target: PublishingAnalyticsTarget;
  operationId?: string;
}

export const reportPublishingDialogAction = (
  context: PublishingAnalyticsDialogContext,
  options: ReportPublishingDialogActionOptions,
): string => {
  const dialogVisibleMs = Math.max(0, Date.now() - context.openedAt);
  const operationId = options.operationId ?? createPublishingAnalyticsOperationId();
  if (
    options.actionType === PublishingAnalyticsActionType.Click
    && (
      options.target === PublishingAnalyticsTarget.Login
      || options.target === PublishingAnalyticsTarget.Pricing
      || options.target === PublishingAnalyticsTarget.LearnBenefits
    )
  ) {
    rememberPublishingConversionAttribution({
      attemptId: context.attempt.attemptId,
      feature: context.attempt.feature,
      resourceKind: context.attempt.resourceKind,
      operationType: context.attempt.operationType,
      source: context.attempt.source,
      entryPoint: context.attempt.entryPoint,
      surface: context.attempt.surface,
      pageViewId: context.attempt.pageViewId,
      hasExistingResource: context.attempt.hasExistingResource,
      dialogType: context.dialogType,
      exposureId: context.exposureId,
      identityType: context.quota?.identityType,
      countMode: context.quota?.countMode,
      quotaUsed: context.quota?.used,
      quotaLimit: context.quota?.limit,
      canReleaseByClosing: context.quota?.canReleaseByClosing,
      trialAccessTtlSeconds: context.trialAccessTtlSeconds,
      ctaId: options.ctaId,
      target: options.target,
      operationId,
      dialogVisibleMs,
    });
  }
  void reportYdAnalyzer({
    action: LogReporterAction.PublishingDialogAction,
    ...getDialogParams(context),
    ...options,
    operationId,
    dialogVisibleMs,
  });
  return operationId;
};

export interface ReportPublishingOperationResultOptions {
  result: PublishingAnalyticsResult;
  operationType?: PublishingAnalyticsOperationType;
  errorCategory?: PublishingAnalyticsErrorCategory;
  operationId?: string;
  exposureId?: string;
  shareId?: string;
  siteId?: string;
  deploymentId?: string;
  accessPermission?: string;
  durationMs?: number;
  finalStatus?: PublishingAnalyticsFinalStatus;
  rawDeploymentStatus?: string;
}

export const reportPublishingOperationResult = (
  attempt: PublishingAnalyticsAttemptContext,
  options: ReportPublishingOperationResultOptions,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.PublishingOperationResult,
    ...getAttemptParams(attempt),
    operationType: options.operationType ?? attempt.operationType,
    operationId: options.operationId ?? createPublishingAnalyticsOperationId(),
    exposureId: options.exposureId,
    shareId: options.shareId,
    siteId: options.siteId,
    deploymentId: options.deploymentId,
    deployId: options.deploymentId,
    accessPermission: options.accessPermission,
    durationMs: options.durationMs,
    finalStatus: options.finalStatus,
    rawDeploymentStatus: options.rawDeploymentStatus,
    result: options.result,
    errorCategory: options.errorCategory,
  });
};

interface PublishingOperationEventOptions {
  operationId: string;
  exposureId?: string;
  result: PublishingAnalyticsResult;
  errorCategory?: PublishingAnalyticsErrorCategory;
  durationMs?: number;
  accessPermission?: string;
}

export interface ReportPublishingShareResultOptions extends PublishingOperationEventOptions {
  operationType: PublishingAnalyticsOperationType;
  shareId?: string;
}

export const reportPublishingShareResult = (
  attempt: PublishingAnalyticsAttemptContext,
  options: ReportPublishingShareResultOptions,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.PublishShareResult,
    ...getAttemptParams(attempt),
    ...options,
  });
};

export interface ReportPublishingCopyShareLinkOptions extends PublishingOperationEventOptions {
  shareId: string;
}

export const reportPublishingCopyShareLink = (
  attempt: PublishingAnalyticsAttemptContext,
  options: ReportPublishingCopyShareLinkOptions,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.PublishCopyShareLink,
    ...getAttemptParams(attempt),
    operationType: 'copy_link',
    ...options,
  });
};

export interface ReportPublishingDeploymentResultOptions extends PublishingOperationEventOptions {
  operationType: PublishingAnalyticsOperationType;
  eventPhase: PublishingAnalyticsDeploymentPhase;
  finalStatus: PublishingAnalyticsFinalStatus;
  siteId?: string;
  deploymentId?: string;
  rawDeploymentStatus?: string;
}

export const reportPublishingDeploymentResult = (
  attempt: PublishingAnalyticsAttemptContext,
  options: ReportPublishingDeploymentResultOptions,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.PublishDeploymentResult,
    ...getAttemptParams(attempt),
    ...options,
    deployId: options.deploymentId,
  });
};

export interface ReportPublishingCopyDeployLinkOptions extends PublishingOperationEventOptions {
  siteId: string;
  deploymentId: string;
  finalStatus: PublishingAnalyticsFinalStatus;
  rawDeploymentStatus?: string;
}

export const reportPublishingCopyDeployLink = (
  attempt: PublishingAnalyticsAttemptContext,
  options: ReportPublishingCopyDeployLinkOptions,
): void => {
  void reportYdAnalyzer({
    action: LogReporterAction.PublishCopyDeployLink,
    ...getAttemptParams(attempt),
    operationType: 'copy_link',
    ...options,
    deployId: options.deploymentId,
  });
};

export const reportDeploymentDialogExposure = (
  context: PublishingAnalyticsDialogContext,
): void => {
  const action = context.dialogType === PublishingAnalyticsDialogType.DeploymentStatus
    ? LogReporterAction.DeploymentStatusExposure
    : LogReporterAction.DeploymentEditorExposure;
  void reportYdAnalyzer({
    action,
    actionType: 'exposure',
    ...getDialogParams(context),
  });
};

export const reportDeploymentDialogAction = (
  context: PublishingAnalyticsDialogContext,
  options: ReportPublishingDialogActionOptions,
): string => {
  const operationId = options.operationId ?? createPublishingAnalyticsOperationId();
  const action = context.dialogType === PublishingAnalyticsDialogType.DeploymentStatus
    ? LogReporterAction.DeploymentStatusAction
    : LogReporterAction.DeploymentEditorAction;
  void reportYdAnalyzer({
    action,
    ...getDialogParams(context),
    ...options,
    operationId,
    dialogVisibleMs: Math.max(0, Date.now() - context.openedAt),
  });
  return operationId;
};

export const getPublishingFeatureResourceKind = (
  feature: ArtifactSubscriptionFeatureValue,
): typeof PublishingResourceKind.File | typeof PublishingResourceKind.Site => (
  feature === ArtifactSubscriptionFeature.Share
    ? PublishingResourceKind.File
    : PublishingResourceKind.Site
);

export const getPublishingErrorCategory = (error: unknown): PublishingAnalyticsErrorCategory => {
  if (!error) return PublishingAnalyticsErrorCategory.Unknown;
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '').toLowerCase()
    : '';
  if (code.includes('quota') || code.includes('limit')) {
    return PublishingAnalyticsErrorCategory.Quota;
  }
  if (code.includes('subscription')) {
    return PublishingAnalyticsErrorCategory.Subscription;
  }
  return PublishingAnalyticsErrorCategory.NetworkOrServer;
};
