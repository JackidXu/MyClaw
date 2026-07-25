import { AgentId } from '@shared/agent';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Modal from '../../components/common/Modal';
import { agentService } from '../../services/agent';
import { coworkService } from '../../services/cowork';
import { expertService } from '../../services/expertService';
import { RootState } from '../../store';
import {
  selectCoworkSessions,
  selectCurrentSessionId,
  selectUnreadSessionIds,
} from '../../store/selectors/coworkSelectors';
import type { AgentSummary } from '../../store/slices/agentSlice';
import { setDraftCollaborationMode } from '../../store/slices/coworkSlice';
import { CoworkCollaborationMode } from '../../types/cowork';
import type { PaidExpert } from '../../types/paidExpert';
import { isDefaultAgentId } from '../../utils/agentDisplay';
import AgentAvatarIcon from '../agent/AgentAvatarIcon';
import AgentCreateModal from '../agent/AgentCreateModal';
import AgentSettingsPanel from '../agent/AgentSettingsPanel';
import type { CoworkOpenShareOptionsEventDetail } from '../cowork/constants';
import { CoworkUiEvent } from '../cowork/constants';
import SpinnerIcon from '../icons/SpinnerIcon';
import { formatAgentTaskRelativeTime } from './time';
import { useAgentSidebarState } from './useAgentSidebarState';

interface MyAgentSidebarTreeProps {
  isBatchMode: boolean;
  batchAgentId: string | null;
  deletedSessionIds: string[];
  selectedKeys: Set<string>;
  onShowCowork: () => void;
  onShowExperts?: () => void;
  onTaskSelected?: (params: {
    agentType: 'main' | 'custom';
    isCurrentSession: boolean;
    taskStatus: string;
  }) => void;
  onSidebarAction?: (actionType: string, params?: any) => void;
  onToggleSelection?: (selectionKey: string, agentId: string) => void;
  onEnterBatchMode?: (sessionId: string, agentId: string) => void;
  onBatchSelectableItemsChange?: (items: any[]) => void;
  onSearchTasks?: () => void;
}

