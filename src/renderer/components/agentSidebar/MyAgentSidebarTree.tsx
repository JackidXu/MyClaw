import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { PlusIcon } from '@heroicons/react/24/outline';
import { AgentId } from '@shared/agent';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { agentService } from '../../services/agent';
import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import { RootState } from '../../store';
import { selectCurrentSessionId } from '../../store/selectors/coworkSelectors';
import { setDraftCollaborationMode, setDraftProjectId } from '../../store/slices/coworkSlice';
import { clearSelection } from '../../store/slices/quickActionSlice';
import { CoworkCollaborationMode } from '../../types/cowork';
import { isDefaultAgentId } from '../../utils/agentDisplay';
import {
  type CoworkOpenShareOptionsEventDetail,
  CoworkUiEvent,
} from '../cowork/constants';
import Tooltip, { TooltipAlign, TooltipPosition } from '../ui/Tooltip';
import AgentSidebarActivityView from './AgentSidebarActivityView';
import AgentTaskRow from './AgentTaskRow';
import {
  type AgentSidebarBatchItem,
  createSessionBatchItem,
  createSessionBatchKey,
} from './batchSelection';
import ExpandAgentTasksRow from './ExpandAgentTasksRow';
import MyAgentSidebarHeader from './MyAgentSidebarHeader';
import { ProjectTreeNode } from './ProjectTreeNode';
import type {
  AgentSidebarActivityItem,
  AgentSidebarActivityView as AgentSidebarActivityViewModel,
} from './taskFilter';
import { buildAgentSidebarActivityView } from './taskFilter';
import type { AgentSidebarProjectNode, AgentSidebarTaskNode } from './types';
import { useAgentSidebarState } from './useAgentSidebarState';

interface MyAgentSidebarTreeProps {
  isBatchMode: boolean;
  batchAgentId: string | null;
  deletedSessionIds: string[];
  selectedKeys: Set<string>;
  isTaskFilterActive: boolean;
  onShowCowork: () => void;
  onShowExperts?: () => void;
  onTaskFilterSummaryChange: (hasUnreadCompletedTasks: boolean) => void;
  onTaskSelected?: (params: {
    agentType: 'main' | 'custom';
    isCurrentSession: boolean;
    taskStatus: string;
  }) => void;
  onSidebarAction?: (actionType: string, params?: {
    agentType?: 'main' | 'custom';
    hasActiveSubagent?: boolean;
    isCurrentSession?: boolean;
    isCurrentSubagent?: boolean;
    isExpanded?: boolean;
    isPinned?: boolean;
    result?: 'success' | 'failed';
    subagentStatus?: string;
    targetPinned?: boolean;
    taskStatus?: string;
    visibleTaskCount?: number;
  }) => void;
  onToggleSelection: (selectionKey: string, agentId: string) => void;
  onEnterBatchMode: (sessionId: string, agentId: string) => void;
  onBatchSelectableItemsChange: (items: AgentSidebarBatchItem[]) => void;
}

const EMPTY_TASK_ACTIVITY_VIEW: AgentSidebarActivityViewModel = {
  priority: [],
  recent: [],
};

const logTaskNavigationIssue = (
  level: 'warn' | 'error',
  message: string,
  error?: unknown,
): void => {
  if (level === 'error') {
    console.error(`[AgentSidebar] ${message}`, error);
  } else {
    console.warn(`[AgentSidebar] ${message}`);
  }
  const persistedMessage = error === undefined
    ? message
    : `${message} error=${error instanceof Error ? error.message : String(error)}`;
  try {
    window.electron?.log?.fromRenderer?.(level, 'AgentSidebar', persistedMessage);
  } catch {
    // Best-effort renderer diagnostics only.
  }
};

