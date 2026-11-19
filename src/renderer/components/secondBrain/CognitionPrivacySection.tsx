import React, { useEffect, useState } from 'react';

import { i18nService } from '../../services/i18n';
import {
  type CognitionItem,
  fetchCognitionItemList,
  LAYER_LABEL,
  updateCognitionNode,
} from '../../services/secondBrainApi';

const LAYER_CONFIGS = [
  { layer: 0, tag: 'L1', title: '底层世界观 · 经营哲学', subtitle: '绝对不能做的事 · 不可牺牲的原则' },
  { layer: 1, tag: 'L2', title: '价值观念 · 取舍准则', subtitle: '轻重缓急 · 核心价值观' },
  { layer: 2, tag: 'L3', title: '决策元规则 · 做 / 不做', subtitle: '准入条件 · 否决红线 · 权重排序' },
  { layer: 3, tag: 'L4', title: '沟通与执行偏好', subtitle: '汇报方式 · 用人标准 · 价格底线' },
  { layer: 4, tag: 'L5', title: '行业存量主观认知', subtitle: '赛道判断 · 渠道与客群观点' },
  { layer: 5, tag: 'L6', title: '标志性决策案例血缘库', subtitle: '当时怎么权衡的 · 最后怎样了' },
  { layer: 6, tag: 'L7', title: '个人表达体系', subtitle: '高频金句 · 语言风格（不参与决策）' },
];

