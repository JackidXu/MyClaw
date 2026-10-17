/**
 * 录音卡三栏工作台 - 右栏：AI 纪要与协同
 *
 * 严格完全参照原型 HTML/CSS (.rcw-sum, .rcs-h, .rcs-scroll, .rcs-card, .rcw-sf)
 */

import React, { useEffect, useState } from 'react';

import type {
  LocalRecordingItem,
  RecordingExtractedItem,
} from '../../../../shared/recordingCard/localRecording';
import { LocalRecordingStatus } from '../../../../shared/recordingCard/localRecording';
import { vipService } from '../../../services/vipService';

interface RecordingSummaryColumnProps {
  item: LocalRecordingItem | null;
  isSummarizing: boolean;
  isTranscribing?: boolean;
  onRegenerateSummary: () => void;
  onSyncToSecondBrain: () => void;
  onSendToChat: () => void;
  onCopySummary: () => void;
  onExportMarkdown: () => void;
  onSaveEditedSummary?: (editedSummary: string) => void;
}

export const RecordingSummaryColumn: React.FC<RecordingSummaryColumnProps> = ({
  item,
  isSummarizing,
  isTranscribing = false,
  onRegenerateSummary,
  onSyncToSecondBrain,
  onSendToChat,
  onCopySummary,
  onExportMarkdown,
  onSaveEditedSummary,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [hasSecondBrain, setHasSecondBrain] = useState<boolean>(() =>
    vipService.hasSecondBrainPermission(),
  );

  useEffect(() => {
    return vipService.subscribe(() => {
      setHasSecondBrain(vipService.hasSecondBrainPermission());
    });
  }, []);

  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white p-8 text-center select-none">
        <div className="w-12 h-12 rounded-[14px] bg-[#fff4ee] text-[#FF6B35] flex items-center justify-center mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          </svg>
        </div>
        <b className="text-[14px] font-semibold text-[#1c1c1e]">AI 智能总结</b>
        <p className="text-[12px] text-[#8b8b90] mt-1">转写完成后，将自动提炼会议纪要与决策点</p>
      </div>
    );
  }

  const handleStartEdit = () => {
    setEditText(item.summary || '');
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onSaveEditedSummary?.(editText);
    setIsEditing(false);
  };

  const extractedItems: RecordingExtractedItem[] = item.items || [];
  const isBusy = isSummarizing || isTranscribing;
  const isSynced = item.status === LocalRecordingStatus.Synced;

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white min-h-0 select-text">
      {/* 头部 (.rcs-h) */}
      <div className="flex items-center gap-2 p-[12px_16px] border-b border-[#ebebee] shrink-0">
        <div className="w-5 h-5 rounded-[6px] bg-[#fff4ee] text-[#FF6B35] flex items-center justify-center shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          </svg>
        </div>
        <span className="text-[13.5px] font-semibold text-[#1c1c1e]">AI 总结</span>
        <span className="flex-1" />

        {item.summary && !isEditing && !isBusy && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onRegenerateSummary}
              className="text-[11.5px] text-[#505055] border border-[#ebebee] bg-white rounded-[7px] px-2.5 py-1 hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors cursor-pointer"
            >
              重新总结
            </button>
            <button
              type="button"
              onClick={handleStartEdit}
              className="text-[11.5px] text-[#505055] border border-[#ebebee] bg-white rounded-[7px] px-2.5 py-1 hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors cursor-pointer"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={onCopySummary}
              className="text-[11.5px] text-[#505055] border border-[#ebebee] bg-white rounded-[7px] px-2.5 py-1 hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors cursor-pointer"
            >
              复制
            </button>
            <button
              type="button"
              onClick={onExportMarkdown}
              className="text-[11.5px] text-[#505055] border border-[#ebebee] bg-white rounded-[7px] px-2.5 py-1 hover:border-[#c6c6cc] hover:text-[#1c1c1e] transition-colors cursor-pointer"
            >
              导出
            </button>
          </div>
        )}
      </div>

      {/* 内容区域 (.rcs-scroll) */}
      <div className="flex-1 overflow-y-auto p-[14px_16px] min-h-0 [scrollbar-gutter:stable]">
        {isSummarizing ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#8b8b90]">
            <div className="w-9 h-9 rounded-full border-2 border-[#f3c8ab] border-t-[#FF6B35] animate-spin mb-3" />
            <b className="text-[13.5px] text-[#1c1c1e]">正在提炼商业纪要与决策点...</b>
            <p className="text-[12px] mt-1 text-[#e2531f]">智能总结中，请稍候</p>
          </div>
        ) : !item.summary ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#8b8b90]">
            <p className="text-[12.5px] mb-3">逐字稿转写完成后，可一键提炼商业纪要与决策点</p>
            {item.transcriptText && !isTranscribing && (
              <button
                type="button"
                onClick={onRegenerateSummary}
                className="text-[12px] font-medium text-white bg-[#FF6B35] rounded-[8px] px-3.5 py-1.5 hover:bg-[#e2531f] transition-colors cursor-pointer shadow-xs"
              >
                提炼 AI 纪要
              </button>
            )}
          </div>
        ) : isEditing ? (
          <div className="flex flex-col h-full gap-3">
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="flex-1 w-full p-3 text-[13px] leading-[1.8] border border-[#f3c8ab] rounded-[10px] outline-none resize-none font-sans"
              placeholder="编辑纪要正文..."
            />
            <div className="flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-[12px] px-3 py-1.5 rounded-[8px] border border-[#ebebee] hover:border-[#c6c6cc]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="text-[12px] font-medium text-white bg-[#FF6B35] px-4 py-1.5 rounded-[8px] hover:bg-[#e2531f]"
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* 会议纪要区块：标题在外，白底卡片在内，原生直接渲染 */}
            <div>
              <span className="block text-[11px] font-medium text-[#8b8b90] uppercase tracking-wider mb-2 px-1">
                会议纪要
              </span>
              <div className="bg-white border border-[#ebebee] rounded-[12px] p-[18px_20px] shadow-[0_1px_3px_rgba(28,28,30,0.02)]">
                <h3 className="text-[16px] font-semibold text-[#1c1c1e] tracking-tight mb-3">
                  {item.title || item.name}
                </h3>
                <div className="text-[13px] leading-[1.85] text-[#505055] whitespace-pre-wrap">
                  {item.summary}
                </div>
              </div>
            </div>

            {/* 决策规则与认知点区块：标题在外，重构卡片布局 */}
            {extractedItems.length > 0 && (
              <div>
                <span className="block text-[11px] font-medium text-[#8b8b90] uppercase tracking-wider mb-2 px-1">
                  提炼的决策规则与认知点
                </span>
                <div className="space-y-3">
                  {extractedItems.map((pt, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-[12px] border border-[#ebebee] bg-white hover:border-[#f3c8ab] shadow-[0_1px_2px_rgba(28,28,30,0.02)] transition-all flex flex-col gap-2.5"
                    >
                      {/* 顶栏：分类小徽章与序号 */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-[5px] bg-[#fff4ee] text-[#e2531f] border border-[#f8d9c6] shrink-0">
                          {pt.kind || '核心认知'}
                        </span>
                        <span className="text-[11px] text-[#aeaeae] tabular-nums font-medium">
                          #{idx + 1}
                        </span>
                      </div>

                      {/* 正文：字重自然、完整展开无挤压 */}
                      <div className="text-[13.5px] text-[#1c1c1e] font-normal leading-[1.7] break-words whitespace-pre-wrap">
                        {pt.text}
                      </div>

                      {/* 底部归入层级建议条 */}
                      {pt.suggestion && (
                        <div className="text-[11.5px] text-[#8b8b90] bg-[#fafafb] border border-[#f0f0f2] rounded-[7px] px-2.5 py-1.5 leading-[1.5]">
                          {pt.suggestion}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部协同操作栏 (.rcw-sf)：转写中或智能总结中不显示 */}
      {!isBusy && (
        <div className="flex flex-col gap-2.5 p-[12px_16px] border-t border-[#ebebee] bg-white shrink-0 select-none">
          <span className="text-[11.5px] text-[#8b8b90] leading-snug">
            整条录音一键同步到第二大脑 · 不同步就只存在本机
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSyncToSecondBrain}
              disabled={!hasSecondBrain || !item.transcriptText}
              title={!hasSecondBrain ? '当前账号未开通第二大脑权限' : undefined}
              className={`flex-1 text-[12px] font-medium rounded-[8px] py-1.5 transition-colors cursor-pointer text-center shadow-xs ${
                !hasSecondBrain || !item.transcriptText
                  ? 'bg-[#f4f4f5] text-[#a1a1aa] cursor-not-allowed border border-[#e4e4e7]'
                  : 'bg-[#FF6B35] text-white hover:bg-[#e2531f]'
              }`}
            >
              {!hasSecondBrain
                ? '第二大脑未授权'
                : isSynced
                  ? '再次同步第二大脑'
                  : '同步到第二大脑'}
            </button>
            <button
              type="button"
              onClick={onSendToChat}
              disabled={!item.summary}
              className={`flex-1 text-[12px] rounded-[8px] py-1.5 transition-colors text-center ${
                !item.summary
                  ? 'text-[#a1a1aa] bg-[#fafafa] border border-[#e4e4e7] cursor-not-allowed'
                  : 'text-[#505055] border border-[#ebebee] bg-white hover:border-[#c6c6cc] hover:text-[#1c1c1e] cursor-pointer'
              }`}
            >
              发到聊天框
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
