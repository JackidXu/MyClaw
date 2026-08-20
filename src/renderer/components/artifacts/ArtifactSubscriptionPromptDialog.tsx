import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { i18nService } from '@/services/i18n';

import type { PublishingTrialPolicy } from '../../../shared/publishing/constants';
import {
  ArtifactSubscriptionBlockReason,
  ArtifactSubscriptionFeature,
  getArtifactSubscriptionPromptCopyKeys,
} from './artifactSubscriptionGate';

interface ArtifactSubscriptionPromptDialogProps {
  feature: ArtifactSubscriptionFeature;
  reason: ArtifactSubscriptionBlockReason;
  onCancel: () => void;
  onLogin: () => void;
  onSubscribe: () => void;
}

const ArtifactSubscriptionPromptDialog = ({
  feature,
  reason,
  onCancel,
  onLogin,
  onSubscribe,
}: ArtifactSubscriptionPromptDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [trialPolicy, setTrialPolicy] = useState<PublishingTrialPolicy | null>(null);
  const [isTrialPolicyLoading, setIsTrialPolicyLoading] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const copyKeys = getArtifactSubscriptionPromptCopyKeys(feature, reason);
  const isEnterpriseUnavailable =
    reason === ArtifactSubscriptionBlockReason.EnterpriseUnavailable;
  const isLoginRequired = reason === ArtifactSubscriptionBlockReason.LoginRequired;
  const resourcePolicy = feature === ArtifactSubscriptionFeature.Share
    ? trialPolicy?.file
    : trialPolicy?.site;

  useEffect(() => {
    if (!isLoginRequired) return undefined;
    let active = true;
    setIsTrialPolicyLoading(true);
    const request = window.electron?.htmlShare?.getTrialPolicy();
    if (!request) {
      setIsTrialPolicyLoading(false);
      return undefined;
    }
    void request
      .then(result => {
        if (active) setTrialPolicy(result?.success && result.data ? result.data : null);
      })
      .catch(() => {
        if (active) setTrialPolicy(null);
      })
      .finally(() => {
        if (active) setIsTrialPolicyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isLoginRequired]);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frameId = window.requestAnimationFrame(() => initialButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialogElement = dialogRef.current;
      if (!dialogElement) return;
      const focusableElements = Array.from(
        dialogElement.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      if (!dialogElement.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [onCancel]);

  const trialTitleKey = feature === ArtifactSubscriptionFeature.Share
    ? 'publishingTrialShareTitle'
    : 'publishingTrialSiteTitle';
  const trialFeatureLabel = i18nService.t(feature === ArtifactSubscriptionFeature.Share
    ? 'publishingTrialFeatureShare'
    : 'publishingTrialFeatureSite');
  const trialMessage = (() => {
    if (isTrialPolicyLoading) return i18nService.t('publishingTrialPolicyLoading');
    if (!resourcePolicy) {
      return i18nService.t(isLoginRequired
        ? 'publishingTrialLoginFallbackMessage'
        : 'publishingTrialLimitFallbackMessage');
    }
    return i18nService.t('publishingTrialLoginMessage')
      .replace('{feature}', trialFeatureLabel)
      .replace('{limit}', String(resourcePolicy.limit));
  })();

  const dialog = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/35 px-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`w-full border border-border bg-background shadow-2xl ${
          !isLoginRequired
            ? 'max-w-[420px] rounded-lg p-4'
            : 'max-w-[448px] rounded-none px-8 py-9'
        }`}
      >
        {!isLoginRequired ? (
          <>
            <h2 id={titleId} className="text-sm font-semibold text-foreground">
              {i18nService.t(copyKeys.titleKey)}
            </h2>
            <div
              id={descriptionId}
              className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-secondary"
            >
              {i18nService.t(copyKeys.messageKey)}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                ref={initialButtonRef}
                type="button"
                onClick={onCancel}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface hover:text-foreground"
              >
                {i18nService.t('cancel')}
              </button>
              {!isEnterpriseUnavailable && (
                <button
                  type="button"
                  onClick={onSubscribe}
                  className="ml-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {i18nService.t('subscriptionGateOpenAction')}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId} className="text-center text-lg font-semibold text-foreground">
              {i18nService.t(trialTitleKey)}
            </h2>
            <div
              id={descriptionId}
              className="mt-5 break-words text-center text-sm leading-6 text-foreground"
              aria-live="polite"
            >
              {trialMessage}
            </div>
            <div className="mt-8 flex flex-col items-stretch gap-3">
              <button
                ref={initialButtonRef}
                type="button"
                onClick={onLogin}
                className="h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {i18nService.t('publishingTrialLoginAction')}
              </button>
              <button
                type="button"
                onClick={onSubscribe}
                className="self-center text-sm text-muted transition-colors hover:text-foreground"
              >
                {i18nService.t('publishingTrialLearnBenefits')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
};

export default ArtifactSubscriptionPromptDialog;