interface CognitionPrivacySectionProps {
  onStatsChange?: () => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const CognitionPrivacySection: React.FC<CognitionPrivacySectionProps> = ({
  onStatsChange,
  showToast,
}) => {
  const [openLayers, setOpenLayers] = useState<Set<number>>(new Set());
  const [layerItems, setLayerItems] = useState<Record<number, CognitionItem[]>>({});
  const [layerTotals, setLayerTotals] = useState<Record<number, number>>({});
  const [loadingLayers, setLoadingLayers] = useState<Set<number>>(new Set());
  const [actioningNodeId, setActioningNodeId] = useState<number | null>(null);
  const [inputKeyword, setInputKeyword] = useState('');
  const [activeKeyword, setActiveKeyword] = useState('');
  const [layerPages, setLayerPages] = useState<Record<number, number>>({});

  const loadLayerData = React.useCallback((layer: number, keyword?: string) => {
    setLoadingLayers((prev) => new Set(prev).add(layer));
    fetchCognitionItemList({
      status: 1, // 已采纳
      layer,
      keyword: keyword !== undefined ? (keyword || undefined) : (activeKeyword || undefined),
      page: 1,
      pageSize: 50,
    })
      .then((res) => {
        setLayerItems((prev) => ({ ...prev, [layer]: res.data || [] }));
        setLayerTotals((prev) => ({ ...prev, [layer]: Number(res.total) || 0 }));
      })
      .catch((err) => {
        console.warn(`[CognitionPrivacy] 加载 Layer ${layer} 失败:`, err);
      })
      .finally(() => {
        setLoadingLayers((prev) => {
          const next = new Set(prev);
          next.delete(layer);
          return next;
        });
      });
  }, [activeKeyword]);

  useEffect(() => {
    LAYER_CONFIGS.forEach((cfg) => {
      loadLayerData(cfg.layer, activeKeyword);
    });
  }, [activeKeyword, loadLayerData]);

  const handleSearch = () => {
    const trimmed = inputKeyword.trim();
    setActiveKeyword(trimmed);
    setLayerPages({});
  };

  const toggleLayerOpen = (layer: number) => {
    setOpenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const handleTogglePrivacy = async (item: CognitionItem) => {
    if (actioningNodeId !== null) return;
    const nextPrivate = Number(item.is_private) === 1 ? false : true;
    setActioningNodeId(item.node_id);
    try {
      await updateCognitionNode({
        nodeId: item.node_id,
        isPrivate: nextPrivate,
      });
      setLayerItems((prev) => {
        const curList = prev[item.layer] || [];
        return {
          ...prev,
          [item.layer]: curList.map((n) =>
            n.node_id === item.node_id ? { ...n, is_private: nextPrivate ? 1 : 0 } : n
          ),
        };
      });
      showToast(
        'success',
        nextPrivate
          ? i18nService.t('secondBrainPrivacySetPrivateSuccess')
          : i18nService.t('secondBrainPrivacyCancelPrivateSuccess')
      );
      onStatsChange?.();
    } catch (err: any) {
      showToast('error', err?.message || '设置隐私失败');
    } finally {
      setActioningNodeId(null);
    }
  };

  const handleInvalidate = async (item: CognitionItem) => {
    if (actioningNodeId !== null) return;
    setActioningNodeId(item.node_id);
    try {
      await updateCognitionNode({
        nodeId: item.node_id,
        status: 3, // STATUS_INVALID
      });
      setLayerItems((prev) => {
        const curList = prev[item.layer] || [];
        return {
          ...prev,
          [item.layer]: curList.filter((n) => n.node_id !== item.node_id),
        };
      });
      setLayerTotals((prev) => ({
        ...prev,
        [item.layer]: Math.max(0, (prev[item.layer] || 1) - 1),
      }));
      showToast('success', i18nService.t('secondBrainPrivacyInvalidateSuccess'));
      onStatsChange?.();
    } catch (err: any) {
      showToast('error', err?.message || '标记失效失败');
    } finally {
      setActioningNodeId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* 模块外部标题栏与搜索 */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h2 className="text-base font-bold text-foreground">
            {i18nService.t('secondBrainPrivacyTitle')}
          </h2>
          <span className="text-xs text-secondary">
            {i18nService.t('secondBrainPrivacySubtitle')}
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-72 self-end sm:self-auto shrink-0">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={inputKeyword}
              onChange={(e) => setInputKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              placeholder={i18nService.t('secondBrainPrivacySearchPlaceholder')}
              className="w-full text-xs rounded-lg border border-border bg-surface pl-3 pr-7 py-1.5 outline-hidden focus:border-primary transition-colors text-foreground"
            />
            {inputKeyword && (
              <button
                type="button"
                onClick={() => {
                  setInputKeyword('');
                  setActiveKeyword('');
                  setLayerPages({});
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary/60 hover:text-foreground text-xs p-0.5 cursor-pointer"
                title="清空"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSearch}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-raised hover:border-primary/50 text-foreground transition-colors cursor-pointer shadow-2xs"
          >
            搜索
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4">
      {/* 顶部隐私规则说明条 */}
      <div className="flex items-start gap-2.5 rounded-xl bg-primary/8 border border-primary/20 px-3.5 py-2.5 text-xs text-secondary">
        <span className="text-sm shrink-0">🔒</span>
        <span className="leading-relaxed">{i18nService.t('secondBrainPrivacyBanner')}</span>
      </div>

      {/* 分层卡片列表 */}
      <div className="space-y-3 pt-1">
        {LAYER_CONFIGS.map((cfg) => {
          const isOpen = openLayers.has(cfg.layer);
          const items = layerItems[cfg.layer] || [];
          const total = layerTotals[cfg.layer] ?? items.length;
          const isLoading = loadingLayers.has(cfg.layer);
          const LAYER_PAGE_SIZE = 5;
          const curPage = layerPages[cfg.layer] || 1;
          const pageCount = Math.max(1, Math.ceil(items.length / LAYER_PAGE_SIZE));
          const safePage = Math.min(curPage, pageCount);
          const displayItems = items.slice((safePage - 1) * LAYER_PAGE_SIZE, safePage * LAYER_PAGE_SIZE);

          return (
            <div
              key={cfg.layer}
              className="rounded-xl border border-border bg-background/50 overflow-hidden transition-all"
            >
              {/* 卡片头部 */}
              <div
                onClick={() => toggleLayerOpen(cfg.layer)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-surface-raised/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center font-black text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {cfg.tag}
                  </span>
                  <div>
                    <span className="text-xs font-bold text-foreground mr-2">{cfg.title}</span>
                    <span className="text-[11px] text-secondary hidden sm:inline">{cfg.subtitle}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-secondary">
                    {total} <span className="text-[10.5px]">条</span>
                  </span>
                  <svg
                    className={`w-4 h-4 text-secondary/70 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {/* 卡片展开内容 */}
              {isOpen && (
                <div className="border-t border-border px-4 py-3 bg-surface space-y-2">
                  {isLoading && items.length === 0 && (
                    <div className="py-4 text-center text-xs text-secondary">
                      {i18nService.t('secondBrainTrendsLoading')}
                    </div>
                  )}

                  {!isLoading && items.length === 0 && (
                    <div className="py-4 text-center text-xs text-secondary">
                      {activeKeyword ? '未匹配到该层认知' : '暂无沉淀认知'}
                    </div>
                  )}

                  {displayItems.map((item) => {
                    const isPrivate = Number(item.is_private) === 1;
                    const isActioning = actioningNodeId === item.node_id;
                    // layer 5, 6 不展示隐私入口
                    const canSetPrivacy = item.layer !== 5 && item.layer !== 6;

                    return (
                      <div
                        key={item.node_id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border border-border/80 bg-surface-raised/40 p-3 hover:border-border transition-colors"
                      >
                        <div className="space-y-1 flex-1 min-w-0 pr-2">
                          <p className="text-xs font-semibold text-foreground leading-relaxed break-words">
                            "{item.proposition}"
                          </p>
                          {item.elaboration && (
                            <p className="text-[11px] text-secondary leading-relaxed line-clamp-2">
                              {item.elaboration}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-[10.5px] text-secondary/70">
                            <span>
                              {LAYER_LABEL[item.layer] || `Layer ${item.layer}`}
                            </span>
                            <span>·</span>
                            <span>{item.adopt_source === 1 ? 'AI自动吸收' : '人工审核采纳'}</span>
                          </div>
                        </div>

                        {/* 右侧操作区 */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          {canSetPrivacy && (
                            <span
                              className={`inline-flex items-center justify-center h-6 px-2 rounded-md text-[11px] font-medium ${
                                isPrivate
                                  ? 'bg-[#FF6B35]/10 text-[#e85c27] border border-[#f3c8ab]'
                                  : 'bg-[#2d8a5f]/10 text-[#2d8a5f] border border-[#2d8a5f]/20'
                              }`}
                            >
                              {isPrivate
                                ? i18nService.t('secondBrainPrivacyBadgePrivate')
                                : i18nService.t('secondBrainPrivacyBadgePublic')}
                            </span>
                          )}

                          {canSetPrivacy && (
                            <button
                              type="button"
                              disabled={isActioning}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePrivacy(item);
                              }}
                              className="inline-flex items-center justify-center h-6 px-2.5 rounded-md border border-border bg-surface hover:bg-surface-raised text-foreground font-medium text-[11px] transition-colors cursor-pointer disabled:opacity-40"
                            >
                              {isPrivate
                                ? i18nService.t('secondBrainPrivacyCancelPrivate')
                                : i18nService.t('secondBrainPrivacySetPrivate')}
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isActioning}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInvalidate(item);
                            }}
                            className="inline-flex items-center justify-center h-6 px-2.5 rounded-md border border-border/80 bg-surface hover:bg-surface-raised text-secondary/80 hover:text-destructive hover:border-destructive/30 font-medium text-[11px] transition-colors cursor-pointer disabled:opacity-40"
                            title={i18nService.t('secondBrainPrivacyInvalidate')}
                          >
                            {i18nService.t('secondBrainPrivacyInvalidate')}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {items.length > LAYER_PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-2.5 border-t border-border/60 text-xs text-secondary">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() =>
                          setLayerPages((prev) => ({
                            ...prev,
                            [cfg.layer]: Math.max(1, safePage - 1),
                          }))
                        }
                        className="px-2.5 py-1 rounded border border-border bg-surface hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        ‹ 上一页
                      </button>
                      <span className="font-medium">
                        <b className="text-foreground">{safePage}</b> / {pageCount} 页 (共 {items.length} 条)
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= pageCount}
                        onClick={() =>
                          setLayerPages((prev) => ({
                            ...prev,
                            [cfg.layer]: Math.min(pageCount, safePage + 1),
                          }))
                        }
                        className="px-2.5 py-1 rounded border border-border bg-surface hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        下一页 ›
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
};
