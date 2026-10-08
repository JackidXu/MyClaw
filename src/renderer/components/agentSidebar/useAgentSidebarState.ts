import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { coworkService } from '../../services/cowork';
import { localStore } from '../../services/store';
import { RootState } from '../../store';
import {
  selectCompletedUnreadSessionIds,
  selectCoworkSessions,
  selectCurrentSessionId,
  selectPendingPermissionSessionIds,
} from '../../store/selectors/coworkSelectors';
import type { CoworkSessionSummary } from '../../types/cowork';
import { CoworkSessionStatusValue } from '../../types/cowork';
import {
  AgentSidebarIndicator,
  AgentSidebarPageSize,
  AgentSidebarPreferenceKey,
} from './constants';
import {
  isScheduledTaskSession,
} from './scheduledTaskSession';
import type {
  AgentSidebarAgentNode,
  AgentSidebarAgentSummary,
  AgentSidebarPreferenceState,
  AgentSidebarProjectNode,
  AgentSidebarTaskNode,
} from './types';

const normalizeAgentId = (agentId?: string) => agentId?.trim() || 'main';

const logAgentSidebarLoadIssue = (
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

export const logAgentSidebarDebug = (message: string): void => {
  console.debug(`[AgentSidebar] ${message}`);
  try {
    window.electron?.log?.fromRenderer?.('debug', 'AgentSidebar', message);
  } catch {
    // Best-effort renderer diagnostics only.
  }
};

const hasSessionChanged = (
  previous: CoworkSessionSummary,
  next: CoworkSessionSummary,
): boolean => {
  return previous.title !== next.title
    || previous.scheduledTaskId !== next.scheduledTaskId
    || previous.status !== next.status
    || previous.pinned !== next.pinned
    || previous.pinOrder !== next.pinOrder
    || previous.imPlatform !== next.imPlatform
    || previous.parentSessionId !== next.parentSessionId
    || previous.updatedAt !== next.updatedAt
    || previous.createdAt !== next.createdAt
    || previous.projectId !== next.projectId
    || normalizeAgentId(previous.agentId) !== normalizeAgentId(next.agentId);
};

const mergeSessions = (
  current: CoworkSessionSummary[],
  incoming: CoworkSessionSummary[],
): CoworkSessionSummary[] => {
  const byId = new Map<string, CoworkSessionSummary>();
  current.forEach((session) => byId.set(session.id, session));
  incoming.forEach((session) => byId.set(session.id, session));
  return Array.from(byId.values());
};

export const deriveAgentSidebarIndicator = (
  session: CoworkSessionSummary,
  completedUnreadSessionIds: Set<string>,
  pendingPermissionSessionIds: Set<string>,
) => {
  if (pendingPermissionSessionIds.has(session.id)) {
    return AgentSidebarIndicator.PendingPermission;
  }
  if (completedUnreadSessionIds.has(session.id)) {
    return AgentSidebarIndicator.CompletedUnread;
  }
  if (session.status === CoworkSessionStatusValue.Running) {
    return AgentSidebarIndicator.Running;
  }
  if (session.status === CoworkSessionStatusValue.Error) {
    return AgentSidebarIndicator.Error;
  }
  return AgentSidebarIndicator.None;
};

export const sortAgentSidebarTasks = (
  tasks: CoworkSessionSummary[],
): CoworkSessionSummary[] => {
  return [...tasks].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) {
      const aPinOrder = a.pinOrder ?? a.updatedAt ?? a.createdAt;
      const bPinOrder = b.pinOrder ?? b.updatedAt ?? b.createdAt;
      if (aPinOrder !== bPinOrder) return aPinOrder - bPinOrder;
    }
    const aUpdatedAt = a.updatedAt || a.createdAt;
    const bUpdatedAt = b.updatedAt || b.createdAt;
    if (bUpdatedAt !== aUpdatedAt) return bUpdatedAt - aUpdatedAt;
    return b.createdAt - a.createdAt;
  });
};