const MyAgentSidebarTree: React.FC<MyAgentSidebarTreeProps> = ({
  isBatchMode,
  batchAgentId,
  deletedSessionIds,
  selectedKeys,
  onShowCowork,
  onShowExperts,
  onTaskSelected,
  onSidebarAction,
}) => {
  void isBatchMode;
  void batchAgentId;
  void deletedSessionIds;
  void selectedKeys;
  void onSidebarAction;
  void onShowExperts;

  const dispatch = useDispatch();
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const agents = useSelector((state: RootState) => state.agent.agents);
  const sessions = useSelector(selectCoworkSessions);
  const currentSessionId = useSelector(selectCurrentSessionId);
  const unreadSessionIds = useSelector(selectUnreadSessionIds);
  const unreadSessionIdSet = useMemo(() => new Set(unreadSessionIds), [unreadSessionIds]);

  // 状态定义
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<any | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [settingsAgentId, setSettingsAgentId] = useState<string | null>(null);
  const [filterAgentId, setFilterAgentId] = useState<string | 'all'>('all');

  // 二阶段行内确认状态，代替 Electron 不支持的 window.confirm
  const [confirmingRecallAgentId, setConfirmingRecallAgentId] = useState<string | null>(null);
  const [confirmingDeleteAgentId, setConfirmingDeleteAgentId] = useState<string | null>(null);

  // 从 sidebar state 挂钩，用于局部静默更新 Redux preview 树数据
  const {
    patchTaskPreview,
    removeTaskPreview,
  } = useAgentSidebarState();

  // 点击外部关闭弹出菜单
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveMenuSessionId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // 当关闭管理弹窗时，自动将行内确认状态重置
  useEffect(() => {
    if (!isManageOpen) {
      setConfirmingRecallAgentId(null);
      setConfirmingDeleteAgentId(null);
    }
  }, [isManageOpen]);

  // 获取所有已经启用(已添加)的专家列表
  const enabledExperts = useMemo(() => {
    const list: Array<AgentSummary | PaidExpert> = [
      ...agents.filter((a) => a.enabled),
    ];
    expertService.getPaidExperts().forEach((pe) => {
      if (pe.enabled && !list.some((a) => a.id === pe.id)) {
        list.push(pe);
      }
    });
    return list;
  }, [agents]);

  // 将所有会话进行更新时间降序及置顶排序
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aTime = a.updatedAt || a.createdAt || 0;
      const bTime = b.updatedAt || b.createdAt || 0;
      return bTime - aTime;
    });
  }, [sessions]);

  // 加载专家列表
  useEffect(() => {
    void agentService.loadAgents();
  }, []);

  // 监听选中的过滤专家，拉取对应的对话列表
  useEffect(() => {
    if (filterAgentId === 'all') {
      void coworkService.loadSessions(undefined);
    } else {
      void coworkService.loadSessions(filterAgentId);
    }
  }, [filterAgentId]);

  // 监听当前选中的专家发生变化，如果在单专家模式，自动拉取该专家的对话列表并更新视图
  useEffect(() => {
    if (currentAgentId && filterAgentId !== 'all' && currentAgentId !== filterAgentId) {
      setFilterAgentId(currentAgentId);
    }
  }, [currentAgentId, filterAgentId]);

  const getTaskActionParams = useCallback((task: any, hasActiveSubagent?: boolean) => ({
    agentType: isDefaultAgentId(task.agentId) ? ('main' as const) : ('custom' as const),
    hasActiveSubagent,
    isCurrentSession: task.id === currentSessionId,
    isPinned: task.pinned,
    taskStatus: task.status,
  }), [currentSessionId]);

  // 移出或解雇专家真实执行逻辑
  const handleRemoveExpertReal = async (expert: any) => {
    if (expert.id === AgentId.Main) return;

    if (expert.source === 'preset') {
      const updated = await agentService.updateAgent(expert.id, { enabled: false });
      if (updated) {
        await agentService.loadAgents();
        if (currentAgentId === expert.id) {
          agentService.switchAgent(AgentId.Main);
          await coworkService.loadSessions(AgentId.Main);
        }
      } else {
        window.dispatchEvent(new CustomEvent('app:showToast', { detail: '移出内置专家失败' }));
      }
    } else {
      const deleted = await agentService.deleteAgent(expert.id);
      if (deleted) {
        await agentService.loadAgents();
        if (currentAgentId === expert.id) {
          agentService.switchAgent(AgentId.Main);
          await coworkService.loadSessions(AgentId.Main);
        }
      } else {
        window.dispatchEvent(new CustomEvent('app:showToast', { detail: '解雇并删除专家失败' }));
      }
    }
  };

  // 点击头像墙专家头像：切换专家，如果没有对话就新建，有对话就直接切换
  const handleExpertClick = async (expertId: string) => {
    setFilterAgentId(expertId);
    const expertSessions = sessions.filter(s => s.agentId === expertId);
    
    if (expertId !== currentAgentId) {
      agentService.switchAgent(expertId);
      await coworkService.loadSessions(expertId);
    }
    
    onShowCowork();

    if (expertSessions.length > 0) {
      const latest = [...expertSessions].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))[0];
      await coworkService.loadSession(latest.id);
    } else {
      coworkService.clearSession({ restoreAgentSkills: true });
      dispatch(setDraftCollaborationMode({
        draftKey: '__home__',
        mode: CoworkCollaborationMode.Default,
      }));
    }
  };

  // 点击历史会话项
  const handleSelectSession = useCallback(async (session: any) => {
    const agentId = session.agentId?.trim() || AgentId.Main;
    onTaskSelected?.({
      agentType: isDefaultAgentId(agentId) ? 'main' : 'custom',
      isCurrentSession: session.id === currentSessionId,
      taskStatus: session.status,
    });
    
    if (agentId !== currentAgentId) {
      agentService.switchAgent(agentId);
      await coworkService.loadSessions(agentId);
    }
    
    onShowCowork();
    return coworkService.loadSession(session.id);
  }, [currentAgentId, currentSessionId, onShowCowork, onTaskSelected]);

  // 处理三点菜单点击与触发
  const handleMenuClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setActiveMenuSessionId(activeMenuSessionId === sessionId ? null : sessionId);
  };

  // 删除会话操作
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const deleted = await coworkService.deleteSession(sessionId);
    onSidebarAction?.(deleted ? 'task_delete_success' : 'task_delete_failed', {
      agentType: isDefaultAgentId(currentAgentId) ? 'main' : 'custom',
      isCurrentSession: sessionId === currentSessionId,
      result: deleted ? 'success' : 'failed',
    });
    if (deleted) {
      removeTaskPreview(sessionId);
      if (sessionId === currentSessionId) {
        coworkService.clearSession({ restoreAgentSkills: true });
      }
    }
  };

  // 置顶/取消置顶操作
  const handleTogglePin = async (e: React.MouseEvent, session: any) => {
    e.stopPropagation();
    const result = await coworkService.setSessionPinned(session.id, !session.pinned);
    onSidebarAction?.('task_pin_toggle', {
      ...getTaskActionParams(session),
      result: result.success ? 'success' : 'failed',
      targetPinned: !session.pinned,
    });
    if (result.success) {
      patchTaskPreview(session.id, { pinned: !session.pinned, pinOrder: result.pinOrder }, { preserveUpdatedAt: true });
    }
  };

  // 重命名会话 (行内编辑模式，避免 window.prompt 报错)
  const handleRenameTaskPrompt = (e: React.MouseEvent, session: any) => {
    e.stopPropagation();
    setRenameValue(session.title || '');
    setEditingSessionId(session.id);
  };

  // 分享会话
  const handleShareTaskAction = async (e: React.MouseEvent, session: any) => {
    e.stopPropagation();
    onSidebarAction?.('task_share_open', getTaskActionParams(session));
    const loaded = await handleSelectSession(session);
    if (!loaded) return;

    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent<CoworkOpenShareOptionsEventDetail>(
        CoworkUiEvent.OpenShareOptions,
        { detail: { sessionId: session.id } },
      ));
    }, 0);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden select-none pb-4">
      {/* 顶部：我的专家墙 */}
      <div className="shrink-0 mb-4 px-2">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[13px] font-semibold text-secondary">我的专家</h2>
          {/* 全部任务的标签 */}
          <button
            type="button"
            onClick={() => setFilterAgentId('all')}
            className={`text-xs font-semibold px-2 py-0.5 rounded transition-all cursor-pointer ${
              filterAgentId === 'all'
                ? 'bg-primary/10 text-primary'
                : 'text-secondary hover:text-foreground hover:bg-secondary/10'
            }`}
          >
            全部任务
          </button>
        </div>

        {/* 圆形头像网格（一行4个，高和宽完全对齐约束，保持极致清爽） */}
        <div className="grid grid-cols-4 gap-3 max-h-[140px] overflow-y-auto pr-1 py-1 [scrollbar-width:none]">
          {enabledExperts.map((expert) => {
            const isSelected = filterAgentId === expert.id;
            return (
              <div
                key={expert.id}
                className="group relative flex flex-col items-center justify-between h-[58px] cursor-pointer"
              >
                <div
                  onClick={() => void handleExpertClick(expert.id)}
                  title={expert.name}
                  className="relative w-9 h-9 flex items-center justify-center animate-in fade-in duration-100"
                >
                  <AgentAvatarIcon avatar={expert.avatar} agentId={expert.id}
                    className={`h-9 w-9 shadow-sm transition-all rounded-full ${
                      isSelected
                        ? 'ring-2 ring-primary ring-offset-1 shadow-md'
                        : 'group-hover:scale-105 group-hover:shadow-md'
                    }`}
                  />
                  {isSelected && (
                    <span className="absolute bottom-0 right-0 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                  )}

                  {/* 右上角快捷控制图标 (仅在 Hover 状态下显示，避免误触且操作精准) */}
                  <div className="absolute -top-1 -right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    {expert.id === AgentId.Main ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSettingsAgentId(expert.id);
                        }}
                        className="w-4 h-4 rounded-full bg-transparent flex items-center justify-center text-foreground/85 hover:bg-surface hover:border hover:border-border hover:text-foreground hover:shadow-md transition-all duration-150 cursor-pointer"
                        title="编辑主专家"
                      >
                        {/* 铅笔编辑图标 */}
                        <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingRecallAgentId(expert.id);
                        }}
                        className="w-4 h-4 rounded-full bg-transparent flex items-center justify-center text-foreground/85 hover:bg-surface hover:border hover:border-border hover:text-foreground hover:shadow-md transition-all duration-150 cursor-pointer"
                        title="召回该专家"
                      >
                        {/* 叉号召回图标 */}
                        <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <span
                  onClick={() => void handleExpertClick(expert.id)}
                  className="w-full text-[10px] text-center text-secondary truncate px-0.5 select-none leading-none group-hover:text-foreground transition-colors"
                >
                  {expert.name.replace('专家', '').replace('助手', '')}
                </span>
              </div>
            );
          })}

          {/* 最后的加号快速添加 */}
          <button
            type="button"
            onClick={() => onShowExperts?.()}
            title="添加新专家"
            className="flex flex-col items-center justify-between h-[58px] focus:outline-none group cursor-pointer animate-in fade-in duration-100"
          >
            <div className="relative w-9 h-9 flex items-center justify-center">
              <div className="h-9 w-9 rounded-full border-2 border-dashed border-border bg-surface hover:bg-secondary/10 flex items-center justify-center transition-all group-hover:scale-105">
                <svg
                  className="h-4 w-4 text-secondary group-hover:text-primary transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
            <span className="text-[10px] text-center text-secondary leading-none">
              添加
            </span>
          </button>
        </div>
      </div>

      {/* 底部：扁平历史任务会话列表 */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-border/60 pt-3 animate-in fade-in duration-100">
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]">
          {sortedSessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-secondary/60">
              暂无对话任务
            </div>
          ) : (
            sortedSessions.map((session) => {
              const isSelected = session.id === currentSessionId;
              const expert = agents.find((a) => a.id === session.agentId) || expertService.getPaidExperts().find((pe) => pe.id === session.agentId);
              const relativeTime = formatAgentTaskRelativeTime(session.updatedAt || session.createdAt);
              const isRunning = session.status === 'running';
              const isCompletedUnread = session.status === 'completed' && unreadSessionIdSet.has(session.id);
              const isError = session.status === 'error';

              const isMenuOpen = activeMenuSessionId === session.id;
              return (
                <div
                  key={session.id}
                  onClick={() => handleSelectSession(session)}
                  className={`group flex items-center justify-between rounded-xl px-2.5 py-2 transition-all cursor-pointer select-none ${
                    isMenuOpen ? 'relative z-[110]' : 'relative z-10'
                  } ${
                    isSelected
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : activeMenuSessionId !== null
                        ? 'text-foreground'
                        : 'hover:bg-secondary/15 text-foreground'
                  }`}
                >
                  <div className="flex items-center min-w-0 flex-1 space-x-2.5 pr-6">
                    {/* 会话绑定专家的头像 */}
                    <AgentAvatarIcon
                      avatar={expert?.avatar}
                      agentId={session.agentId}
                      className="h-7 w-7 rounded-full shadow-sm"
                      useDefaultWhenEmpty
                    />
                    
                    {/* 会话标题 */}
                    <div className="flex-1 min-w-0">
                      {editingSessionId === session.id ? (
                        <input
                          type="text"
                          value={renameValue}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                              setEditingSessionId(null);
                            }
                          }}
                          onBlur={async () => {
                            const nextTitle = renameValue.trim();
                            if (nextTitle && nextTitle !== (session.title || '')) {
                              const renamed = await coworkService.renameSession(session.id, nextTitle);
                              onSidebarAction?.('task_rename_submit', {
                                ...getTaskActionParams(session),
                                result: renamed ? 'success' : 'failed',
                              });
                              if (renamed) {
                                patchTaskPreview(session.id, { title: nextTitle }, { preserveUpdatedAt: true });
                              }
                            }
                            setEditingSessionId(null);
                          }}
                          className="w-full bg-surface border border-primary px-1 py-0.5 rounded text-xs text-foreground focus:outline-none"
                        />
                      ) : (
                        <div className={`text-[12.5px] truncate font-semibold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                          {session.title || '无标题会话'}
                        </div>
                      )}
                      <div className="text-[10px] text-secondary mt-0.5 truncate max-w-full flex items-center space-x-1">
                        <span>{expert ? `${expert.name} · ` : ''}</span>
                        <span>{relativeTime.compact}</span>
                        {session.pinned && (
                          <span className="inline-flex items-center text-primary ml-1.5" title="已置顶">
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M5 4a1 1 0 011-1h8a1 1 0 011 1v1a1 1 0 01-1 1h-1v4h1a1 1 0 011 1v1a1 1 0 01-1 1h-3v4l-2 2-2-2v-4H4a1 1 0 01-1-1v-1a1 1 0 011-1h1V6H4a1 1 0 01-1-1V4zm4 6H8v2h1v-2zm3 0h-1v2h1v-2z" />
                            </svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 三点式上下文菜单区 / 状态指示器 */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center shrink-0 w-6 h-6">
                    {!isMenuOpen && isRunning && (
                      <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0 pointer-events-none" aria-hidden="true">
                        <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-primary" />
                      </span>
                    )}
                    {!isMenuOpen && isCompletedUnread && (
                      <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0 pointer-events-none" aria-hidden="true">
                        <span className="h-[7px] w-[7px] rounded-full bg-emerald-500" />
                      </span>
                    )}
                    {!isMenuOpen && isError && (
                      <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0 pointer-events-none" aria-hidden="true">
                        <span className="h-[7px] w-[7px] rounded-full bg-red-500" />
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleMenuClick(e, session.id)}
                      title="更多操作"
                      className={`${
                        isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      } transition-opacity h-6 w-6 inline-flex items-center justify-center rounded-lg hover:bg-secondary/20 text-secondary hover:text-foreground cursor-pointer`}
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    
                    {activeMenuSessionId === session.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-2 top-full z-[100] mt-0.5 w-28 py-0.5 bg-surface border border-border rounded-lg shadow-lg text-left"
                      >
                        {/* 1. 置顶/取消置顶 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            setActiveMenuSessionId(null);
                            void handleTogglePin(e, session);
                          }}
                          className="w-full text-left px-2.5 py-1 text-[11px] text-foreground hover:bg-secondary/15 flex items-center space-x-1.5 cursor-pointer"
                        >
                          <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          <span>{session.pinned ? '取消置顶' : '置顶'}</span>
                        </button>

                        {/* 2. 重命名 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            setActiveMenuSessionId(null);
                            void handleRenameTaskPrompt(e, session);
                          }}
                          className="w-full text-left px-2.5 py-1 text-[11px] text-foreground hover:bg-secondary/15 flex items-center space-x-1.5 cursor-pointer"
                        >
                          <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>重命名</span>
                        </button>

                        {/* 3. 分享 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            setActiveMenuSessionId(null);
                            void handleShareTaskAction(e, session);
                          }}
                          className="w-full text-left px-2.5 py-1 text-[11px] text-foreground hover:bg-secondary/15 flex items-center space-x-1.5 cursor-pointer"
                        >
                          <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 10.742l5.428-2.714m-5.428 5.428l5.428 2.714M16.5 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-7 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm9 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                          </svg>
                          <span>分享</span>
                        </button>

                         {/* 4. 删除 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSessionToDelete(session);
                            setActiveMenuSessionId(null);
                          }}
                          className="w-full text-left px-2.5 py-1 text-[11px] text-red-500 hover:bg-red-50 flex items-center space-x-1.5 cursor-pointer"
                        >
                          <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span>删除</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <AgentCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        source="home_agent_sidebar"
      />
      <AgentSettingsPanel
        agentId={settingsAgentId}
        onClose={() => setSettingsAgentId(null)}
      />

      {/* 4. 统一专家管理弹窗列表 */}
      {isManageOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="bg-surface border border-border w-[380px] max-h-[480px] rounded-2xl shadow-2xl flex flex-col p-4 text-foreground animate-in fade-in zoom-in-95 duration-150">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3">
              <h3 className="text-[14px] font-semibold text-foreground">管理我的专家</h3>
              <button
                type="button"
                onClick={() => setIsManageOpen(false)}
                className="text-secondary hover:text-foreground transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 专家列表容器 */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 [scrollbar-width:thin]">
              {enabledExperts.map((expert) => {
                const isMain = expert.id === AgentId.Main;
                const isPreset = 'source' in expert && expert.source === 'preset';

                const isConfirmingRecall = confirmingRecallAgentId === expert.id;
                const isConfirmingDelete = confirmingDeleteAgentId === expert.id;

                return (
                  <div
                    key={expert.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-secondary/5 border border-border/40 hover:bg-secondary/10 transition-colors animate-in fade-in duration-100"
                  >
                    {/* 左侧：头像 + 专家名字属性 */}
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <AgentAvatarIcon
                        avatar={expert.avatar}
                        className="h-8 w-8 rounded-full shadow-sm"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate text-foreground">{expert.name}</div>
                      </div>
                    </div>

                    {/* 右侧：编辑 / 召回 / 删除 操作按钮 */}
                    <div className="flex items-center space-x-1.5 shrink-0">
                      {/* 编辑 (主专家与自定义专家均支持) */}
                      {!isConfirmingRecall && !isConfirmingDelete && (isMain || !isPreset) && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsManageOpen(false);
                            setSettingsAgentId(expert.id);
                          }}
                          className="px-2 py-1 rounded bg-secondary/20 hover:bg-secondary/30 text-[11px] font-medium text-foreground transition-colors cursor-pointer"
                        >
                          编辑
                        </button>
                      )}

                      {/* 非主专家操作 */}
                      {!isMain && (
                        <>
                          {isPreset ? (
                            // 内置专家移出 (召回) 二阶段
                            isConfirmingRecall ? (
                              <div className="flex items-center space-x-1 animate-in fade-in duration-150">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmingRecallAgentId(null);
                                    void handleRemoveExpertReal(expert);
                                  }}
                                  className="px-2 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-medium cursor-pointer"
                                >
                                  确定召回？
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingRecallAgentId(null)}
                                  className="px-1.5 py-1 rounded bg-secondary/20 hover:bg-secondary/30 text-foreground text-[11px] font-medium cursor-pointer"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmingRecallAgentId(expert.id);
                                  setConfirmingDeleteAgentId(null);
                                }}
                                className="px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer bg-orange-50 hover:bg-orange-100 text-orange-600"
                              >
                                召回
                              </button>
                            )
                          ) : (
                            // 自定义专家删除 (解雇) 二阶段
                            isConfirmingDelete ? (
                              <div className="flex items-center space-x-1 animate-in fade-in duration-150">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmingDeleteAgentId(null);
                                    void handleRemoveExpertReal(expert);
                                  }}
                                  className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-medium cursor-pointer"
                                >
                                  确定删除？
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingDeleteAgentId(null)}
                                  className="px-1.5 py-1 rounded bg-secondary/20 hover:bg-secondary/30 text-foreground text-[11px] font-medium cursor-pointer"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmingDeleteAgentId(expert.id);
                                  setConfirmingRecallAgentId(null);
                                }}
                                className="px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer bg-red-50 hover:bg-red-100 text-red-600"
                              >
                                删除
                              </button>
                            )
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 删除会话的确认轻量弹窗 */}
      <Modal
        isOpen={!!sessionToDelete}
        onClose={() => setSessionToDelete(null)}
        className="w-[320px] bg-surface border border-border p-5 rounded-xl shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200 animate-duration-150"
      >
        <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-3">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">确定要删除这个对话任务吗？</h3>
        <p className="text-xs text-secondary mb-5 max-w-[240px] truncate">
          {sessionToDelete?.title || '未命名会话'}
        </p>
        <div className="flex w-full space-x-3">
          <button
            type="button"
            onClick={() => setSessionToDelete(null)}
            className="flex-1 py-1.5 rounded-lg border border-border bg-surface text-foreground text-xs font-medium hover:bg-secondary/10 active:bg-secondary/15 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={async (e) => {
              const targetSession = sessionToDelete;
              setSessionToDelete(null);
              if (targetSession) {
                await handleDeleteSession(e, targetSession.id);
              }
            }}
            className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 active:bg-red-700 transition-colors cursor-pointer"
          >
            确定删除
          </button>
        </div>
      </Modal>

      {/* 召回专家的确认轻量弹窗 */}
      <Modal
        isOpen={!!confirmingRecallAgentId}
        onClose={() => setConfirmingRecallAgentId(null)}
        className="w-[320px] bg-surface border border-border p-5 rounded-xl shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="w-10 h-10 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center mb-3">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">是否确认召回？</h3>
        <p className="text-xs text-secondary mb-5 max-w-[240px] truncate">
          召回后将从我的专家列表中移除：{agents.find(a => a.id === confirmingRecallAgentId)?.name}
        </p>
        <div className="flex w-full space-x-3">
          <button
            type="button"
            onClick={() => setConfirmingRecallAgentId(null)}
            className="flex-1 py-1.5 rounded-lg border border-border bg-surface text-foreground text-xs font-medium hover:bg-secondary/10 active:bg-secondary/15 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={async () => {
              const agentId = confirmingRecallAgentId;
              setConfirmingRecallAgentId(null);
              if (agentId) {
                const updated = await agentService.updateAgent(agentId, { enabled: false });
                if (updated) {
                  await agentService.loadAgents();
                  if (currentAgentId === agentId) {
                    agentService.switchAgent(AgentId.Main);
                  }
                }
              }
            }}
            className="flex-1 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 active:bg-orange-800 transition-colors cursor-pointer"
          >
            确认召回
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default MyAgentSidebarTree;
