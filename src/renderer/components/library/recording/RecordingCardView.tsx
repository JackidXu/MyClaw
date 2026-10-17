/**
 * 录音卡独立视图 (RecordingCardView)
 *
 * 对应侧边栏“我的文件”下设的“录音卡”子菜单。
 * 遵循 HeyClaw 管理页面视觉规范与“只存在本机”隐私设计。
 */

import React from 'react';

import { showToast } from '../../../utils/localFileActions';
import { MANAGEMENT_PAGE_TITLE_TEXT } from '../../common/managementTypography';
import { CoworkUiEvent } from '../../cowork/constants';
import SidebarToggleIcon from '../../icons/SidebarToggleIcon';
import { RecordingCardWorkspace } from './RecordingCardWorkspace';

interface RecordingCardViewProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  updateBadge?: React.ReactNode;
  onNavigateToChat?: (content: string) => void;
}

export const RecordingCardView: React.FC<RecordingCardViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  updateBadge,
  onNavigateToChat,
}) => {
  return (
    <div
      data-skin-management-page="true"
      className="relative z-10 flex-1 flex flex-col bg-background h-full overflow-hidden"
    >
      {/* 顶部 Header：可拖拽区域 + non-draggable 按钮交互区 */}
      <div className="draggable flex h-12 items-center justify-between border-b border-border px-4 shrink-0">
        <div className="flex items-center gap-3">
          {isSidebarCollapsed && (
            <div className="flex items-center gap-1 non-draggable">
              <button
                type="button"
                onClick={onToggleSidebar}
                aria-label="展开侧边栏"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed />
              </button>
              {updateBadge}
            </div>
          )}
          <h1 className={`${MANAGEMENT_PAGE_TITLE_TEXT} font-semibold text-foreground`}>
            录音卡
          </h1>
        </div>

        {/* 右侧：本机资产标识 */}
        <div className="non-draggable flex items-center gap-1.5 text-[11px] text-tertiary bg-surface-raised px-2.5 py-1 rounded-full border border-border">
          <svg
            className="w-3.5 h-3.5 text-secondary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="10.5" width="16" height="10" rx="2" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          </svg>
          <span>本机资产 · 默认不上传</span>
        </div>
      </div>

      {/* 录音卡三栏工作台内容主体 */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <RecordingCardWorkspace
          onShowToast={(_type, msg) => {
            showToast(msg);
          }}
          onSendToChat={(content) => {
            if (onNavigateToChat) {
              onNavigateToChat(content);
            } else {
              window.dispatchEvent(
                new CustomEvent(CoworkUiEvent.FocusInput, {
                  detail: {
                    text: content,
                    clear: false,
                  },
                }),
              );
            }
          }}
        />
      </div>
    </div>
  );
};

export default RecordingCardView;
