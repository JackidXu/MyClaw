import { ArrowUpIcon } from '@heroicons/react/24/solid';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { i18nService } from '../services/i18n';

export const NewUserOnboardingStep = {
  NewTask: 'new-task',
  PromptInput: 'prompt-input',
} as const;
export type NewUserOnboardingStep =
  typeof NewUserOnboardingStep[keyof typeof NewUserOnboardingStep];

const ONBOARDING_TARGET_SELECTOR_BY_STEP: Record<NewUserOnboardingStep, string> = {
  [NewUserOnboardingStep.NewTask]: '[data-onboarding-target="new-task"]',
  [NewUserOnboardingStep.PromptInput]: '[data-onboarding-target="home-prompt"]',
};
const SPOTLIGHT_PADDING = 2;
const SPOTLIGHT_RADIUS = 8;
const POPOVER_GAP = 28;
const POPOVER_WIDTH = 308;
const POPOVER_MARGIN = 16;
const POPOVER_ARROW_WIDTH = 14;
const POPOVER_ARROW_HALF_HEIGHT = 12;
const PROMPT_TEXTAREA_SELECTOR = '[data-onboarding-target="home-prompt-textarea"]';
const PROMPT_SEND_BUTTON_SELECTOR = '[data-onboarding-target="home-prompt-send"]';
const PROMPT_TEXTAREA_PADDING_LEFT = 16;
const PROMPT_TEXTAREA_PADDING_TOP = 12;
const SEND_EFFECT_SIZE = 48;
const TYPEWRITER_INTERVAL_MS = 90;
const PROMPT_RESULT_POPOVER_DELAY_MS = 1280;
const PROMPT_RESULT_POPOVER_DEFAULT_HEIGHT = 246;
const PROMPT_RESULT_POPOVER_MIN_HEIGHT = 226;
const PROMPT_RESULT_POPOVER_MIN_WIDTH = 560;
const PROMPT_RESULT_POPOVER_MAX_WIDTH = 720;
const PROMPT_RESULT_POPOVER_GAP = 24;
const PROMPT_RESULT_POPOVER_ARROW_WIDTH = 36;
const PROMPT_RESULT_POPOVER_ARROW_HEIGHT = 20;
const PROMPT_LOADING_STEP_DURATION_MS = 1500;
const PROMPT_LOADING_RESET_PAUSE_MS = 650;

const PROMPT_LOADING_MESSAGE_KEYS = [
  'newUserOnboardingPromptLoadingUnderstand',
  'newUserOnboardingPromptLoadingBreakdown',
  'newUserOnboardingPromptLoadingResult',
] as const;

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface NewUserOnboardingOverlayProps {
  step: NewUserOnboardingStep;
  onNext: () => void;
  onSkip: () => void;
  onStartExperience: () => void;
}

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), max)
);

const readElementRect = (selector: string): TargetRect | null => {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
};

