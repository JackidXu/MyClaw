/**
 * 录音卡三栏工作台 - 中栏：说话人逐字稿与浏览器播放
 *
 * 严格完全参照原型 HTML/CSS (.rcw-tx, .rcw-th, .rct-h, .rct-scroll, .rct-line, .rct-bar)
 */

import React from 'react';

import type { LocalRecordingItem } from '../../../../shared/recordingCard/localRecording';
import { LocalRecordingStatus } from '../../../../shared/recordingCard/localRecording';
import { i18nService } from '../../../services/i18n';

interface RecordingTranscriptColumnProps {
  item: LocalRecordingItem | null;
  isTranscribing: boolean;
  transcribeProgressText?: string;
  onTranscribe: () => void;
  onPlayAudio: () => void;
  onCopyTranscript: () => void;
  onExportTranscript: () => void;
}

export const RecordingTranscriptColumn: React.FC<RecordingTranscriptColumnProps> = ({
  item,
  isTranscribing,
  transcribeProgressText,
  onTranscribe,
  onPlayAudio,
  onCopyTranscript,
  onExportTranscript,
}) => {
  if (!item) {
    return (
      <div className="flex-[1.25] flex flex-col items-center justify-center border-r border-[#ebebee] bg-white p-8 text-center select-none">
        <div className="w-12 h-12 rounded-[14px] bg-[#f4f4f6] text-[#8b8b90] flex items-center justify-center mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <path d="M12 19v3" />
          </svg>
        </div>
        <b className="text-[14px] font-semibold text-[#1c1c1e]">{i18nService.t('recordingCardTranscriptEmptyTitle')}</b>
        <p className="text-[12px] text-[#8b8b90] mt-1">{i18nService.t('recordingCardTranscriptEmptyDesc')}</p>
      </div>
    );
  }

  const utterances = item.utterances || [];
  const sentenceCount = utterances.length;

  const formatSec = (sec?: number) => {
    if (!sec || sec <= 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatMs = (ms?: number) => {
    if (!ms || ms <= 0) return '00:00';
    return formatSec(Math.floor(ms / 1000));
  };

  return (
    <div className="flex-[1.25] min-w-0 flex flex-col border-r border-[#ebebee] bg-white min-h-0 select-text">
      {/* 头部信息 (.rcw-th) */}
      <div className="flex items-center gap-2.5 p-[12px_16px] border-b border-[#ebebee] shrink-0">
        <div className="w-8 h-8 rounded-[9px] bg-[#fff4ee] border border-[#f3c8ab] text-[#e2531f] flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <path d="M12 19v3" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <b className="block text-[14.5px] font-semibold text-[#1c1c1e] truncate tracking-tight">
            {item.title || item.name}
          </b>
          <div className="text-[11px] text-[#8b8b90] mt-0.5 truncate">
            {item.duration || '00:00'} · {i18nService.t('recordingCardTranscriptAudioFileSuffix')} · {item.transcriptText ? i18nService.t('recordingCardTranscriptCompleteStatus') : i18nService.t('recordingCardTranscriptPendingStatus')}
          </div>
        </div>

        <button
          type="button"
          onClick={onPlayAudio}
          className="text-[11.5px] text-[#505055] border border-[#ebebee] bg-white rounded-[7px] px-3 py-1 hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors cursor-pointer shrink-0"
        >
          {i18nService.t('recordingCardTranscriptOpenAudioBtn')}
        </button>
      </div>

      {/* 逐字稿标题栏 (.rct-h) */}
      <div className="flex items-center gap-2 p-[10px_16px] border-b border-[#ebebee] shrink-0">
        <span className="text-[13.5px] font-semibold text-[#1c1c1e]">{i18nService.t('recordingCardTranscriptTitle')}</span>
        {sentenceCount > 0 && (
          <span className="text-[11.5px] text-[#8b8b90]">{i18nService.t('recordingCardTranscriptSentenceCount', { count: sentenceCount })}</span>
        )}
        <span className="flex-1" />

        {item.transcriptText && (
          <>
            <button
              type="button"
              onClick={onCopyTranscript}
              className="text-[11.5px] text-[#505055] border border-[#ebebee] bg-white rounded-[7px] px-2.5 py-1 hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors cursor-pointer"
            >
              {i18nService.t('copy')}
            </button>
            <button
              type="button"
              onClick={onExportTranscript}
              className="text-[11.5px] text-[#505055] border border-[#ebebee] bg-white rounded-[7px] px-2.5 py-1 hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors cursor-pointer"
            >
              {i18nService.t('export')}
            </button>
          </>
        )}
      </div>

      {/* 逐字稿内容区 (.rct-scroll) */}
      <div className="flex-1 overflow-y-auto p-[16px_18px_8px] min-h-0 [scrollbar-gutter:stable]">
        {isTranscribing ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#8b8b90]">
            <div className="w-9 h-9 rounded-full border-2 border-[#f3c8ab] border-t-[#FF6B35] animate-spin mb-3" />
            <b className="text-[13.5px] text-[#1c1c1e]">{i18nService.t('recordingCardTranscriptTranscribingTitle')}</b>
            <p className="text-[12px] mt-1 text-[#e2531f]">{transcribeProgressText || i18nService.t('recordingCardTranscriptTranscribingWait')}</p>
          </div>
        ) : item.status === LocalRecordingStatus.Failed ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#8b8b90]">
            <div className="w-11 h-11 rounded-full bg-[#fef2f2] text-[#ef4444] border border-[#fecaca] flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <b className="text-[13.5px] font-semibold text-[#1c1c1e] mb-1">{i18nService.t('recordingCardTranscriptFailTitle')}</b>
            <p className="text-[12px] text-[#ef4444] bg-[#fef2f2] border border-[#fecaca] rounded-[6px] px-3 py-1.5 max-w-[360px] break-all mb-4 select-text font-mono">
              {item.transcribeError || i18nService.t('recordingCardTranscriptFailDefault')}
            </p>
            <button
              type="button"
              onClick={onTranscribe}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white bg-[#FF6B35] rounded-[8px] px-4 py-2 hover:bg-[#e2531f] active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              {i18nService.t('recordingCardTranscriptResubmitBtn')}
            </button>
          </div>
        ) : !item.transcriptText ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#8b8b90]">
            <p className="text-[13px] mb-3">{i18nService.t('recordingCardTranscriptPendingNotice')}</p>
            <button
              type="button"
              onClick={onTranscribe}
              className="text-[12.5px] font-medium text-white bg-[#FF6B35] rounded-[8px] px-4 py-2 hover:bg-[#e2531f] transition-colors cursor-pointer shadow-xs"
            >
              {i18nService.t('recordingCardTranscriptStartBtn')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {utterances.length > 0 ? (
              utterances.map((utt, idx) => (
                <div key={idx} className="flex gap-2.5 text-[13px]">
                  {/* 发言人头像点 (.rct-dot) */}
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B35] mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <b className="text-[12.5px] font-semibold text-[#e2531f]">
                        {utt.speaker || i18nService.t('recordingCardTranscriptSpeakerDefault', { index: idx + 1 })}
                      </b>
                      <span className="text-[11.5px] text-[#aeaeae] tabular-nums">
                        {formatMs(utt.startTime)}
                      </span>
                    </div>
                    <div className="text-[13px] leading-[1.82] text-[#1c1c1e] whitespace-pre-wrap">
                      {utt.text}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[13px] leading-[1.82] text-[#1c1c1e] whitespace-pre-wrap">
                {item.transcriptText}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