export const sortAgentSidebarAgents = (
  agents: AgentSidebarAgentSummary[],
): AgentSidebarAgentSummary[] => {
  return [...agents].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aSortOrder = a.sortOrder ?? (a.pinned ? a.pinOrder : null) ?? Number.MAX_SAFE_INTEGER;
    const bSortOrder = b.sortOrder ?? (b.pinned ? b.pinOrder : null) ?? Number.MAX_SAFE_INTEGER;
    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
    return 0;
  });
};

export const toAgentSidebarTaskNode = (
  session: CoworkSessionSummary,
  currentSessionId: string | null,
  completedUnreadSessionIds: Set<string>,
  pendingPermissionSessionIds: Set<string>,
): AgentSidebarTaskNode => {
  return {
    id: session.id,
    agentId: normalizeAgentId(session.agentId),
    title: session.title,
    isScheduledTask: isScheduledTaskSession(
      session.scheduledTaskId,
      session.title,
      session.parentSessionId,
    ),
    projectId: session.projectId ?? null,
    status: session.status,
    pinned: session.pinned,
    pinOrder: session.pinOrder ?? null,
    imPlatform: session.imPlatform ?? null,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    indicator: deriveAgentSidebarIndicator(
      session,
      completedUnreadSessionIds,
      pendingPermissionSessionIds,
    ),
    isSelected: session.id === currentSessionId,
  };
};

export const collapseAgentSidebarTaskList = (
  expandedTaskListAgentIds: string[],
  agentId: string,
) => {
  return expandedTaskListAgentIds.includes(agentId)
    ? expandedTaskListAgentIds.filter((id) => id !== agentId)
    : expandedTaskListAgentIds;
};

export const removeAgentSidebarTaskPreviews = (
  previewsByAgentId: Record<string, CoworkSessionSummary[]>,
  sessionIds: Iterable<string>,
): Record<string, CoworkSessionSummary[]> => {
  const sessionIdSet = new Set(sessionIds);
  if (sessionIdSet.size === 0) return previewsByAgentId;

  let changed = false;
  const next = { ...previewsByAgentId };

  Object.entries(previewsByAgentId).forEach(([agentId, tasks]) => {
    if (!tasks.some((task) => sessionIdSet.has(task.id))) return;
    next[agentId] = tasks.filter((task) => !sessionIdSet.has(task.id));
    changed = true;
  });

  return changed ? next : previewsByAgentId;
};

export const removeAgentSidebarAgentTaskPreviews = (
  previewsByAgentId: Record<string, CoworkSessionSummary[]>,
  agentId: string,
): Record<string, CoworkSessionSummary[]> => {
  if (!Object.prototype.hasOwnProperty.call(previewsByAgentId, agentId)) {
    return previewsByAgentId;
  }

  const next = { ...previewsByAgentId };
  delete next[agentId];
  return next;
};