const readTargetRect = (step: NewUserOnboardingStep): TargetRect | null => {
  const rect = readElementRect(ONBOARDING_TARGET_SELECTOR_BY_STEP[step]);
  if (!rect) return null;
  return {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
};

const NewUserOnboardingHeroAnimation: React.FC = () => (
  <div className="relative h-[116px] overflow-hidden rounded-lg bg-[#eef3ff]" aria-hidden="true">
    <style>
      {`
        @keyframes lobster-onboarding-create-frame {
          0%, 36% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          45%, 86% { opacity: 0; transform: translate(-50%, -8px) scale(0.96); }
          96%, 100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }

        @keyframes lobster-onboarding-result-frame {
          0%, 36% { opacity: 0; transform: translateY(10px) scale(0.92); filter: blur(1px); }
          48%, 84% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          94%, 100% { opacity: 0; transform: translateY(10px) scale(0.92); filter: blur(1px); }
        }

        @keyframes lobster-onboarding-cursor {
          0%, 32% { transform: translate3d(224px, 61px, 0) rotate(-12deg); }
          48%, 84% { transform: translate3d(248px, 68px, 0) rotate(-10deg); }
          96%, 100% { transform: translate3d(224px, 61px, 0) rotate(-12deg); }
        }

        @keyframes lobster-onboarding-card-doc {
          0%, 39% { transform: translate3d(67px, 44px, 0) rotate(-20deg) scale(0.94); }
          52%, 84% { transform: translate3d(57px, 37px, 0) rotate(-22deg) scale(1); }
          96%, 100% { transform: translate3d(67px, 44px, 0) rotate(-20deg) scale(0.94); }
        }

        @keyframes lobster-onboarding-card-image {
          0%, 39% { transform: translate3d(119px, 36px, 0) scale(0.94); }
          52%, 84% { transform: translate3d(116px, 24px, 0) scale(1); }
          96%, 100% { transform: translate3d(119px, 36px, 0) scale(0.94); }
        }

        @keyframes lobster-onboarding-card-pdf {
          0%, 39% { transform: translate3d(168px, 42px, 0) rotate(13deg) scale(0.94); }
          52%, 84% { transform: translate3d(174px, 34px, 0) rotate(15deg) scale(1); }
          96%, 100% { transform: translate3d(168px, 42px, 0) rotate(13deg) scale(0.94); }
        }

        .lobster-onboarding-create-frame {
          animation: lobster-onboarding-create-frame 4.8s ease-in-out infinite;
        }

        .lobster-onboarding-result-frame {
          animation: lobster-onboarding-result-frame 4.8s ease-in-out infinite;
        }

        .lobster-onboarding-cursor {
          animation: lobster-onboarding-cursor 4.8s ease-in-out infinite;
        }

        .lobster-onboarding-card-doc {
          animation: lobster-onboarding-card-doc 4.8s ease-in-out infinite;
        }

        .lobster-onboarding-card-image {
          animation: lobster-onboarding-card-image 4.8s ease-in-out infinite;
        }

        .lobster-onboarding-card-pdf {
          animation: lobster-onboarding-card-pdf 4.8s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .lobster-onboarding-create-frame {
            animation: none;
            opacity: 0;
          }

          .lobster-onboarding-result-frame,
          .lobster-onboarding-cursor,
          .lobster-onboarding-card-doc,
          .lobster-onboarding-card-image,
          .lobster-onboarding-card-pdf {
            animation: none;
          }

          .lobster-onboarding-result-frame {
            opacity: 1;
            transform: none;
            filter: none;
          }

          .lobster-onboarding-card-doc {
            transform: translate3d(57px, 37px, 0) rotate(-22deg) scale(1);
          }

          .lobster-onboarding-card-image {
            transform: translate3d(116px, 24px, 0) scale(1);
          }

          .lobster-onboarding-card-pdf {
            transform: translate3d(174px, 34px, 0) rotate(15deg) scale(1);
          }

          .lobster-onboarding-cursor {
            transform: translate3d(248px, 68px, 0) rotate(-10deg);
          }
        }
      `}
    </style>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.78),rgba(238,243,255,0)_58%)]" />
    <div className="lobster-onboarding-create-frame absolute left-1/2 top-[35px] flex h-8 w-[198px] items-center justify-center rounded-lg bg-white text-xs font-medium text-foreground shadow-[0_8px_22px_rgba(35,56,109,0.12)]">
      {i18nService.t('newChat')}
    </div>
    <div className="lobster-onboarding-result-frame absolute inset-0">
      <div className="lobster-onboarding-card-doc absolute h-[62px] w-[54px] rounded-lg border border-white/90 bg-white/90 shadow-[0_10px_24px_rgba(53,83,139,0.14)]">
        <div className="absolute left-[-9px] top-3 rounded bg-[#6f9cf7] px-1.5 py-0.5 text-[13px] font-semibold leading-4 text-white shadow-sm">
          DOC
        </div>
        <div className="absolute left-5 top-8 h-1.5 w-6 rounded-full bg-[#9dbdf8]" />
        <div className="absolute left-5 top-[44px] h-1.5 w-4 rounded-full bg-[#c1d3fb]" />
      </div>
      <div className="lobster-onboarding-card-image absolute h-[66px] w-[64px] rounded-lg border-[3px] border-white bg-[#dfeaff] shadow-[0_11px_26px_rgba(53,83,139,0.17)]">
        <div className="absolute left-4 top-4 h-3.5 w-3.5 rounded-full bg-[#ffdf69]" />
        <div className="absolute bottom-2.5 left-2.5 h-8 w-10 rounded-[9px] bg-[#b7d5f4]" />
        <div className="absolute bottom-2.5 right-1.5 h-10 w-9 rounded-[10px] bg-[#c7ddf8]" />
      </div>
      <div className="lobster-onboarding-card-pdf absolute h-[68px] w-[65px] rounded-lg border border-white/90 bg-white/95 shadow-[0_11px_26px_rgba(53,83,139,0.16)]">
        <div className="absolute left-2.5 top-[-8px] rounded bg-[#ff7e9f] px-2 py-0.5 text-[15px] font-semibold leading-5 text-white shadow-sm">
          PDF
        </div>
        <div className="absolute left-4 top-9 h-9 w-9 rounded-full bg-[#e1dddf]" />
        <div className="absolute left-[35px] top-9 h-[18px] w-[19px] rounded-bl-[8px] bg-white/80" />
      </div>
    </div>
    <div className="lobster-onboarding-cursor absolute left-0 top-0 h-0 w-0 border-b-[18px] border-l-[8px] border-r-[8px] border-b-black border-l-transparent border-r-transparent drop-shadow-[0_5px_5px_rgba(0,0,0,0.25)]" />
  </div>
);

