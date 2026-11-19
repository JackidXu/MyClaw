import React, { useEffect, useState } from 'react';

import { i18nService } from '../../services/i18n';
import {
  type CallLogItem,
  fetchFmpCallLogs,
} from '../../services/secondBrainApi';

interface UsageCallLogSectionProps {
  userRole?: string;
  embedded?: boolean;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const UsageCallLogSection: React.FC<UsageCallLogSectionProps> = ({
  userRole,
  embedded = false,
}) => {
  const [logs, setLogs] = useState<CallLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [openLogIds, setOpenLogIds] = useState<Set<number>>(new Set());

  const isOwner = userRole === 'owner';

  const loadLogs = (targetPage: number) => {
    setLoading(true);
    fetchFmpCallLogs({
      page: targetPage,
      pageSize: 15,
    })
      .then((res) => {
        setLogs(res.data || []);
        setTotal(Number(res.total) || 0);
        setPage(Number(res.current_page) || 1);
      })
      .catch((err) => {
        console.warn('[UsageCallLogSection] 获取调用日志失败:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadLogs(1);
  }, []);

  const toggleOpenLog = (logId: number) => {
    setOpenLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) next.delete(logId);
      else next.add(logId);
      return next;
    });
  };

  return (
    <div
      className={
        embedded
          ? 'space-y-4 pt-4 border-t border-border/70'
          : 'rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4'
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="text-xs font-bold text-foreground">
          {isOwner ? '调用明细 · 点击展开' : '个人调用明细'}
        </div>
        <div className="text-xs text-secondary font-medium">
          共 <b className="text-foreground">{total}</b> 条记录
        </div>
      </div>

      {loading && logs.length === 0 && (
        <div className="py-8 text-center text-xs text-secondary">
          {i18nService.t('secondBrainTrendsLoading')}
        </div>
      )}

      {!loading && logs.length === 0 && (
        <div className="py-8 text-center text-xs text-secondary">
          {i18nService.t('secondBrainCallLogEmpty')}
        </div>
      )}

      <div className="space-y-2.5">
        {logs.map((log) => {
          const isOpen = openLogIds.has(log.log_id);
          const isOwnerCall = Number(log.is_owner) === 1;

          return (
            <div
              key={log.log_id}
              className="rounded-xl border border-border bg-background/50 overflow-hidden transition-all"
            >
              <div
                onClick={() => toggleOpenLog(log.log_id)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-surface-raised/60 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      isOwnerCall
                        ? 'bg-[#8b8b90]/15 text-[#8b8b90]'
                        : 'bg-[#FF6B35]/15 text-[#FF6B35]'
                    }`}
                  >
                    {isOwnerCall ? '自' : '工'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground truncate">
                        {isOwnerCall ? '自己' : '员工'}
                      </span>
                      <span className="text-[10px] text-secondary/60">
                        {log.create_time}
                      </span>
                    </div>
                    <p className="text-[11px] text-secondary truncate mt-0.5">
                      触发意图：{log.query || '任务执行'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <span className="text-primary font-semibold text-[11px]">
                    {i18nService.t('secondBrainCallLogHitCount', { count: log.hit_count })}
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

              {isOpen && (
                <div className="border-t border-border px-4 py-3 bg-surface text-xs space-y-2">
                  <div className="text-[11px] font-bold text-secondary">
                    {i18nService.t('secondBrainCallLogHitNodes')}：
                  </div>
                  {log.nodes && log.nodes.length > 0 ? (
                    <div className="space-y-1.5 pl-2 border-l-2 border-primary/40">
                      {log.nodes.map((node) => (
                        <div
                          key={node.node_id}
                          className="text-xs text-foreground font-medium leading-relaxed"
                        >
                          「{node.proposition || `认知 #${node.node_id}`}」
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-secondary/60 text-[11px]">
                      根据指令直接推理，未命中独立命题节点
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {total > 15 && (
        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs text-secondary">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => loadLogs(page - 1)}
            className="px-3 py-1 rounded border border-border bg-surface hover:bg-surface-raised disabled:opacity-40 cursor-pointer"
          >
            ‹ 上一页
          </button>
          <span>第 {page} 页</span>
          <button
            type="button"
            disabled={logs.length < 15 || loading}
            onClick={() => loadLogs(page + 1)}
            className="px-3 py-1 rounded border border-border bg-surface hover:bg-surface-raised disabled:opacity-40 cursor-pointer"
          >
            下一页 ›
          </button>
        </div>
      )}
    </div>
  );
};
