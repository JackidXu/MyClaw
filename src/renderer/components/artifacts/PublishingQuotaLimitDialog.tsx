import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  PublishingCountMode,
  PublishingIdentityType,
  type PublishingQuotaErrorData,
  PublishingResourceKind,
} from '@shared/publishing/constants';
import React from 'react';
import { createPortal } from 'react-dom';

import { i18nService } from '@/services/i18n';

interface PublishingQuotaLimitDialogProps {
  quota: PublishingQuotaErrorData;
  onClose: () => void;
  onManage: () => void;
  onSubscribe: () => void;
}

const t = (key: string): string => i18nService.t(key);

const PublishingQuotaLimitDialog: React.FC<PublishingQuotaLimitDialogProps> = ({
  quota,
  onClose,
  onManage,
  onSubscribe,
}) => {
  const isFile = quota.resourceKind === PublishingResourceKind.File;
  const isFreeTrialLimit = quota.identityType === PublishingIdentityType.Free;
  const resourceLabel = t(isFile ? 'publishingQuotaResourceFile' : 'publishingQuotaResourceSite');
  const isHistoricalTotal = quota.countMode === PublishingCountMode.Total
    || !quota.canReleaseByClosing;
  const messageKey = isHistoricalTotal
    ? 'publishingQuotaTotalMessage'
    : 'publishingQuotaActiveMessage';
  const message = t(messageKey)
    .replace('{resource}', resourceLabel)
    .replace('{limit}', String(quota.limit));

  if (isFreeTrialLimit) {
    const trialFeatureLabel = t(isFile
      ? 'publishingTrialFeatureShare'
      : 'publishingTrialFeatureSite');
    const trialMessage = t('publishingTrialLimitReachedMessage')
      .replace('{feature}', trialFeatureLabel)
      .replace('{limit}', String(quota.limit));
    return createPortal(
      <div
        className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/35 px-4"
        onMouseDown={event => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="publishing-trial-limit-title"
          className="w-full max-w-[448px] border border-border bg-background px-8 py-9 shadow-2xl"
        >
          <h2
            id="publishing-trial-limit-title"
            className="text-center text-lg font-semibold text-foreground"
          >
            {t(isFile ? 'publishingTrialShareTitle' : 'publishingTrialSiteTitle')}
          </h2>
          <p className="mt-5 text-center text-sm leading-6 text-foreground">
            {trialMessage}
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-3">
            <button
              type="button"
              onClick={onSubscribe}
              className="h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t('subscriptionGateOpenAction')}
            </button>
            <button
              type="button"
              onClick={onSubscribe}
              className="self-center text-sm text-muted transition-colors hover:text-foreground"
            >
              {t('publishingTrialLearnBenefits')}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/35 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publishing-quota-title"
        className="w-full max-w-[480px] rounded-2xl border border-border bg-background p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
            <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="publishing-quota-title" className="text-lg font-semibold text-foreground">
              {t(isFile ? 'publishingQuotaFileTitle' : 'publishingQuotaSiteTitle')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-secondary">{message}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-sm">
          <span className="text-secondary">{t('publishingQuotaUsage')}</span>
          <span className="font-medium text-foreground">
            {t('publishingQuotaUsageValue')
              .replace('{used}', String(quota.used))
              .replace('{limit}', String(quota.limit))}
          </span>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm text-secondary hover:bg-surface"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onManage}
            className="h-9 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('publishingQuotaManage')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PublishingQuotaLimitDialog;