const TypewriterPromptPreview: React.FC<{
  rect: TargetRect;
  textareaRect: TargetRect | null;
  sendButtonRect: TargetRect | null;
  showSendEffect: boolean;
  onTypingComplete: () => void;
}> = ({
  rect,
  textareaRect,
  sendButtonRect,
  showSendEffect,
  onTypingComplete,
}) => {
  const promptExample = i18nService.t('newUserOnboardingPromptExample');
  const promptCharacters = Array.from(promptExample);
  const [visibleCharacterCount, setVisibleCharacterCount] = useState(0);
  const textRect = textareaRect ?? {
    top: rect.top + 12,
    left: rect.left + 12,
    width: rect.width - 24,
    height: 72,
  };
  const textBandWidth = Math.max(
    0,
    textRect.width - PROMPT_TEXTAREA_PADDING_LEFT * 2,
  );
  const visiblePrompt = promptCharacters.slice(0, visibleCharacterCount).join('');

  useEffect(() => {
    setVisibleCharacterCount(0);
    if (promptCharacters.length === 0) return undefined;

    let nextCharacterCount = 0;
    const intervalId = window.setInterval(() => {
      nextCharacterCount += 1;
      setVisibleCharacterCount(nextCharacterCount);
      if (nextCharacterCount >= promptCharacters.length) {
        window.clearInterval(intervalId);
        onTypingComplete();
      }
    }, TYPEWRITER_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [onTypingComplete, promptExample, promptCharacters.length]);

  const sendRect = sendButtonRect ?? {
    top: rect.top + rect.height - 44,
    left: rect.left + rect.width - 48,
    width: 32,
    height: 32,
  };
  const isTypingStarted = visibleCharacterCount > 0;
  const sendIconSize = sendRect.width <= 28 ? 16 : 18;
  const sendCenterX = sendRect.left + sendRect.width / 2;
  const sendCenterY = sendRect.top + sendRect.height / 2;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <style>
        {`
        @keyframes lobster-onboarding-caret {
          0%, 48% { opacity: 1; }
          49%, 100% { opacity: 0; }
        }

        @keyframes lobster-onboarding-send-pulse {
          0% { opacity: 0; transform: scale(0.58); }
          24% { opacity: 0.95; transform: scale(0.84); }
          62% { opacity: 0.5; transform: scale(1.22); }
          100% { opacity: 0; transform: scale(1.55); }
        }

        @keyframes lobster-onboarding-send-flash {
          0%, 38% { opacity: 0; transform: scale(0.88); }
          48% { opacity: 0.28; transform: scale(1); }
          68%, 100% { opacity: 0; transform: scale(1.2); }
        }

        @keyframes lobster-onboarding-send-cursor {
          0% { opacity: 0; transform: translate3d(46px, 34px, 0) scale(1); }
          30% { opacity: 1; transform: translate3d(2px, 2px, 0) scale(1); }
          46% { opacity: 1; transform: translate3d(2px, 2px, 0) scale(0.78); }
          64%, 100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes lobster-onboarding-send-press {
          0%, 38% { transform: scale(1); box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
          48% { transform: scale(0.9); box-shadow: 0 0 0 5px rgba(255,255,255,0.72), 0 8px 18px rgba(0,0,0,0.24); }
          66%, 100% { transform: scale(1); box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
        }

        @keyframes lobster-onboarding-send-active {
          0% { opacity: 0; transform: scale(0.82); }
          100% { opacity: 1; transform: scale(1); }
        }

        .lobster-onboarding-caret {
          animation: lobster-onboarding-caret 0.8s step-end infinite;
        }

        .lobster-onboarding-send-pulse {
          animation: lobster-onboarding-send-pulse 1.18s ease-out 0.28s both;
        }

        .lobster-onboarding-send-pulse-delayed {
          animation-delay: 0.46s;
        }

        .lobster-onboarding-send-flash {
          animation: lobster-onboarding-send-flash 1.18s ease-out both;
        }

        .lobster-onboarding-send-cursor {
          animation: lobster-onboarding-send-cursor 1.18s cubic-bezier(0.2, 0.85, 0.22, 1) both;
        }

        .lobster-onboarding-send-active {
          animation: lobster-onboarding-send-active 0.18s ease-out both;
        }

        .lobster-onboarding-send-press {
          animation: lobster-onboarding-send-press 1.18s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .lobster-onboarding-caret,
          .lobster-onboarding-send-pulse,
          .lobster-onboarding-send-flash,
          .lobster-onboarding-send-cursor,
          .lobster-onboarding-send-active,
          .lobster-onboarding-send-press {
            animation: none;
          }

          .lobster-onboarding-caret {
            opacity: 0;
          }
        }
      `}
      </style>
      <div
        className="absolute bg-surface"
        style={{
          top: textRect.top,
          left: textRect.left,
          width: textRect.width,
          height: textRect.height,
        }}
      />
      <div
        className="absolute flex items-center text-sm font-normal leading-[var(--lobster-leading-prompt)] text-foreground"
        style={{
          top: textRect.top + PROMPT_TEXTAREA_PADDING_TOP,
          left: textRect.left + PROMPT_TEXTAREA_PADDING_LEFT,
          width: textBandWidth,
        }}
      >
        <span className="inline-block max-w-full overflow-hidden whitespace-nowrap">
          {visiblePrompt}
        </span>
        <span className="lobster-onboarding-caret ml-1 h-5 w-px bg-foreground" />
      </div>
      {isTypingStarted && (
        <div
          className={`lobster-onboarding-send-active absolute z-10 flex items-center justify-center rounded-full bg-neutral-950 text-white shadow-subtle dark:bg-white dark:text-neutral-950 ${showSendEffect ? 'lobster-onboarding-send-press' : ''}`}
          style={{
            top: sendRect.top,
            left: sendRect.left,
            width: sendRect.width,
            height: sendRect.height,
          }}
        >
          <ArrowUpIcon
            aria-hidden="true"
            style={{
              width: sendIconSize,
              height: sendIconSize,
            }}
          />
        </div>
      )}
      <div
        className="absolute z-20"
        style={{
          top: sendCenterY - SEND_EFFECT_SIZE / 2,
          left: sendCenterX - SEND_EFFECT_SIZE / 2,
          width: SEND_EFFECT_SIZE,
          height: SEND_EFFECT_SIZE,
        }}
      >
        {showSendEffect && (
          <>
            <div className="lobster-onboarding-send-flash absolute inset-2 rounded-full bg-neutral-950" />
            <div className="lobster-onboarding-send-pulse absolute inset-0 rounded-full border-2 border-white/95 bg-white/25 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" />
            <div className="lobster-onboarding-send-pulse lobster-onboarding-send-pulse-delayed absolute inset-0 rounded-full border border-white/80 bg-white/15" />
          </>
        )}
      </div>
      {showSendEffect && (
        <svg
          className="lobster-onboarding-send-cursor absolute z-30 h-8 w-8 text-neutral-950 drop-shadow-[0_6px_7px_rgba(0,0,0,0.3)]"
          viewBox="0 0 24 24"
          fill="none"
          style={{
            top: sendCenterY - 3,
            left: sendCenterX - 3,
          }}
        >
          <path
            d="M5.1 3.8 18.6 16a1 1 0 0 1-.75 1.73l-5.02-.4-2.68 4.23a1 1 0 0 1-1.82-.35L5.1 3.8Z"
            fill="currentColor"
            stroke="white"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
};

const PromptLoadingSequence: React.FC = () => {
  const [visibleItemCount, setVisibleItemCount] = useState(1);
  const [cycleIndex, setCycleIndex] = useState(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (visibleItemCount < PROMPT_LOADING_MESSAGE_KEYS.length) {
        setVisibleItemCount((current) => current + 1);
        return;
      }

      setVisibleItemCount(1);
      setCycleIndex((current) => current + 1);
    }, visibleItemCount < PROMPT_LOADING_MESSAGE_KEYS.length
      ? PROMPT_LOADING_STEP_DURATION_MS
      : PROMPT_LOADING_STEP_DURATION_MS + PROMPT_LOADING_RESET_PAUSE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [visibleItemCount]);

  return (
    <div className="mt-5 h-[110px]" aria-hidden="true">
      <style>
        {`
          @keyframes lobster-onboarding-loading-row {
            0% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }

          @keyframes lobster-onboarding-loading-progress {
            0% { transform: scaleX(0); }
            100% { transform: scaleX(1); }
          }

          @keyframes lobster-onboarding-loading-dot {
            0%, 100% { transform: scale(0.82); opacity: 0.55; }
            45% { transform: scale(1); opacity: 1; }
          }

          .lobster-onboarding-loading-row {
            animation: lobster-onboarding-loading-row 0.22s ease-out both;
          }

          .lobster-onboarding-loading-progress {
            animation: lobster-onboarding-loading-progress ${PROMPT_LOADING_STEP_DURATION_MS}ms linear both;
            transform-origin: left center;
          }

          .lobster-onboarding-loading-dot {
            animation: lobster-onboarding-loading-dot 0.9s ease-in-out infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .lobster-onboarding-loading-row,
            .lobster-onboarding-loading-progress,
            .lobster-onboarding-loading-dot {
              animation: none;
            }

            .lobster-onboarding-loading-progress {
              transform: scaleX(1);
            }
          }
        `}
      </style>
      <div className="space-y-4">
        {PROMPT_LOADING_MESSAGE_KEYS.slice(0, visibleItemCount).map((messageKey, index) => {
          const isActive = index === visibleItemCount - 1;
          const progressKey = `${cycleIndex}-${messageKey}-${isActive ? 'active' : 'done'}`;

          return (
            <div key={`${cycleIndex}-${messageKey}`} className="lobster-onboarding-loading-row flex items-start gap-2">
              <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-neutral-100">
                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'lobster-onboarding-loading-dot bg-neutral-400' : 'bg-neutral-300'}`} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] leading-[18px] text-neutral-500">
                  {i18nService.t(messageKey)}
                </span>
                <span className="mt-1 block h-1 w-[136px] overflow-hidden rounded-full bg-neutral-100">
                  <span
                    key={progressKey}
                    className={`block h-full rounded-full bg-neutral-300 ${isActive ? 'lobster-onboarding-loading-progress' : ''}`}
                    style={{ width: '100%' }}
                  />
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PromptResultPopover: React.FC<{
  rect: TargetRect;
  viewportWidth: number;
  viewportHeight: number;
  onSkip: () => void;
  onStartExperience: () => void;
}> = ({ rect, viewportWidth, viewportHeight, onSkip, onStartExperience }) => {
  const desiredPopoverWidth = Math.min(
    Math.max(rect.width * 0.72, PROMPT_RESULT_POPOVER_MIN_WIDTH),
    PROMPT_RESULT_POPOVER_MAX_WIDTH,
  );
  const popoverWidth = clamp(
    desiredPopoverWidth,
    Math.min(PROMPT_RESULT_POPOVER_MIN_WIDTH, viewportWidth - POPOVER_MARGIN * 2),
    Math.min(PROMPT_RESULT_POPOVER_MAX_WIDTH, viewportWidth - POPOVER_MARGIN * 2),
  );
  const popoverLeft = clamp(
    rect.left + (rect.width - popoverWidth) / 2,
    POPOVER_MARGIN,
    Math.max(POPOVER_MARGIN, viewportWidth - popoverWidth - POPOVER_MARGIN),
  );
  const preferredPopoverTop = rect.top + rect.height + PROMPT_RESULT_POPOVER_GAP;
  const popoverTop = Math.min(
    preferredPopoverTop,
    Math.max(POPOVER_MARGIN, viewportHeight - PROMPT_RESULT_POPOVER_MIN_HEIGHT - POPOVER_MARGIN),
  );
  const availablePopoverHeight = Math.max(
    PROMPT_RESULT_POPOVER_MIN_HEIGHT,
    viewportHeight - popoverTop - POPOVER_MARGIN,
  );
  const popoverHeight = clamp(
    availablePopoverHeight,
    PROMPT_RESULT_POPOVER_MIN_HEIGHT,
    PROMPT_RESULT_POPOVER_DEFAULT_HEIGHT,
  );
  const arrowLeft = clamp(
    rect.left + rect.width * 0.32 - popoverLeft - PROMPT_RESULT_POPOVER_ARROW_WIDTH / 2,
    28,
    popoverWidth - PROMPT_RESULT_POPOVER_ARROW_WIDTH - 28,
  );
  const useCompactActionLayout = popoverWidth < 560;

  return (
    <section
      className="lobster-onboarding-result-popover absolute rounded-[22px] bg-white p-6 text-neutral-950 shadow-[0_18px_52px_rgba(0,0,0,0.18)]"
      style={{
        top: popoverTop,
        left: popoverLeft,
        width: popoverWidth,
        height: popoverHeight,
      }}
    >
      <style>
        {`
        @keyframes lobster-onboarding-result-popover {
          0% { opacity: 0; transform: translateY(10px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        .lobster-onboarding-result-popover {
          animation: lobster-onboarding-result-popover 0.22s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .lobster-onboarding-result-popover {
            animation: none;
          }
        }
      `}
      </style>
      <div
        className="absolute h-0 w-0 border-x-[18px] border-b-[20px] border-x-transparent border-b-white"
        style={{
          top: -PROMPT_RESULT_POPOVER_ARROW_HEIGHT + 1,
          left: arrowLeft,
        }}
      />
      <div
        className={
          useCompactActionLayout
            ? 'relative flex h-full flex-col gap-3'
            : 'relative grid h-full grid-cols-[minmax(0,1fr)_172px] gap-6'
        }
      >
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold leading-7 text-neutral-950">
            {i18nService.t('newUserOnboardingPromptResultTitle')}
          </h2>
          <p className="mt-1.5 text-base leading-6 text-neutral-500">
            {i18nService.t('newUserOnboardingPromptResultDescription')}
          </p>
          <PromptLoadingSequence />
        </div>
        <div className={`flex items-end justify-end gap-7 ${useCompactActionLayout ? 'mt-auto' : 'h-full pb-3'}`}>
          <button
            type="button"
            onClick={onSkip}
            className="flex h-10 items-center whitespace-nowrap rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-raised/40 hover:text-secondary"
          >
            {i18nService.t('newUserOnboardingSkip')}
          </button>
          <div className="relative">
            <div className="pointer-events-none absolute inset-x-2 bottom-0 h-4 translate-y-1/2 rounded-full bg-[linear-gradient(90deg,#14f195,#7c3aed,#ff4fd8)] opacity-65 blur-md" />
            <button
              type="button"
              onClick={onStartExperience}
              className="relative whitespace-nowrap rounded-xl bg-neutral-950 px-6 py-2.5 text-[15px] font-medium leading-5 text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {i18nService.t('newUserOnboardingStartExperience')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

const NewUserOnboardingOverlay: React.FC<NewUserOnboardingOverlayProps> = ({
  step,
  onNext,
  onSkip,
  onStartExperience,
}) => {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [promptTextareaRect, setPromptTextareaRect] = useState<TargetRect | null>(null);
  const [promptSendButtonRect, setPromptSendButtonRect] = useState<TargetRect | null>(null);
  const [isPromptTypingComplete, setIsPromptTypingComplete] = useState(false);
  const [isPromptResultPopoverVisible, setIsPromptResultPopoverVisible] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const promptResultTimerRef = useRef<number | null>(null);

  const updateTargetRect = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      setTargetRect(readTargetRect(step));
      setPromptTextareaRect(
        step === NewUserOnboardingStep.PromptInput
          ? readElementRect(PROMPT_TEXTAREA_SELECTOR)
          : null,
      );
      setPromptSendButtonRect(
        step === NewUserOnboardingStep.PromptInput
          ? readElementRect(PROMPT_SEND_BUTTON_SELECTOR)
          : null,
      );
    });
  }, [step]);

  const handlePromptTypingComplete = useCallback(() => {
    setIsPromptTypingComplete(true);
    if (promptResultTimerRef.current !== null) {
      window.clearTimeout(promptResultTimerRef.current);
    }
    promptResultTimerRef.current = window.setTimeout(() => {
      setIsPromptResultPopoverVisible(true);
      promptResultTimerRef.current = null;
    }, PROMPT_RESULT_POPOVER_DELAY_MS);
  }, []);

  useLayoutEffect(() => {
    setIsPromptTypingComplete(false);
    setIsPromptResultPopoverVisible(false);
    if (promptResultTimerRef.current !== null) {
      window.clearTimeout(promptResultTimerRef.current);
      promptResultTimerRef.current = null;
    }
    updateTargetRect();
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);

    const target = document.querySelector<HTMLElement>(ONBOARDING_TARGET_SELECTOR_BY_STEP[step]);
    const promptTextarea = step === NewUserOnboardingStep.PromptInput
      ? document.querySelector<HTMLElement>(PROMPT_TEXTAREA_SELECTOR)
      : null;
    const promptSendButton = step === NewUserOnboardingStep.PromptInput
      ? document.querySelector<HTMLElement>(PROMPT_SEND_BUTTON_SELECTOR)
      : null;
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateTargetRect);
    if (target && resizeObserver) {
      resizeObserver.observe(target);
    }
    if (promptTextarea && resizeObserver) {
      resizeObserver.observe(promptTextarea);
    }
    if (promptSendButton && resizeObserver) {
      resizeObserver.observe(promptSendButton);
    }

    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
      resizeObserver?.disconnect();
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      if (promptResultTimerRef.current !== null) {
        window.clearTimeout(promptResultTimerRef.current);
        promptResultTimerRef.current = null;
      }
    };
  }, [step, updateTargetRect]);

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const rect = targetRect ?? {
    top: step === NewUserOnboardingStep.NewTask ? 50 : 268,
    left: step === NewUserOnboardingStep.NewTask ? 4 : 380,
    width: step === NewUserOnboardingStep.NewTask ? 264 : 900,
    height: step === NewUserOnboardingStep.NewTask ? 44 : 140,
  };
  const popoverLeft = clamp(
    rect.left + rect.width + POPOVER_GAP,
    POPOVER_MARGIN,
    Math.max(POPOVER_MARGIN, viewportWidth - POPOVER_WIDTH - POPOVER_MARGIN),
  );
  const popoverTop = clamp(
    rect.top - 3,
    POPOVER_MARGIN,
    Math.max(POPOVER_MARGIN, viewportHeight - 292 - POPOVER_MARGIN),
  );
  const arrowCenterTop = rect.top + rect.height / 2 - popoverTop;
  const arrowTop = clamp(
    arrowCenterTop - POPOVER_ARROW_HALF_HEIGHT,
    10,
    258,
  );

  return (
    <div
      className="non-draggable fixed inset-0 z-[10040] cursor-default"
      role="dialog"
      aria-modal="true"
      aria-label={i18nService.t('newUserOnboardingAriaLabel')}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          borderRadius: SPOTLIGHT_RADIUS,
          boxShadow:
            '0 0 0 9999px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.72)',
        }}
      />
      {step === NewUserOnboardingStep.PromptInput && (
        <TypewriterPromptPreview
          rect={rect}
          textareaRect={promptTextareaRect}
          sendButtonRect={promptSendButtonRect}
          showSendEffect={isPromptTypingComplete}
          onTypingComplete={handlePromptTypingComplete}
        />
      )}
      {step === NewUserOnboardingStep.PromptInput && isPromptResultPopoverVisible && (
        <PromptResultPopover
          rect={rect}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          onSkip={onSkip}
          onStartExperience={onStartExperience}
        />
      )}
      {step === NewUserOnboardingStep.NewTask && (
        <section
          className="absolute w-[308px] rounded-xl bg-background p-3 shadow-[0_18px_55px_rgba(0,0,0,0.24)]"
          style={{ top: popoverTop, left: popoverLeft }}
        >
          <div
            className="absolute h-0 w-0 border-y-[12px] border-r-[14px] border-y-transparent border-r-background"
            style={{
              top: arrowTop,
              left: -POPOVER_ARROW_WIDTH,
            }}
          />
          <NewUserOnboardingHeroAnimation />
          <div className="px-0.5 pt-4">
            <h2 className="text-lg font-semibold leading-6 text-foreground">
              {i18nService.t('newUserOnboardingNewTaskTitle')}
            </h2>
            <p className="mt-2 text-sm leading-5 text-secondary">
              {i18nService.t('newUserOnboardingNewTaskDescription')}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={onSkip}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-raised/40 hover:text-secondary"
              >
                {i18nService.t('newUserOnboardingSkip')}
              </button>
              <button
                type="button"
                onClick={onNext}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-sm transition-colors hover:opacity-90"
              >
                {i18nService.t('newUserOnboardingNext')}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default NewUserOnboardingOverlay;