export const useAgentSidebarState = ({
  includeActivityTasks = false,
}: {
  includeActivityTasks?: boolean;
} = {}) => {
  const agents = useSelector((state: RootState) => state.agent.agents);
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const currentSessionId = useSelector(selectCurrentSessionId);
  const sessions = useSelector(selectCoworkSessions);
  const projects = useSelector((state: RootState) => state.cowork.projects);
  const completedUnreadSessionIds = useSelector(selectCompletedUnreadSessionIds);
  const pendingPermissionSessionIds = useSelector(selectPendingPermissionSessionIds);

  const [localSessions, setLocalSessions] = useState<CoworkSessionSummary[]>([]);
  const [hasMoreSessions, setHasMoreSessions] = useState<boolean>(false);
  const [visibleTaskLimit, setVisibleTaskLimit] = useState<number>(AgentSidebarPageSize.Preview);
  const [isTaskListExpanded, setIsTaskListExpanded] = useState<boolean>(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState<boolean>(false);
  const [hasLoadError, setHasLoadError] = useState<boolean>(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);

  const initialLoadedRef = useRef(false);
  const isLoadingRef = useRef(false);

  const completedUnreadSessionIdSet = useMemo(
    () => new Set(completedUnreadSessionIds),
    [completedUnreadSessionIds],
  );
  const pendingPermissionSessionIdSet = useMemo(
    () => new Set(pendingPermissionSessionIds),
    [pendingPermissionSessionIds],
  );
  const expandedProjectIdSet = useMemo(() => new Set(expandedProjectIds), [expandedProjectIds]);

  // 从本地存储还原偏好状态
  useEffect(() => {
    let cancelled = false;
    void localStore.getItem<AgentSidebarPreferenceState>(AgentSidebarPreferenceKey.State)
      .then((preference) => {
        if (cancelled) return;
        setExpandedProjectIds(preference?.expandedProjectIds ?? []);
      })
      .finally(() => {
        if (!cancelled) {
          setPreferenceLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 保存偏好状态
  useEffect(() => {
    if (!preferenceLoaded) return;
    const preference: AgentSidebarPreferenceState = {
      expandedAgentIds: [],
      expandedTaskListAgentIds: [],
      expandedProjectIds,
      selectedAgentId: currentAgentId,
      selectedTaskId: currentSessionId ?? undefined,
    };
    void localStore.setItem(AgentSidebarPreferenceKey.State, preference);
  }, [currentAgentId, currentSessionId, expandedProjectIds, preferenceLoaded]);

  // 初始加载所有会话预览
  const loadInitialSessions = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoadingTasks(true);
    setHasLoadError(false);

    try {
      const result = await coworkService.listSessionsForAgentPreview(
        undefined,
        AgentSidebarPageSize.Preview,
        0,
      );
      if (!result.success) {
        logAgentSidebarLoadIssue(
          'warn',
          `failed to load initial chat sessions: ${result.error ?? 'unknown error'}.`,
        );
        setHasLoadError(true);
        return;
      }
      setLocalSessions(result.sessions ?? []);
      setHasMoreSessions(result.hasMore ?? false);
      initialLoadedRef.current = true;
    } catch (error) {
      logAgentSidebarLoadIssue('error', 'initial chat session request rejected', error);
      setHasLoadError(true);
    } finally {
      isLoadingRef.current = false;
      setIsLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialSessions();
  }, [loadInitialSessions]);

  // 当 Redux 中的 sessions 发生变化时，实时同步更新本地会话列表
  useEffect(() => {
    if (sessions.length === 0) return;
    setLocalSessions((previous) => {
      let changed = false;
      const next = [...previous];

      sessions.forEach((session) => {
        const index = next.findIndex((item) => item.id === session.id);
        if (index === -1) {
          if (initialLoadedRef.current) {
            next.unshift(session);
            changed = true;
          }
          return;
        }

        if (hasSessionChanged(next[index], session)) {
          next[index] = session;
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [sessions]);

  // 展开更多对话（加载下一批）
  const loadMoreTasks = useCallback(async () => {
    const nextLimit = visibleTaskLimit + AgentSidebarPageSize.ExpandBatch;
    setIsTaskListExpanded(true);
    setVisibleTaskLimit(nextLimit);

    // 计算当前非项目的会话数量
    const currentChatSessions = localSessions.filter((s) => !s.projectId);
    if (currentChatSessions.length >= nextLimit || !hasMoreSessions) {
      return;
    }

    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoadingTasks(true);
    setHasLoadError(false);

    try {
      const offset = localSessions.length;
      const limit = Math.max(AgentSidebarPageSize.ExpandBatch, nextLimit - currentChatSessions.length);
      const result = await coworkService.listSessionsForAgentPreview(undefined, limit, offset);
      if (!result.success) {
        logAgentSidebarLoadIssue(
          'warn',
          `failed to load more chat sessions: ${result.error ?? 'unknown error'}.`,
        );
        setHasLoadError(true);
        return;
      }
      setLocalSessions((previous) => mergeSessions(previous, result.sessions ?? []));
      setHasMoreSessions(result.hasMore ?? false);
    } catch (error) {
      logAgentSidebarLoadIssue('error', 'load-more chat sessions request rejected', error);
      setHasLoadError(true);
    } finally {
      isLoadingRef.current = false;
      setIsLoadingTasks(false);
    }
  }, [hasMoreSessions, localSessions, visibleTaskLimit]);

  // 折叠收起对话
  const collapseTasks = useCallback(() => {
    setIsTaskListExpanded(false);
    setVisibleTaskLimit(AgentSidebarPageSize.Preview);
  }, []);

  const retryLoadTasks = useCallback(() => {
    return loadInitialSessions();
  }, [loadInitialSessions]);

  const toggleProjectExpanded = useCallback((projectId: string) => {
    setExpandedProjectIds((previous) => {
      return previous.includes(projectId)
        ? previous.filter((id) => id !== projectId)
        : [...previous, projectId];
    });
  }, []);

  const expandProject = useCallback((projectId: string) => {
    setExpandedProjectIds((previous) => {
      return previous.includes(projectId) ? previous : [...previous, projectId];
    });
  }, []);

  // 局部修改会话信息（标题、置顶等）
  const patchTaskPreview = useCallback((
    sessionId: string,
    updates: Partial<Pick<CoworkSessionSummary, 'title' | 'pinned' | 'pinOrder' | 'status'>>,
    options: { preserveUpdatedAt?: boolean } = {},
  ) => {
    setLocalSessions((previous) => {
      const index = previous.findIndex((s) => s.id === sessionId);
      if (index === -1) return previous;
      const next = [...previous];
      next[index] = {
        ...next[index],
        ...updates,
        updatedAt: options.preserveUpdatedAt ? next[index].updatedAt : Date.now(),
      };
      return next;
    });
  }, []);

  // 移除单个会话
  const removeTaskPreview = useCallback((sessionId: string) => {
    setLocalSessions((previous) => previous.filter((s) => s.id !== sessionId));
  }, []);

  // 批量移除会话
  const removeTaskPreviews = useCallback((sessionIds: string[]) => {
    const idSet = new Set(sessionIds);
    setLocalSessions((previous) => previous.filter((s) => !idSet.has(s.id)));
  }, []);

  const removeAgentTaskPreviews = useCallback((agentId: string) => {
    setLocalSessions((previous) => previous.filter((s) => normalizeAgentId(s.agentId) !== normalizeAgentId(agentId)));
  }, []);

  // 合并 localSessions 与 Redux 中的 sessions
  const allSessions = useMemo(() => {
    const map = new Map<string, CoworkSessionSummary>();
    localSessions.forEach((s) => map.set(s.id, s));
    sessions.forEach((s) => {
      if (!map.has(s.id)) {
        map.set(s.id, s);
      }
    });
    return Array.from(map.values());
  }, [localSessions, sessions]);

  // 区分项目会话与常规对话
  const {
    chatTasks,
    allChatTasks,
    projectNodes,
    hasUnreadCompletedTasks,
    canExpandTasks,
    canCollapseTasks,
  } = useMemo(() => {
    const nonProjectSessions = allSessions.filter((s) => !s.projectId);
    const sortedChatSessions = sortAgentSidebarTasks(nonProjectSessions);

    const hasUnread = sortedChatSessions.some((s) => completedUnreadSessionIdSet.has(s.id));
    const canExpand = hasMoreSessions || sortedChatSessions.length > visibleTaskLimit;
    const canCollapse = visibleTaskLimit > AgentSidebarPageSize.Preview || isTaskListExpanded;

    const visibleSessions = sortedChatSessions.slice(0, visibleTaskLimit);
    const mappedChatTasks: AgentSidebarTaskNode[] = visibleSessions.map((session) =>
      toAgentSidebarTaskNode(
        session,
        currentSessionId,
        completedUnreadSessionIdSet,
        pendingPermissionSessionIdSet,
      ),
    );

    const allMappedChatTasks: AgentSidebarTaskNode[] = sortedChatSessions.map((session) =>
      toAgentSidebarTaskNode(
        session,
        currentSessionId,
        completedUnreadSessionIdSet,
        pendingPermissionSessionIdSet,
      ),
    );

    // 组装项目节点
    const projectsList: AgentSidebarProjectNode[] = [...projects]
      .map((proj) => {
        const projTasks = allSessions.filter((s) => s.projectId === proj.id);
        const sortedProjTasks = sortAgentSidebarTasks(projTasks);
        const tasks = sortedProjTasks.map((s) =>
          toAgentSidebarTaskNode(
            s,
            currentSessionId,
            completedUnreadSessionIdSet,
            pendingPermissionSessionIdSet,
          ),
        );
        const latestTaskActivity = projTasks.reduce(
          (max, task) => Math.max(max, task.updatedAt || task.createdAt),
          0,
        );
        const latestActivity = Math.max(latestTaskActivity, proj.updatedAt || proj.createdAt || 0);

        return {
          id: proj.id,
          name: proj.name,
          sortOrder: proj.sortOrder,
          latestActivity,
          isExpanded: expandedProjectIdSet.has(proj.id),
          tasks,
        };
      })
      .sort((a, b) => {
        if (b.latestActivity !== a.latestActivity) {
          return b.latestActivity - a.latestActivity;
        }
        const aSort = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const bSort = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        return aSort - bSort;
      })
      .map(({ latestActivity: _latestActivity, ...node }) => node);

    return {
      chatTasks: mappedChatTasks,
      allChatTasks: allMappedChatTasks,
      projectNodes: projectsList,
      hasUnreadCompletedTasks: hasUnread,
      canExpandTasks: canExpand,
      canCollapseTasks: canCollapse,
    };
  }, [
    allSessions,
    completedUnreadSessionIdSet,
    currentSessionId,
    expandedProjectIdSet,
    hasMoreSessions,
    isTaskListExpanded,
    pendingPermissionSessionIdSet,
    projects,
    visibleTaskLimit,
  ]);

  // 用于活动任务过滤器的兼容数据（如果顶部筛选器开启）
  const activityAgentNodes = useMemo<AgentSidebarAgentNode[]>(() => {
    if (!includeActivityTasks) return [];
    const agentMap = new Map<string, AgentSidebarAgentNode>();
    agents.forEach((a) => {
      agentMap.set(a.id, {
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        enabled: a.enabled,
        pinned: a.pinned ?? false,
        pinOrder: a.pinOrder ?? null,
        sortOrder: a.sortOrder ?? null,
        isExpanded: true,
        isTaskListExpanded: false,
        canExpandTasks: false,
        canCollapseTasks: false,
        isLoadingTasks: false,
        hasLoadError: false,
        tasks: [],
      });
    });

    chatTasks.forEach((task) => {
      const node = agentMap.get(task.agentId);
      if (node) {
        node.tasks.push(task);
      }
    });

    return Array.from(agentMap.values()).filter((n) => n.tasks.length > 0);
  }, [agents, chatTasks, includeActivityTasks]);

  return {
    chatTasks,
    allChatTasks,
    agentNodes: [] as AgentSidebarAgentNode[],
    projectNodes,
    activityAgentNodes,
    hasUnreadCompletedTasks,
    expandedTaskListAgentIds: [] as string[],
    canExpandTasks,
    canCollapseTasks,
    isLoadingTasks,
    hasLoadError,
    patchTaskPreview,
    removeTaskPreview,
    removeTaskPreviews,
    removeAgentTaskPreviews,
    retryLoadTasks,
    loadMoreTasks,
    collapseTasks,
    expandAgent: () => undefined,
    collapseAgent: () => undefined,
    expandTasks: loadMoreTasks,
    toggleAgentExpanded: () => undefined,
    expandedProjectIdSet,
    toggleProjectExpanded,
    expandProject,
  };
};
