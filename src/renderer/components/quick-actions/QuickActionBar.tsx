import { ArrowPathIcon, MagnifyingGlassIcon, UserIcon } from '@heroicons/react/24/outline';
import React, { useMemo, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import type { LocalizedPrompt, LocalizedQuickAction } from '../../types/quickAction';
import AcademicCapIcon from '../icons/AcademicCapIcon';
import ChartBarIcon from '../icons/ChartBarIcon';
import DevicePhoneMobileIcon from '../icons/DevicePhoneMobileIcon';
import DocumentTextIcon from '../icons/DocumentTextIcon';
import GlobeAltIcon from '../icons/GlobeAltIcon';
import PresentationChartBarIcon from '../icons/PresentationChartBarIcon';

interface QuickActionBarProps {
  actions: LocalizedQuickAction[];
  selectedActionId?: string | null;
  selectedPromptId?: string | null;
  onActionSelect?: (actionId: string) => void;
  onPromptSelect: (prompt: string, promptId: string, actionId: string) => void;
  onClearSelection?: () => void;
}

// 图标映射
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  PresentationChartBarIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
  DocumentTextIcon,
  ChartBarIcon,
  AcademicCapIcon,
  MagnifyingGlassIcon,
  UserIcon,
  ArrowPathIcon,
};

interface PromptItem {
  prompt: LocalizedPrompt;
  action: LocalizedQuickAction;
}

const QuickActionBar: React.FC<QuickActionBarProps> = ({
  actions,
  selectedPromptId,
  onPromptSelect,
  onClearSelection,
}) => {
  const [shuffleSeed, setShuffleSeed] = useState<number>(0);
  const listRef = useRef<HTMLDivElement>(null);

  // 整理所有的推荐卡片列表（包含所属 action）
  const allPromptItems = useMemo<PromptItem[]>(() => {
    const items: PromptItem[] = [];
    actions.forEach((action) => {
      (action.prompts || []).forEach((prompt) => {
        items.push({ prompt, action });
      });
    });
    return items;
  }, [actions]);

  // 推荐卡片列表（支持换一换随机打乱）
  const filteredItems = useMemo<PromptItem[]>(() => {
    if (shuffleSeed === 0) return allPromptItems;
    return [...allPromptItems].sort(() => Math.random() - 0.5);
  }, [allPromptItems, shuffleSeed]);

  if (actions.length === 0 || allPromptItems.length === 0) {
    return null;
  }

  // 左右平滑滚动
  const handleScroll = (direction: number) => {
    if (!listRef.current) return;
    const cardWidth = 260;
    listRef.current.scrollBy({
      left: direction * cardWidth,
      behavior: 'smooth',
    });
  };

  // 换一换
  const handleRefresh = () => {
    setShuffleSeed((prev) => prev + 1);
    if (listRef.current) {
      listRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const handleCardClick = (item: PromptItem) => {
    const isSelected = selectedPromptId === item.prompt.id;
    if (isSelected && onClearSelection) {
      onClearSelection();
      return;
    }
    onPromptSelect(item.prompt.prompt, item.prompt.id, item.action.id);
  };

  return (
    <div data-skin-quick-actions="true" className="w-full">
      {/* 能力推荐区域 (wb-rec) */}
      <div className="w-full">
        {/* 头部标题与“换一换” */}
        <div className="flex items-center justify-between mb-2.5 px-1 text-xs font-semibold text-secondary">
          <span>{i18nService.t('coworkGuessYouNeed')}</span>
          <button
            type="button"
            onClick={handleRefresh}
            className="text-xs font-semibold text-primary hover:opacity-80 transition-opacity cursor-pointer flex items-center gap-1"
          >
            {i18nService.t('coworkRefreshRecommendations')}
          </button>
        </div>

        {/* 轮播卡片列表外层 */}
        <div className="relative flex items-center w-full">
          {/* 左翻页按钮 */}
          <button
            type="button"
            onClick={() => handleScroll(-1)}
            aria-label="Previous"
            className="w-7 h-7 rounded-full border border-border bg-surface text-foreground flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-surface-raised hover:border-primary/50 hover:text-primary shadow-subtle z-10 shrink-0 mr-2 text-base leading-none"
          >
            ‹
          </button>

          {/* 卡片滚动容器 */}
          <div
            ref={listRef}
            className="flex gap-3 overflow-x-auto py-1 px-0.5 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden w-full select-none snap-x snap-mandatory"
          >
            {filteredItems.map((item) => {
              const isSelected = selectedPromptId === item.prompt.id;
              const IconComponent = iconMap[item.action.icon];

              return (
                <div
                  key={`${item.action.id}-${item.prompt.id}`}
                  onClick={() => handleCardClick(item)}
                  className={`group flex-[0_0_240px] sm:flex-[0_0_250px] bg-surface border rounded-2xl p-3.5 snap-start cursor-pointer transition-all duration-200 flex flex-row items-center gap-3.5 relative select-none hover:-translate-y-0.5 hover:shadow-card ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-subtle ring-1 ring-primary/40'
                      : 'border-border hover:border-primary/50 hover:bg-surface-raised/40'
                  }`}
                >
                  {/* 选中右上角勾标 */}
                  {isSelected && (
                    <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                      ✓
                    </span>
                  )}

                  {/* 图标 */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 transition-transform group-hover:scale-105"
                    style={{
                      backgroundColor: item.action.color
                        ? `color-mix(in srgb, ${item.action.color} 15%, transparent)`
                        : 'var(--lobster-surface-raised)',
                      color: item.action.color || 'var(--lobster-primary)',
                    }}
                  >
                    {item.prompt.icon ? (
                      <span>{item.prompt.icon}</span>
                    ) : IconComponent ? (
                      <IconComponent className="w-6 h-6" />
                    ) : (
                      <span>🧩</span>
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="text-[13.5px] font-bold text-foreground leading-snug truncate group-hover:text-primary transition-colors">
                      {item.prompt.label}
                    </div>
                    <div className="text-xs text-secondary leading-relaxed line-clamp-2">
                      {item.prompt.description || item.prompt.prompt}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 右翻页按钮 */}
          <button
            type="button"
            onClick={() => handleScroll(1)}
            aria-label="Next"
            className="w-7 h-7 rounded-full border border-border bg-surface text-foreground flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-surface-raised hover:border-primary/50 hover:text-primary shadow-subtle z-10 shrink-0 ml-2 text-base leading-none"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickActionBar;