const SortableProjectNode: React.FC<{
  project: AgentSidebarProjectNode;
  disabled: boolean;
  children: React.ReactNode;
}> = ({ project, disabled, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, disabled });
  const verticalTransform = transform
    ? `translate3d(0, ${Math.round(transform.y)}px, 0)`
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: verticalTransform,
        transition,
      }}
      className={`${disabled ? '' : 'cursor-grab active:cursor-grabbing'} ${isDragging ? 'relative z-50 opacity-80' : ''}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};

const MyAgentSidebarTree: React.FC<MyAgentSidebarTreeProps> = ({
  isBatchMode,
  batchAgentId,
  deletedSessionIds,
  selectedKeys,
  isTaskFilterActive,
  onShowCowork,
  onShowExperts: _onShowExperts,
  onTaskFilterSummaryChange,
  onTaskSelected,
  onSidebarAction,
  onToggleSelection,
  onEnterBatchMode,
  onBatchSelectableItemsChange,
}) => {
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const dispatch = useDispatch();
  const currentSessionId = useSelector(selectCurrentSessionId);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const {
    chatTasks,
    allChatTasks,
    projectNodes,
    activityAgentNodes,
    hasUnreadCompletedTasks,
    canExpandTasks,
    canCollapseTasks,
    isLoadingTasks,
    hasLoadError,
    patchTaskPreview,
    removeTaskPreview,
    removeTaskPreviews,
    retryLoadTasks,
    loadMoreTasks,
    collapseTasks,
    toggleProjectExpanded,
    expandProject,
  } = useAgentSidebarState({ includeActivityTasks: isTaskFilterActive });

  const activityView = useMemo(
    () => (
      isTaskFilterActive
        ? buildAgentSidebarActivityView(activityAgentNodes)
        : EMPTY_TASK_ACTIVITY_VIEW
    ),
    [activityAgentNodes, isTaskFilterActive],
  );

  useEffect(() => {
    onTaskFilterSummaryChange(hasUnreadCompletedTasks);
  }, [hasUnreadCompletedTasks, onTaskFilterSummaryChange]);

  const getAgentType = useCallback((agentId: string): 'main' | 'custom' => (
    isDefaultAgentId(agentId) ? 'main' : 'custom'
  ), []);

  const getTaskActionParams = useCallback((task: AgentSidebarTaskNode, hasActiveSubagent?: boolean) => ({
    agentType: getAgentType(task.agentId),
    hasActiveSubagent,
    isCurrentSession: task.id === currentSessionId,
    isPinned: task.pinned,
    taskStatus: task.status,
  }), [currentSessionId, getAgentType]);

  useEffect(() => {
    void agentService.loadAgents();
  }, []);

  const handleSelectTask = useCallback(async (task: AgentSidebarTaskNode) => {
    onTaskSelected?.({
      agentType: isDefaultAgentId(task.agentId) ? 'main' : 'custom',
      isCurrentSession: task.id === currentSessionId,
      taskStatus: task.status,
    });
    try {
      if (task.agentId !== currentAgentId) {
        agentService.switchAgent(task.agentId, { targetSessionId: task.id });
        await coworkService.loadSessions(task.agentId);
      }
      onShowCowork();
      // 清除子 agent 详情视图，显示主会话详情
      window.dispatchEvent(new CustomEvent(CoworkUiEvent.SelectSubagent, { detail: null }));
      const session = await coworkService.loadSession(task.id);
      if (!session) {
        logTaskNavigationIssue(
          'warn',
          `failed to open task session ${task.id} for agent ${task.agentId}.`,
        );
        window.dispatchEvent(new CustomEvent('app:showToast', {
          detail: i18nService.t('sidebarTaskOpenFailed'),
        }));
      }
      return session;
    } catch (error) {
      logTaskNavigationIssue(
        'error',
        `task navigation rejected for session ${task.id} and agent ${task.agentId}.`,
        error,
      );
      window.dispatchEvent(new CustomEvent('app:showToast', {
        detail: i18nService.t('sidebarTaskOpenFailed'),
      }));
      return null;
    } finally {
      coworkService.finishSessionNavigation(task.id);
    }
  }, [currentAgentId, currentSessionId, onShowCowork, onTaskSelected]);

  const handleDeleteTask = async (task: AgentSidebarTaskNode) => {
    const deleted = await coworkService.deleteSession(task.id);
    onSidebarAction?.(deleted ? 'task_delete_success' : 'task_delete_failed', {
      ...getTaskActionParams(task),
      result: deleted ? 'success' : 'failed',
    });
    if (deleted) {
      removeTaskPreview(task.id);
    }
  };

  const handleToggleTaskPin = async (task: AgentSidebarTaskNode, pinned: boolean) => {
    const result = await coworkService.setSessionPinned(task.id, pinned);
    onSidebarAction?.('task_pin_toggle', {
      ...getTaskActionParams(task),
      result: result.success ? 'success' : 'failed',
      targetPinned: pinned,
    });
    if (result.success) {
      patchTaskPreview(task.id, { pinned, pinOrder: result.pinOrder }, { preserveUpdatedAt: true });
    }
  };

  const handleRenameTask = async (task: AgentSidebarTaskNode, title: string) => {
    const renamed = await coworkService.renameSession(task.id, title);
    onSidebarAction?.('task_rename_submit', {
      ...getTaskActionParams(task),
      result: renamed ? 'success' : 'failed',
    });
    if (renamed) {
      patchTaskPreview(task.id, { title }, { preserveUpdatedAt: true });
    }
  };

  const handleShareTask = async (task: AgentSidebarTaskNode) => {
    onSidebarAction?.('task_share_open', getTaskActionParams(task));
    const session = await handleSelectTask(task);
    if (!session) return;

    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent<CoworkOpenShareOptionsEventDetail>(
        CoworkUiEvent.OpenShareOptions,
        { detail: { sessionId: task.id } },
      ));
    }, 0);
  };

  const handleEnterBatchMode = (task: AgentSidebarTaskNode) => {
    onEnterBatchMode(task.id, task.agentId);
  };

  const handleCreateProject = useCallback(async () => {
    await coworkService.createProject({ name: i18nService.t('createProject') });
  }, []);

  const handleCreateProjectTask = useCallback((project: AgentSidebarProjectNode) => {
    expandProject(project.id);
    coworkService.clearSession();
    dispatch(clearSelection());
    dispatch(setDraftCollaborationMode({
      draftKey: '__home__',
      mode: CoworkCollaborationMode.Default,
    }));
    dispatch(setDraftProjectId(project.id));
    onShowCowork();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(CoworkUiEvent.FocusInput, {
        detail: { clear: false, resetCollaborationMode: true },
      }));
    }, 0);
  }, [dispatch, expandProject, onShowCowork]);

  const handleReorderProjects = useCallback(async (
    activeId: string,
    overId: string,
    currentProjects: AgentSidebarProjectNode[],
  ) => {
    const oldIndex = currentProjects.findIndex((p) => p.id === activeId);
    const newIndex = currentProjects.findIndex((p) => p.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const reorderedIds = arrayMove(currentProjects.map((p) => p.id), oldIndex, newIndex);
    const updated = await coworkService.reorderProjects(reorderedIds);
    if (!updated) {
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('agentReorderFailed') }));
    }
  }, []);

  // 新建对话（默认以主专家新建）
  const handleCreateChat = useCallback(() => {
    if (currentAgentId !== AgentId.Main) {
      agentService.switchAgent(AgentId.Main);
      void coworkService.loadSessions(AgentId.Main);
    }
    coworkService.clearSession({ restoreAgentSkills: true });
    dispatch(clearSelection());
    dispatch(setDraftCollaborationMode({
      draftKey: '__home__',
      mode: CoworkCollaborationMode.Default,
    }));
    dispatch(setDraftProjectId(null));
    onShowCowork();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(CoworkUiEvent.FocusInput, {
        detail: { clear: false, resetCollaborationMode: true },
      }));
    }, 0);
  }, [currentAgentId, dispatch, onShowCowork]);

  useEffect(() => {
    if (deletedSessionIds.length === 0) return;
    removeTaskPreviews(deletedSessionIds);
  }, [deletedSessionIds, removeTaskPreviews]);

  // 同步批量操作可选会话列表
  useEffect(() => {
    if (!isBatchMode) {
      onBatchSelectableItemsChange([]);
      return;
    }

    const items = allChatTasks.map((task): AgentSidebarBatchItem => createSessionBatchItem(task.id));
    onBatchSelectableItemsChange(items);
  }, [allChatTasks, isBatchMode, onBatchSelectableItemsChange]);

  const renderActivityTask = (item: AgentSidebarActivityItem) => {
    const { task } = item;
    return (
      <AgentTaskRow
        key={task.id}
        task={task}
        isBatchMode={isBatchMode}
        isSelected={selectedKeys.has(createSessionBatchKey(task.id))}
        contextLabel={undefined}
        contextIcon={undefined}
        isSelectionDisabled={false}
        showBatchOption={!isBatchMode}
        onSelect={() => void handleSelectTask(task)}
        onDelete={() => handleDeleteTask(task)}
        onShare={() => handleShareTask(task)}
        onTogglePin={(pinned) => handleToggleTaskPin(task, pinned)}
        onRename={(title) => handleRenameTask(task, title)}
        onToggleSelection={() => onToggleSelection(createSessionBatchKey(task.id), task.agentId)}
        onEnterBatchMode={() => handleEnterBatchMode(task)}
        onSidebarAction={onSidebarAction}
        analyticsParams={getTaskActionParams(task)}
      />
    );
  };

  return (
    <div className="pb-3">
      {isTaskFilterActive ? (
        <AgentSidebarActivityView activity={activityView} renderTask={renderActivityTask} />
      ) : (
        <div role="tree" aria-label={i18nService.t('myChats')}>
          {/* 我的项目 */}
          <div className="space-y-0.5">
            <div className="group sticky top-0 z-30 -ml-[6px] flex h-9 w-[calc(100%+12px)] items-center justify-between bg-surface-raised pl-3 pr-1">
              <h2 className="min-w-0 truncate text-[12px] font-medium text-secondary/75 tracking-wide">
                {i18nService.t('myProjects')}
              </h2>
              <Tooltip
                content={i18nService.t('createProject')}
                position={TooltipPosition.Bottom}
                align={TooltipAlign.End}
                delay={300}
                className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
              >
                <button
                  type="button"
                  onClick={() => void handleCreateProject()}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-secondary/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                  aria-label={i18nService.t('createProject')}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </div>
            {projectNodes.length === 0 ? (
              <div className="-ml-[6px] flex h-7 w-[calc(100%+12px)] items-center pl-3 pr-2.5 text-xs text-secondary/50">
                {i18nService.t('noProjectsYet')}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event: DragEndEvent) => {
                  const activeId = String(event.active.id);
                  const overId = event.over?.id ? String(event.over.id) : '';
                  if (!overId) return;
                  void handleReorderProjects(activeId, overId, projectNodes);
                }}
              >
                <SortableContext
                  items={projectNodes.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {projectNodes.map((project) => (
                    <SortableProjectNode
                      key={project.id}
                      project={project}
                      disabled={project.isExpanded || isBatchMode}
                    >
                      <ProjectTreeNode
                        project={project}
                        isBatchMode={isBatchMode}
                        batchAgentId={batchAgentId}
                        selectedKeys={selectedKeys}
                        onToggleExpanded={toggleProjectExpanded}
                        onCreateTask={handleCreateProjectTask}
                        onSelectTask={(task) => void handleSelectTask(task)}
                        onDeleteTask={handleDeleteTask}
                        onShareTask={handleShareTask}
                        onToggleTaskPin={handleToggleTaskPin}
                        onRenameTask={handleRenameTask}
                        onToggleSelection={onToggleSelection}
                        onEnterBatchMode={handleEnterBatchMode}
                        onSidebarAction={onSidebarAction}
                        getTaskActionParams={getTaskActionParams}
                      />
                    </SortableProjectNode>
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* 我的对话头部 */}
          <MyAgentSidebarHeader
            onCreateChat={handleCreateChat}
          />

          {/* 我的对话列表（极简单行渲染） */}
          {chatTasks.length === 0 ? (
            <div className="-ml-[6px] flex h-7 w-[calc(100%+12px)] items-center pl-3 pr-2.5 text-xs text-secondary/50">
              {i18nService.t('noChatsYet')}
            </div>
          ) : (
            <div className="space-y-0.5">
              {chatTasks.map((task) => (
                <AgentTaskRow
                  key={task.id}
                  task={task}
                  isBatchMode={isBatchMode}
                  isSelected={selectedKeys.has(createSessionBatchKey(task.id))}
                  contextLabel={undefined}
                  contextIcon={undefined}
                  isSelectionDisabled={false}
                  showBatchOption={!isBatchMode}
                  onSelect={() => void handleSelectTask(task)}
                  onDelete={() => handleDeleteTask(task)}
                  onShare={() => handleShareTask(task)}
                  onTogglePin={(pinned) => handleToggleTaskPin(task, pinned)}
                  onRename={(title) => handleRenameTask(task, title)}
                  onToggleSelection={() => onToggleSelection(createSessionBatchKey(task.id), task.agentId)}
                  onEnterBatchMode={() => handleEnterBatchMode(task)}
                  onSidebarAction={onSidebarAction}
                  analyticsParams={getTaskActionParams(task)}
                />
              ))}

              {hasLoadError && (
                <button
                  type="button"
                  onClick={() => void retryLoadTasks()}
                  className="-ml-[6px] flex h-7 w-[calc(100%+12px)] items-center rounded-md pl-[38px] pr-2.5 text-left text-[13px] text-red-500 transition-colors hover:bg-red-500/10"
                >
                  {i18nService.t('myAgentSidebarLoadFailed')}
                </button>
              )}

              {(canExpandTasks || canCollapseTasks) && (
                <ExpandAgentTasksRow
                  isLoading={isLoadingTasks}
                  label={canExpandTasks
                    ? i18nService.t('myAgentSidebarExpandMore')
                    : i18nService.t('myAgentSidebarCollapse')}
                  onClick={() => {
                    if (canExpandTasks) {
                      void loadMoreTasks();
                    } else {
                      collapseTasks();
                    }
                  }}
                  secondaryLabel={canExpandTasks && canCollapseTasks
                    ? i18nService.t('myAgentSidebarCollapse')
                    : undefined}
                  onSecondaryClick={canExpandTasks && canCollapseTasks
                    ? () => collapseTasks()
                    : undefined}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MyAgentSidebarTree;
