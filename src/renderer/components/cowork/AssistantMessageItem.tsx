import {
  ArrowPathIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  isContextOverflowNotice,
  isOutputTruncated,
  stripTruncationMarkers,
} from '../../../shared/cowork/constants';
import {
  type CoworkGoal,
  formatCoworkGoalCompletionDuration,
} from '../../../shared/cowork/goal';
import { i18nService } from '../../services/i18n';
import { secondBrainApi } from '../../services/secondBrainApi';
import { vipService } from '../../services/vipService';
import type { CoworkMessage, CoworkMessageMetadata } from '../../types/cowork';
import { formatMessageDateTime } from '../../utils/tokenFormat';
import BrainIcon from '../icons/BrainIcon';
import ExclamationTriangleIcon from '../icons/ExclamationTriangleIcon';
import GoalIcon from '../icons/GoalIcon';
import MessageForkIcon from '../icons/MessageForkIcon';
import MarkdownContent from '../MarkdownContent';
import { CoworkUiEvent } from './constants';
import { reportConversationMessageAction } from './conversationAnalytics';
import ImagePreviewModal, { type ImagePreviewSource } from './ImagePreviewModal';
import { MessageCopyButton } from './MessageActionButton';
import {
  getMessageModelLabel,
  MEDIA_TOKEN_DISPLAY_RE,
  messageMetaClassName,
} from './messageDisplayUtils';
import ProposedPlanBlock from './ProposedPlanBlock';
import { parseProposedPlanBlock } from './proposedPlanParser';

export { MessageCopyButton as CopyButton } from './MessageActionButton';

const ForkButton: React.FC<{
  message: CoworkMessage;
  visible: boolean;
  onFork: () => void;
}> = ({ message, visible, onFork }) => (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      reportConversationMessageAction({
        actionType: 'fork_from_assistant_message',
        message,
      });
      onFork();
    }}
    className={`p-1.5 rounded-md hover:bg-surface-raised transition-all duration-200 ${
      visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
    }`}
    tabIndex={visible ? 0 : -1}
    title={i18nService.t('coworkForkFromMessage')}
    aria-label={i18nService.t('coworkForkFromMessage')}
  >
    <MessageForkIcon className="h-4 w-4 text-secondary" />
  </button>
);

const ReportSecondBrainButton: React.FC<{
  assistantContent: string;
  userMessage?: CoworkMessage | null;
  sessionId?: string;
  visible: boolean;
}> = ({ assistantContent, userMessage, sessionId, visible }) => {
  const [hasSecondBrain, setHasSecondBrain] = useState<boolean>(() =>
    vipService.hasSecondBrainPermission(),
  );
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return vipService.subscribe(() => {
      setHasSecondBrain(vipService.hasSecondBrainPermission());
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!hasSecondBrain) {
    return null;
  }

  const handleReport = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (reporting || reported) return;

    const userText = userMessage?.content?.trim() || '';
    const assistantText = assistantContent?.trim() || '';
    if (!assistantText) return;

    const effectiveSessionId = sessionId || '';
    const chatId = effectiveSessionId ? `chat_${effectiveSessionId}` : 'chat_default';
    const name = Array.from(userText.replace(/\s+/g, ' ').trim()).slice(0, 50).join('').trim() || '对话';

    setReporting(true);
    try {
      await secondBrainApi.reportChat({
        chatId,
        name,
        messages: [{
          user: userText,
          assistant: assistantText,
        }],
      });
      setReported(true);
      window.dispatchEvent(
        new CustomEvent('app:showToast', {
          detail: i18nService.t('reportToSecondBrainSuccess'),
        }),
      );
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setReported(false), 2000);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      window.dispatchEvent(
        new CustomEvent('app:showToast', {
          detail: `${i18nService.t('reportToSecondBrainFailed')}: ${errMsg}`,
        }),
      );
    } finally {
      setReporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleReport}
      disabled={reporting}
      className={`p-1.5 rounded-md hover:bg-surface-raised transition-all duration-200 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${reporting ? 'opacity-70 cursor-wait' : ''}`}
      tabIndex={visible ? 0 : -1}
      title={i18nService.t('reportToSecondBrain')}
      aria-label={i18nService.t('reportToSecondBrain')}
    >
      {reported ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-success"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : reporting ? (
        <ArrowPathIcon className="h-4 w-4 text-secondary animate-spin" />
      ) : (
        <BrainIcon className="h-4 w-4 text-secondary" />
      )}
    </button>
  );
};

// ── AssistantMessageItem ─────────────────────────────────────────────────────

const AssistantMessageItem: React.FC<{
  message: CoworkMessage;
  userMessage?: CoworkMessage | null;
  sessionId?: string;
  resolveLocalFilePath?: (href: string, text: string) => string | null;
  mapDisplayText?: (value: string) => string;
  showCopyButton?: boolean;
  onFork?: (messageId: string) => void;
  turnMetadata?: CoworkMessageMetadata | null;
  completedGoal?: CoworkGoal | null;
  planConfirmationMessageId?: string | null;
  onConfirmPlan?: (messageId: string) => void;
  onAdjustPlan?: (messageId: string) => void;
  forceSearchExpanded?: boolean;
}> = ({
  message,
  userMessage,
  sessionId,
  resolveLocalFilePath,
  mapDisplayText,
  showCopyButton = false,
  onFork,
  turnMetadata,
  completedGoal,
  planConfirmationMessageId,
  onConfirmPlan,
  onAdjustPlan,
  forceSearchExpanded = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [expandedImage, setExpandedImage] = useState<ImagePreviewSource | null>(null);
  const rawContent = mapDisplayText ? mapDisplayText(message.content) : message.content;
  const isTruncated = isOutputTruncated(rawContent, message.metadata as { isTruncated?: boolean; stopReason?: string });
  const cleanedContent = isTruncated ? stripTruncationMarkers(rawContent) : rawContent;
  const proposedPlan = parseProposedPlanBlock(cleanedContent);
  const displayContent = proposedPlan.visibleText.replace(MEDIA_TOKEN_DISPLAY_RE, '').trimEnd();
  const copyContent = [
    displayContent,
    proposedPlan.planText,
  ].filter((part): part is string => Boolean(part)).join('\n\n');
  const modelLabel = getMessageModelLabel(turnMetadata);
  const goalCompletionDuration = completedGoal
    ? formatCoworkGoalCompletionDuration(completedGoal)
    : null;
  const goalCompletionLabel = goalCompletionDuration
    ? i18nService.t('coworkGoalCompletedIn').replace('{duration}', goalCompletionDuration)
    : null;
  const metaVisible = isHovered || !!goalCompletionLabel;
  const showPlanConfirmationActions = planConfirmationMessageId === message.id;

  const handleContinueGenerating = useCallback(() => {
    window.dispatchEvent(new CustomEvent(CoworkUiEvent.FocusInput, {
      detail: {
        text: i18nService.t('continueGeneratingPrompt'),
        clear: false,
      },
    }));
  }, []);
  const handleImageClick = useCallback((image: ImagePreviewSource) => {
    reportConversationMessageAction({
      actionType: 'open_message_image',
      message,
      params: {
        messageRole: 'assistant',
      },
    });
    setExpandedImage(image);
  }, [message]);
  useEffect(() => {
    if (!proposedPlan.didNormalizePlanText) return;
    window.electron?.log?.fromRenderer?.(
      'debug',
      'AssistantMessageItem',
      `Normalized inline section labels in proposed plan ${message.id}.`,
    );
  }, [message.id, proposedPlan.didNormalizePlanText]);
  useEffect(() => {
    if (!proposedPlan.ignoredInlineOpenTagCount) return;
    window.electron?.log?.fromRenderer?.(
      'debug',
      'AssistantMessageItem',
      `Ignored ${proposedPlan.ignoredInlineOpenTagCount} inline proposed plan tag mention(s) before block in message ${message.id}.`,
    );
  }, [message.id, proposedPlan.ignoredInlineOpenTagCount]);
  const handleBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsHovered(false);
  }, []);
  const handleMouseLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (document.activeElement instanceof HTMLElement && event.currentTarget.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    setIsHovered(false);
  }, []);

  return (
    <div
      className="relative focus:outline-none"
      data-cowork-assistant-message-id={message.id}
      data-cowork-search-message-id={message.id}
      tabIndex={showCopyButton ? 0 : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setIsHovered(true)}
      onBlur={handleBlur}
    >
      <div className="text-foreground">
        {isContextOverflowNotice(displayContent) ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-subtle dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div className="flex-1 space-y-3">
                <p className="font-medium leading-relaxed">
                  {i18nService.t('coworkContextOverflowDesktopNotice')}
                </p>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent(CoworkUiEvent.ShortcutNewSession))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:text-neutral-900 dark:hover:bg-amber-400"
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>{i18nService.t('newChat')}</span>
                </button>
              </div>
            </div>
          </div>
        ) : displayContent ? (
          <div>
            <MarkdownContent
              content={displayContent}
              className="prose dark:prose-invert max-w-none"
              resolveLocalFilePath={resolveLocalFilePath}
              forceExpanded={forceSearchExpanded}
              onImageClick={handleImageClick}
            />
            {isTruncated && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-amber-300">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="font-medium truncate">{i18nService.t('coworkOutputTruncatedNotice')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleContinueGenerating}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1 text-xs font-semibold text-amber-900 transition-colors dark:text-amber-200 dark:hover:bg-amber-400/20"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    <span>{i18nService.t('continueGenerating')}</span>
                  </button>
                </div>
              </div>
            )}
            {showCopyButton && (
              <div
                className={messageMetaClassName(metaVisible)}
                aria-hidden={!metaVisible}
                data-cowork-search-exclude="true"
              >
                {goalCompletionLabel && (
                  <span className="inline-flex items-center gap-1 text-secondary">
                    <GoalIcon className="h-3.5 w-3.5" />
                    <span>{goalCompletionLabel}</span>
                  </span>
                )}
                <span>{formatMessageDateTime(message.timestamp)}</span>
                {modelLabel && <span>{modelLabel}</span>}
                {onFork && (
                  <ForkButton
                    message={message}
                    visible={isHovered}
                    onFork={() => onFork(message.id)}
                  />
                )}
                <ReportSecondBrainButton
                  assistantContent={copyContent}
                  userMessage={userMessage}
                  sessionId={sessionId}
                  visible={isHovered}
                />
                <MessageCopyButton
                  content={copyContent}
                  onCopy={(result) => reportConversationMessageAction({
                    actionType: 'copy_message',
                    message,
                    params: {
                      result,
                      copySource: 'assistant_message',
                      copiedLength: copyContent.length,
                    },
                  })}
                  visible={isHovered}
                />
              </div>
            )}
          </div>
        ) : null}
        {proposedPlan.planText && (
          <div className={displayContent ? 'mt-4' : undefined}>
            <ProposedPlanBlock
              content={proposedPlan.planText}
              resolveLocalFilePath={resolveLocalFilePath}
              onImageClick={handleImageClick}
              showConfirmationActions={showPlanConfirmationActions}
              onConfirmExecution={showPlanConfirmationActions ? () => onConfirmPlan?.(message.id) : undefined}
              onAdjustPlan={showPlanConfirmationActions ? () => onAdjustPlan?.(message.id) : undefined}
              forceExpanded={forceSearchExpanded}
            />
          </div>
        )}
      </div>
      {showCopyButton && !displayContent && (
        <div
          className={messageMetaClassName(metaVisible)}
          aria-hidden={!metaVisible}
          data-cowork-search-exclude="true"
        >
          {goalCompletionLabel && (
            <span className="inline-flex items-center gap-1 text-secondary">
              <GoalIcon className="h-3.5 w-3.5" />
              <span>{goalCompletionLabel}</span>
            </span>
          )}
          <span>{formatMessageDateTime(message.timestamp)}</span>
          {modelLabel && <span>{modelLabel}</span>}
          {onFork && (
            <ForkButton
              message={message}
              visible={isHovered}
              onFork={() => onFork(message.id)}
            />
          )}
          <MessageCopyButton
            content={copyContent}
            onCopy={(result) => reportConversationMessageAction({
              actionType: 'copy_message',
              message,
              params: {
                result,
                copySource: 'assistant_message',
                copiedLength: copyContent.length,
              },
            })}
            visible={isHovered}
          />
        </div>
      )}
      <ImagePreviewModal image={expandedImage} onClose={() => setExpandedImage(null)} />
    </div>
  );
};

export default AssistantMessageItem;
