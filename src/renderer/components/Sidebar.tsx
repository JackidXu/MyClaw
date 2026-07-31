import { ArrowPathIcon, ExclamationTriangleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { AgentId } from '@shared/agent';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { agentService } from '../services/agent';
import { configService } from '../services/config';
import { coworkService } from '../services/cowork';
import { i18nService } from '../services/i18n';
import { LogReporterAction, reportYdAnalyzer } from '../services/logReporter';
import { RootState } from '../store';
import {
  selectCoworkSessions,
  selectCurrentSessionId,
  selectIsStreaming,
} from '../store/selectors/coworkSelectors';
import type { CoworkSessionSummary } from '../types/cowork';
import { getAgentDisplayNameById } from '../utils/agentDisplay';
import {
  type AgentSidebarBatchItem,
  AgentSidebarBatchItemKind,
  createSessionBatchKey,
} from './agentSidebar/batchSelection';
import MyAgentSidebarTree from './agentSidebar/MyAgentSidebarTree';
import BillingModal from './BillingModal';
import Modal from './common/Modal';
import { CoworkUiEvent } from './cowork/constants';
import CoworkSearchModal from './cowork/CoworkSearchModal';
import Cog6ToothIcon from './icons/Cog6ToothIcon';
import ComposeIcon from './icons/ComposeIcon';
import SidebarAutomationIcon from './icons/SidebarAutomationIcon';
import SidebarKitsIcon from './icons/SidebarKitsIcon';
import SidebarSitesIcon from './icons/SidebarSitesIcon';
import SidebarToggleIcon from './icons/SidebarToggleIcon';
import TrashIcon from './icons/TrashIcon';
import { PasswordModal } from './PasswordModal';
import PayModal from './PayModal';


interface SidebarProps {
  onShowSettings: () => void;
  onShowLogin?: () => void;
  activeView: 'cowork' | 'skills' | 'scheduledTasks' | 'kits' | 'mcp' | 'sites' | 'experts';
  onShowSkills: () => void;
  onShowCowork: () => void;
  onShowScheduledTasks: () => void;
  onShowKits: () => void;
  onShowExperts: () => void;
  onShowMcp: () => void;
  onShowSites: () => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  updateBadge?: React.ReactNode;
  onWidthChange?: (width: number) => void;
  updateNotice?: React.ReactNode;
  /** The expanded update card owns the sidebar bottom; temporarily hide the
   * promo banner while preserving it for a smooth return after collapse. */
  hideAdBanner?: boolean;
  hideLogin?: boolean;
  hideSites?: boolean;
}

const DEFAULT_SIDEBAR_WIDTH = 244;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;
const SIDEBAR_COLLAPSE_TRANSITION_MS = 200;
const normalizeAgentId = (agentId?: string | null) => agentId?.trim() || AgentId.Main;
const SidebarNewFeatureBadge = {
  KitsDismissedVersionKey: 'sidebar.kitsNewFeatureBadge.dismissedVersion',
  // Bump this value in a release when the kits entry should show the badge again.
  KitsVersion: '2026-06-05',
} as const;
const sidebarNavItemClassName =
  'w-full inline-flex h-7 items-center gap-2 rounded-md px-1.5 text-left text-sm font-normal text-foreground transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]';
const activeSidebarNavItemClassName =
  `${sidebarNavItemClassName} bg-black/[0.06] font-medium hover:bg-black/[0.06] dark:bg-white/[0.07] dark:hover:bg-white/[0.07]`;
const sidebarCreateIconClassName = 'h-4 w-4 shrink-0';

type SidebarAnalyticsSource = 'home_sidebar' | 'home_agent_sidebar';

interface SidebarAnalyticsOptions {
  activeView?: SidebarProps['activeView'];
  agentType?: 'main' | 'custom';
  hasActiveSubagent?: boolean;
  isCollapsed?: boolean;
  isCurrentSession?: boolean;
  isCurrentSubagent?: boolean;
  isExpanded?: boolean;
  isPinned?: boolean;
  isSelectAllChecked?: boolean;
  result?: 'success' | 'failed';
  selectedCount?: number;
  selectedSessionCount?: number;
  selectedSubagentCount?: number;
  selectableCount?: number;
  source?: SidebarAnalyticsSource;
  subagentStatus?: string;
  targetPinned?: boolean;
  targetSelected?: boolean;
  taskStatus?: string;
  visibleTaskCount?: number;
}

const reportSidebarAction = (
  actionType: string,
  options: SidebarAnalyticsOptions = {},
): void => {
  console.debug('[Sidebar] reporting sidebar action analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.SidebarAction,
    source: options.source ?? 'home_sidebar',
    actionType,
    activeView: options.activeView,
    agentType: options.agentType,
    hasActiveSubagent: options.hasActiveSubagent,
    isCollapsed: options.isCollapsed,
    isCurrentSession: options.isCurrentSession,
    isCurrentSubagent: options.isCurrentSubagent,
    isExpanded: options.isExpanded,
    isPinned: options.isPinned,
    isSelectAllChecked: options.isSelectAllChecked,
    result: options.result,
    selectedCount: options.selectedCount,
    selectedSessionCount: options.selectedSessionCount,
    selectedSubagentCount: options.selectedSubagentCount,
    selectableCount: options.selectableCount,
    subagentStatus: options.subagentStatus,
    targetPinned: options.targetPinned,
    targetSelected: options.targetSelected,
    taskStatus: options.taskStatus,
    visibleTaskCount: options.visibleTaskCount,
  });
};

const Sidebar: React.FC<SidebarProps> = ({
  onShowSettings,
  onShowLogin,
  activeView,
  onShowSkills,
  onShowCowork,
  onShowScheduledTasks,
  onShowKits,
  onShowExperts,
  onShowSites,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  onWidthChange,
  updateNotice,
  hideSites,
}) => {
  void onShowKits;
  void onShowSkills;
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const agents = useSelector((state: RootState) => state.agent.agents);
  const sessions = useSelector(selectCoworkSessions);
  const currentSessionId = useSelector(selectCurrentSessionId);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);

  // 用户卡片状态与逻辑
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [userNickname, setUserNickname] = useState('HeyClaw 用户');
  const [userAvatar, setUserAvatar] = useState('🐱');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [showConfirmDeactivate, setShowConfirmDeactivate] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const userCardContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 渲染头像辅助函数
  const renderAvatar = (avatarValue: string, nickname: string) => {
    if (avatarValue && avatarValue.startsWith('data:image/')) {
      return (
        <img 
          src={avatarValue} 
          alt={nickname} 
          className="w-full h-full object-cover rounded-full" 
        />
      );
    }
    return <span className="select-none text-lg">{avatarValue || '🐱'}</span>;
  };

  // 上传图片处理函数
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: '头像大小不能超过 2MB' }));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      if (typeof dataUrl === 'string') {
        setEditAvatar(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // 点击空白处关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userCardContainerRef.current && !userCardContainerRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onShowLoginRef = useRef(onShowLogin);
  useEffect(() => {
    onShowLoginRef.current = onShowLogin;
  }, [onShowLogin]);

  const handleRefreshBalance = useCallback(async (showToast = true) => {
    if (balanceLoading) return;
    setBalanceLoading(true);
    const minDelayPromise = new Promise((resolve) => setTimeout(resolve, 800));
    try {
      const apiKey = localStorage.getItem('heyclaw_api_key');
      const session = localStorage.getItem('heyclaw_session');
      const userId = localStorage.getItem('heyclaw_user_id');
      if (!apiKey || !session || !userId) {
        await minDelayPromise;
        onShowLoginRef.current?.();
        return;
      }

      let remainQuota = 0;

      const fetchPromise = (async () => {
        const currentConfig = configService.getConfig();
        const oneapiConfig = (currentConfig.providers?.['oneapi'] || {}) as any;
        const oneapiBaseUrl = oneapiConfig.baseUrl || 'https://token.chaohui.ai';
        
        // 自动剥离末尾的 /v1 或 /v1/ 以匹配管理自查接口
        const cleanBaseUrl = oneapiBaseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
        const targetUrl = `${cleanBaseUrl}/api/user/self`;
        const headers = {
          'Cookie': session,
          'New-Api-User': String(userId)
        };

        // 客户端直接直连 New API 查询个人余额和信息
        const selfResp = await window.electron.api.fetch({
          url: targetUrl,
          method: 'GET',
          headers: headers
        }) as { ok: boolean; status?: number; data?: any };

        if (selfResp.ok && selfResp.data && selfResp.data.success) {
          const userProfile = selfResp.data.data;
          // 根据 New API 官方定义，用户的当前可用剩余配额即为 quota 字段
          remainQuota = Number(userProfile.quota || 0);
          const dispName = userProfile.display_name || userProfile.username || 'HeyClaw 用户';
          const savedName = localStorage.getItem('heyclaw_user_name');
          if (!savedName) {
            localStorage.setItem('heyclaw_user_name', dispName);
            setUserNickname(dispName);
            setEditNickname(dispName);
          }
        } else {
          // 提取错误原因 (安全获取 message，避免 TypeError)
          const errorMsg = selfResp.data?.message || 
                           (typeof selfResp.data?.error === 'string' ? selfResp.data.error : selfResp.data?.error?.message) || 
                           '请求未成功';

          // 仅在明确返回 401 身份校验失效，或返回明确的未授权信息时才清空凭证并重新登录
          const isUnauthorized = selfResp.status === 401 || errorMsg.includes('Unauthorized') || errorMsg.includes('对话令牌');
          if (isUnauthorized) {
            localStorage.removeItem('heyclaw_api_key');
            localStorage.removeItem('heyclaw_user_id');
            localStorage.removeItem('heyclaw_session');
            onShowLoginRef.current?.();
          }
          throw new Error(errorMsg);
        }
      })();

      await Promise.all([fetchPromise, minDelayPromise]);

      const points = Math.max(0, Math.round(remainQuota / 5000));
      
      setBalance(points);
      localStorage.setItem('heyclaw_user_balance', String(points));


    } catch (err) {
      console.error('[Sidebar] Refresh balance error:', err);
      if (showToast) {
        window.dispatchEvent(new CustomEvent('app:showToast', { detail: '余额刷新失败，请检查网络' }));
      }
    } finally {
      setBalanceLoading(false);
    }
  }, [balanceLoading]);

  const handleRefreshBalanceRef = useRef(handleRefreshBalance);
  useEffect(() => {
    handleRefreshBalanceRef.current = handleRefreshBalance;
  }, [handleRefreshBalance]);

  // 从 localStorage 加载配置并做静默刷新
  useEffect(() => {
    const apiKey = localStorage.getItem('heyclaw_api_key');
    const session = localStorage.getItem('heyclaw_session');
    const userId = localStorage.getItem('heyclaw_user_id');
    if (!apiKey || !session || !userId) {
      onShowLoginRef.current?.();
      const currentConfig = configService.getConfig();
      const currentOneapi = (currentConfig.providers?.['oneapi'] || {}) as any;
      if (currentOneapi.apiKey) {
        void configService.updateConfig({
          providers: {
            ...currentConfig.providers,
            oneapi: {
              ...currentOneapi,
              apiKey: '',
              enabled: false,
              baseUrl: currentOneapi.baseUrl || 'https://token.chaohui.ai/v1'
            }
          }
        });
      }
    }

    const savedName = localStorage.getItem('heyclaw_user_name');
    if (savedName) {
      setUserNickname(savedName);
      setEditNickname(savedName);
    } else {
      setUserNickname('HeyClaw 用户');
      setEditNickname('HeyClaw 用户');
    }
    const savedAvatar = localStorage.getItem('heyclaw_user_avatar');
    if (savedAvatar) {
      setUserAvatar(savedAvatar);
      setEditAvatar(savedAvatar);
    } else {
      setEditAvatar('🐱');
    }
    const savedBalance = localStorage.getItem('heyclaw_user_balance');
    if (savedBalance) {
      setBalance(Number(savedBalance));
    }
    
    if (apiKey) {
      const timer = setTimeout(() => {
        void handleRefreshBalanceRef.current(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // 监听对话流状态，成功响应后（streaming 结束）自动静默刷新余额
  const isStreaming = useSelector(selectIsStreaming);
  const prevIsStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming) {
      void handleRefreshBalanceRef.current(false);
    }
    prevIsStreamingRef.current = isStreaming;
  }, [isStreaming]);
  const [batchAgentId, setBatchAgentId] = useState<string | null>(null);
  const [batchSelectableItems, setBatchSelectableItems] = useState<AgentSidebarBatchItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deletedSessionIds, setDeletedSessionIds] = useState<string[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [agentScrollEdges, setAgentScrollEdges] = useState({ top: false, bottom: false });
  const [showKitsNewBadge, setShowKitsNewBadge] = useState(false);
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const agentScrollContainerRef = useRef<HTMLDivElement>(null);
  const isWindows = window.electron.platform === 'win32';
  const showHeaderRow = !isWindows;
  const batchSelectableKeySet = useMemo(
    () => new Set(batchSelectableItems.map((item) => item.key)),
    [batchSelectableItems],
  );
  const batchSelectableItemByKey = useMemo(() => {
    const itemByKey = new Map<string, AgentSidebarBatchItem>();
    batchSelectableItems.forEach((item) => itemByKey.set(item.key, item));
    return itemByKey;
  }, [batchSelectableItems]);
  const selectedBatchSelectableCount = useMemo(() => {
    return batchSelectableItems.filter((item) => selectedKeys.has(item.key)).length;
  }, [batchSelectableItems, selectedKeys]);
  const isBatchSelectAllChecked =
    batchSelectableItems.length > 0 && selectedBatchSelectableCount === batchSelectableItems.length;
  const batchAgentName = batchAgentId ? getAgentDisplayNameById(batchAgentId, agents) : null;
  const getBatchSelectionSummary = useCallback(() => {
    const selectedItems = Array.from(selectedKeys)
      .filter((key) => batchSelectableKeySet.size === 0 || batchSelectableKeySet.has(key))
      .map((key) => batchSelectableItemByKey.get(key))
      .filter((item): item is AgentSidebarBatchItem => Boolean(item));
    const selectedSessionCount = selectedItems.filter(
      (item) => item.kind === AgentSidebarBatchItemKind.Session,
    ).length;
    return {
      selectedCount: selectedItems.length,
      selectedSessionCount,
      selectedSubagentCount: 0,
      selectableCount: batchSelectableItems.length,
    };
  }, [batchSelectableItemByKey, batchSelectableItems.length, batchSelectableKeySet, selectedKeys]);

  useEffect(() => {
    let isCurrent = true;

    const loadKitsNewBadgeState = async () => {
      try {
        const dismissedVersion = await window.electron.store.get(
          SidebarNewFeatureBadge.KitsDismissedVersionKey,
        );
        if (!isCurrent) return;
        setShowKitsNewBadge(dismissedVersion !== SidebarNewFeatureBadge.KitsVersion);
      } catch (error) {
        console.warn('[Sidebar] failed to load kits new feature badge state:', error);
      }
    };

    void loadKitsNewBadgeState();

    return () => {
      isCurrent = false;
    };
  }, []);

  const dismissKitsNewBadge = useCallback(() => {
    if (!showKitsNewBadge) return;
    setShowKitsNewBadge(false);
    void window.electron.store
      .set(
        SidebarNewFeatureBadge.KitsDismissedVersionKey,
        SidebarNewFeatureBadge.KitsVersion,
      )
      .catch((error) => {
        console.warn('[Sidebar] failed to save kits new feature badge state:', error);
      });
  }, [showKitsNewBadge]);

  void dismissKitsNewBadge;

  useEffect(() => {
    const handleSearch = () => {
      onShowCowork();
      setIsSearchOpen(true);
    };
    window.addEventListener(CoworkUiEvent.ShortcutSearch, handleSearch);
    return () => {
      window.removeEventListener(CoworkUiEvent.ShortcutSearch, handleSearch);
    };
  }, [onShowCowork]);

  useEffect(() => {
    if (!isCollapsed) return;
    setIsSearchOpen(false);
    setIsBatchMode(false);
    setBatchAgentId(null);
    setBatchSelectableItems([]);
    setSelectedKeys(new Set());
    setShowBatchDeleteConfirm(false);
  }, [isCollapsed]);

  const handleSelectSession = async (session: CoworkSessionSummary) => {
    const agentId = session.agentId?.trim() || AgentId.Main;
    try {
      if (agentId !== currentAgentId) {
        agentService.switchAgent(agentId, { targetSessionId: session.id });
        await coworkService.loadSessions(agentId);
      }
      onShowCowork();
      await coworkService.loadSession(session.id);
    } finally {
      coworkService.finishSessionNavigation(session.id);
    }
  };

  const handleEnterBatchMode = useCallback((sessionId: string, agentId: string) => {
    reportSidebarAction('batch_mode_enter', {
      source: 'home_agent_sidebar',
      agentType: normalizeAgentId(agentId) === AgentId.Main ? 'main' : 'custom',
      selectedCount: 1,
    });
    setIsBatchMode(true);
    setBatchAgentId(agentId);
    setBatchSelectableItems([]);
    setSelectedKeys(new Set([createSessionBatchKey(sessionId)]));
  }, []);

  const handleExitBatchMode = useCallback(() => {
    reportSidebarAction('batch_mode_exit', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      ...getBatchSelectionSummary(),
    });
    setIsBatchMode(false);
    setBatchAgentId(null);
    setBatchSelectableItems([]);
    setSelectedKeys(new Set());
    setShowBatchDeleteConfirm(false);
  }, [batchAgentId, getBatchSelectionSummary]);

  const handleBatchSelectableItemsChange = useCallback((items: AgentSidebarBatchItem[]) => {
    setBatchSelectableItems(items);
    setSelectedKeys((previous) => {
      if (!batchAgentId || items.length === 0) return previous;
      const itemKeySet = new Set(items.map((item) => item.key));
      const next = new Set(Array.from(previous).filter((key) => itemKeySet.has(key)));
      return next.size === previous.size ? previous : next;
    });
  }, [batchAgentId]);

  const updateAgentScrollEdges = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      setAgentScrollEdges((previousEdges) => (
        previousEdges.top || previousEdges.bottom ? { top: false, bottom: false } : previousEdges
      ));
      return;
    }

    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const nextEdges = {
      top: element.scrollTop > 1,
      bottom: maxScrollTop - element.scrollTop > 1,
    };

    setAgentScrollEdges((previousEdges) => {
      if (previousEdges.top === nextEdges.top && previousEdges.bottom === nextEdges.bottom) {
        return previousEdges;
      }
      return nextEdges;
    });
  }, []);

  const handleAgentScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    updateAgentScrollEdges(event.currentTarget);
  }, [updateAgentScrollEdges]);

  const handleToggleSelection = useCallback((selectionKey: string, agentId: string) => {
    if (batchAgentId && normalizeAgentId(agentId) !== batchAgentId) return;
    setSelectedKeys(prev => {
      const next = new Set(prev);
      const targetSelected = !next.has(selectionKey);
      if (next.has(selectionKey)) {
        next.delete(selectionKey);
      } else {
        next.add(selectionKey);
      }
      reportSidebarAction('batch_item_toggle', {
        source: 'home_agent_sidebar',
        agentType: normalizeAgentId(agentId) === AgentId.Main ? 'main' : 'custom',
        selectedCount: next.size,
        selectableCount: batchSelectableItems.length,
        targetSelected,
      });
      return next;
    });
  }, [batchAgentId, batchSelectableItems.length]);

  const handleSelectAll = useCallback(() => {
    if (batchSelectableItems.length === 0) return;
    setSelectedKeys(prev => {
      const selectedVisibleCount = batchSelectableItems.filter((item) => prev.has(item.key)).length;
      if (selectedVisibleCount === batchSelectableItems.length) {
        reportSidebarAction('batch_select_all_toggle', {
          source: 'home_agent_sidebar',
          agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
          selectedCount: 0,
          selectableCount: batchSelectableItems.length,
          isSelectAllChecked: false,
        });
        return new Set();
      }
      reportSidebarAction('batch_select_all_toggle', {
        source: 'home_agent_sidebar',
        agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
        selectedCount: batchSelectableItems.length,
        selectableCount: batchSelectableItems.length,
        isSelectAllChecked: true,
      });
      return new Set(batchSelectableItems.map((item) => item.key));
    });
  }, [batchAgentId, batchSelectableItems]);

  const handleBatchDeleteClick = useCallback(() => {
    if (selectedKeys.size === 0) return;
    reportSidebarAction('batch_delete_confirm_open', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      ...getBatchSelectionSummary(),
    });
    setShowBatchDeleteConfirm(true);
  }, [batchAgentId, getBatchSelectionSummary, selectedKeys.size]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    const items = Array.from(selectedKeys)
      .filter((key) => batchSelectableKeySet.size === 0 || batchSelectableKeySet.has(key))
      .map((key) => batchSelectableItemByKey.get(key))
      .filter((item): item is AgentSidebarBatchItem => Boolean(item));
    if (items.length === 0) return;

    const sessionIds = items
      .filter((item) => item.kind === AgentSidebarBatchItemKind.Session)
      .map((item) => item.sessionId);
    const selectedSessionCount = sessionIds.length;

    reportSidebarAction('batch_delete_submit', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      selectedCount: items.length,
      selectedSessionCount,
      selectedSubagentCount: 0,
      selectableCount: batchSelectableItems.length,
    });

    let deletedSessions = false;
    if (sessionIds.length > 0) {
      deletedSessions = await coworkService.deleteSessions(sessionIds);
    }

    if (!deletedSessions) {
      reportSidebarAction('batch_delete_failed', {
        source: 'home_agent_sidebar',
        agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
        result: 'failed',
        selectedCount: items.length,
        selectedSessionCount,
        selectedSubagentCount: 0,
        selectableCount: batchSelectableItems.length,
      });
      return;
    }
    reportSidebarAction('batch_delete_success', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      result: 'success',
      selectedCount: items.length,
      selectedSessionCount,
      selectedSubagentCount: 0,
      selectableCount: batchSelectableItems.length,
    });
    if (deletedSessions) {
      setDeletedSessionIds(sessionIds);
    }
    handleExitBatchMode();
  }, [
    batchAgentId,
    batchSelectableItemByKey,
    batchSelectableItems.length,
    batchSelectableKeySet,
    selectedKeys,
    handleExitBatchMode,
  ]);

  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isCollapsed) return;
    event.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    document.body.classList.add('select-none');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const nextWidth = resizeStartWidthRef.current + moveEvent.clientX - resizeStartXRef.current;
      if (nextWidth < MIN_SIDEBAR_WIDTH) {
        isResizingRef.current = false;
        setIsResizing(false);
        document.body.classList.remove('select-none');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        onToggleCollapse();
        return;
      }
      const clampedWidth = Math.min(MAX_SIDEBAR_WIDTH, nextWidth);
      setSidebarWidth(clampedWidth);
      onWidthChange?.(clampedWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.classList.remove('select-none');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isCollapsed, onToggleCollapse, onWidthChange, sidebarWidth]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('select-none');
    };
  }, []);

  useEffect(() => {
    const element = agentScrollContainerRef.current;
    if (!element) return;

    updateAgentScrollEdges(element);

    const resizeObserver = new ResizeObserver(() => updateAgentScrollEdges(element));
    resizeObserver.observe(element);
    if (element.firstElementChild) {
      resizeObserver.observe(element.firstElementChild);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateAgentScrollEdges]);

  return (
    <aside
      data-skin-sidebar="true"
      className={`relative shrink-0 overflow-hidden bg-surface-raised ${
        isResizing ? '' : 'sidebar-transition'
      }`}
      style={{ width: isCollapsed ? 0 : sidebarWidth }}
    >
      <div
        className={`flex h-full flex-col transition-opacity ease-out ${
          isCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        style={{
          width: sidebarWidth,
          transitionDuration: `${SIDEBAR_COLLAPSE_TRANSITION_MS}ms`,
        }}
      >
      <div className="pt-3 pb-3">
        {showHeaderRow && (
          <div className="draggable sidebar-header-drag h-8 flex items-center justify-end px-3 gap-1">
            {!isWindows && (
              <>
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="non-draggable h-8 w-6 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
                  aria-label={i18nService.t('search')}
                >
                  <MagnifyingGlassIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="non-draggable h-8 w-6 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
                  aria-label={isCollapsed ? i18nService.t('expand') : i18nService.t('collapse')}
                >
                  <SidebarToggleIcon className="h-4 w-4" isCollapsed={isCollapsed} />
                </button>
              </>
            )}
          </div>
        )}
        {showHeaderRow && (
          <div className="px-3 py-1.5 flex items-center select-none font-semibold text-[12.5px] text-tertiary opacity-40">
             HeyClaw生意增长助手
          </div>
        )}
        <div className="mt-[5px] space-y-0.5 px-3">
          <button
            type="button"
            onClick={() => {
              reportSidebarAction('new_task', { activeView, isCollapsed });
              onNewChat();
            }}
            className={sidebarNavItemClassName}
          >
            <ComposeIcon className={sidebarCreateIconClassName} />
            {i18nService.t('newChat')}
          </button>
          <button
            type="button"
            onClick={() => {
              reportSidebarAction('open_scheduled_tasks', { activeView, isCollapsed });
              setIsSearchOpen(false);
              onShowScheduledTasks();
            }}
            className={activeView === 'scheduledTasks' ? activeSidebarNavItemClassName : sidebarNavItemClassName}
            aria-current={activeView === 'scheduledTasks' ? 'page' : undefined}
          >
            <SidebarAutomationIcon className="h-4 w-4 shrink-0" />
            {i18nService.t('scheduledTasks')}
          </button>
          {/* 原“召唤专家”菜单，隐藏但不删除代码
          <button
            type="button"
            onClick={() => {
              reportSidebarAction('open_kits', { activeView, isCollapsed });
              setIsSearchOpen(false);
              dismissKitsNewBadge();
              onShowKits();
            }}
            className={activeView === 'kits' ? activeSidebarNavItemClassName : sidebarNavItemClassName}
            aria-current={activeView === 'kits' ? 'page' : undefined}
          >
            <SidebarKitsIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{i18nService.t('kits')}</span>
            {showKitsNewBadge && (
              <span className="inline-flex h-4 shrink-0 items-center rounded-[4px] bg-[#ff4f6d] px-1.5 text-[10px] font-semibold leading-none text-white">
                {i18nService.t('newFeatureBadge')}
              </span>
            )}
          </button>
          */}
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(false);
              onShowExperts();
            }}
            className={activeView === 'experts' ? activeSidebarNavItemClassName : sidebarNavItemClassName}
            aria-current={activeView === 'experts' ? 'page' : undefined}
          >
            <SidebarKitsIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">AI 团队</span>
          </button>
          {!hideSites && (
            <button
              type="button"
              onClick={() => {
                reportSidebarAction('open_sites', { activeView, isCollapsed });
                setIsSearchOpen(false);
                onShowSites();
              }}
              className={activeView === 'sites' ? activeSidebarNavItemClassName : sidebarNavItemClassName}
              aria-current={activeView === 'sites' ? 'page' : undefined}
            >
              <SidebarSitesIcon className="h-4 w-4 shrink-0" />
              {i18nService.t('sitesTitle')}
            </button>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={agentScrollContainerRef}
          className='scrollbar-hidden h-full overflow-y-auto px-2.5'
          onScroll={handleAgentScroll}
        >
          <MyAgentSidebarTree
            isBatchMode={isBatchMode}
            batchAgentId={batchAgentId}
            deletedSessionIds={deletedSessionIds}
            selectedKeys={selectedKeys}
            onShowCowork={onShowCowork}
            onShowExperts={onShowExperts}
            onTaskSelected={(params: any) => {
              console.debug('[Sidebar] reporting agent sidebar task selection analytics');
              void reportYdAnalyzer({
                action: LogReporterAction.SidebarAction,
                source: 'home_agent_sidebar',
                actionType: 'select_task',
                activeView,
                ...params,
              });
            }}
            onSidebarAction={(actionType: any, params: any) => {
              reportSidebarAction(actionType, {
                source: 'home_agent_sidebar',
                ...params,
              });
            }}
            onToggleSelection={handleToggleSelection}
            onEnterBatchMode={handleEnterBatchMode}
            onBatchSelectableItemsChange={handleBatchSelectableItemsChange}
            onSearchTasks={() => {
              reportSidebarAction('open_search', { activeView, isCollapsed });
              onShowCowork();
              setIsSearchOpen(true);
            }}
          />
        </div>
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-surface-raised to-transparent transition-opacity duration-150 ${
            agentScrollEdges.top ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`pointer-events-none absolute inset-x-0 top-[68px] z-10 h-3 bg-gradient-to-b from-surface-raised to-transparent transition-opacity duration-150 ${
            agentScrollEdges.top ? 'opacity-40' : 'opacity-0'
          }`}
        />
      </div>
      {!isCollapsed && (
        <div
          className="non-draggable absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
          onMouseDown={handleResizeStart}
        />
      )}
      <CoworkSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
      />
      {!isBatchMode && updateNotice && (
        <div className="non-draggable px-3 pt-1.5">{updateNotice}</div>
      )}
      {isBatchMode ? (
        <div className="border-t border-border/60 px-3 pb-3 pt-2">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-secondary">
              {i18nService
                .t('batchSelectionScope')
                .replace('{agent}', batchAgentName ?? '')
                .replace('{count}', String(selectedKeys.size))}
            </span>
            <button
              type="button"
              onClick={handleExitBatchMode}
              className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-secondary transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            >
              {i18nService.t('batchCancel')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 text-[length:var(--lobster-text-sidebarCompact)] font-normal text-foreground transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={isBatchSelectAllChecked}
                onChange={handleSelectAll}
                disabled={batchSelectableItems.length === 0}
                className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 accent-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
              />
              <span className="truncate">{i18nService.t('batchSelectAll')}</span>
            </label>
            <button
              type="button"
              onClick={handleBatchDeleteClick}
              disabled={selectedKeys.size === 0}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors ${
                selectedKeys.size > 0
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              }`}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {i18nService.t('batchDelete')} ({selectedKeys.size})
            </button>
          </div>
        </div>
      ) : (
        <div 
          ref={userCardContainerRef}
          className="relative px-3 pb-3 pt-2 border-t border-border/40"
        >
          {/* 用户卡片 */}
          <div 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center justify-between p-2 rounded-xl bg-surface/50 hover:bg-surface-raised transition-all duration-200 shadow-sm border border-border/10 cursor-pointer select-none"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {/* 圆形头像 */}
              <div 
                className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-sm select-none shrink-0 overflow-hidden"
              >
                {renderAvatar(userAvatar, userNickname)}
              </div>
              {/* 昵称与余额 */}
              <div className="flex-1 min-w-0 leading-tight">
                <div 
                  className="text-sm font-semibold text-foreground/90 truncate"
                >
                  {userNickname}
                </div>
                <div className="text-[11px] text-secondary mt-0.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <span className="font-medium tracking-wide">{balance !== null ? `${balance} 点` : '-- 点'}</span>
                  <button 
                    onClick={() => handleRefreshBalance(true)}
                    disabled={balanceLoading}
                    className="hover:text-primary active:scale-95 transition-all p-0.5 rounded text-secondary"
                    title="刷新余额"
                  >
                    {balanceLoading ? (
                      <svg className="animate-spin h-3.5 w-3.5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <ArrowPathIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const config = configService.getConfig();
                      const oneapiConfig = config.providers?.['oneapi'];
                      const apiKey = oneapiConfig?.apiKey?.trim();
                      if (!apiKey) {
                        window.dispatchEvent(new CustomEvent('app:showToast', { detail: '未激活系统，请先输入激活码' }));
                        return;
                      }
                      setIsPayModalOpen(true);
                    }}
                    className="hover:text-primary active:scale-95 transition-all p-0.5 rounded text-secondary"
                    title="立即充值"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>

                </div>
              </div>
            </div>

            {/* 设置按钮 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowUserMenu(false);
                onShowSettings();
              }}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface hover:text-foreground transition-all shrink-0 ml-1.5"
              title={i18nService.t('settings')}
            >
              <Cog6ToothIcon className="h-4 w-4 shrink-0" />
            </button>
          </div>

          {/* 点击后滑出控制菜单 */}
          {showUserMenu && (
            <div className="absolute bottom-[calc(100%+6px)] left-3 right-3 z-50 p-2.5 rounded-2xl border border-border/80 bg-surface shadow-xl flex flex-col space-y-1 animate-fade-in">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUserMenu(false);
                  setEditNickname(userNickname);
                  setEditAvatar(userAvatar);
                  setIsEditModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-foreground/80 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/10 rounded-xl transition-all duration-200 font-medium"
              >
                <svg className="w-4 h-4 text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                编辑资料
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUserMenu(false);
                  setIsPasswordModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-foreground/80 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/10 rounded-xl transition-all duration-200 font-medium"
              >
                <svg className="w-4 h-4 text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                修改密码
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUserMenu(false);
                  setIsBillingModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-foreground/80 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/10 rounded-xl transition-all duration-200 font-medium"
              >
                <svg className="w-4 h-4 text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                我的账单
              </button>
              
              <div className="h-[1px] bg-border/40 my-1" />

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUserMenu(false);
                  setShowConfirmDeactivate(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-red-500 hover:bg-red-500/10 rounded-xl transition-all duration-200 font-medium"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                退出登录
              </button>
            </div>
          )}
        </div>
      )}
      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteConfirm && (
        <Modal
          onClose={() => {
            reportSidebarAction('batch_delete_cancel', {
              source: 'home_agent_sidebar',
              agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
              ...getBatchSelectionSummary(),
            });
            setShowBatchDeleteConfirm(false);
          }}
          className="w-full max-w-sm mx-4 bg-surface rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-500" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              {i18nService.t('batchDeleteConfirmTitle')}
            </h2>
          </div>
          <div className="px-5 pb-4">
            <p className="text-sm text-secondary">
              {i18nService
                .t('batchDeleteConfirmMessage')
                .replace('{count}', String(selectedKeys.size))}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
            <button
              onClick={() => {
                reportSidebarAction('batch_delete_cancel', {
                  source: 'home_agent_sidebar',
                  agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
                  ...getBatchSelectionSummary(),
                });
                setShowBatchDeleteConfirm(false);
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg text-secondary hover:bg-surface-raised transition-colors"
            >
              {i18nService.t('cancel')}
            </button>
            <button
              onClick={handleBatchDelete}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
            >
              {i18nService.t('batchDelete')} ({selectedKeys.size})
            </button>
          </div>
        </Modal>
      )}

      {/* 编辑个人资料 Modal */}
      {isEditModalOpen && (
        <Modal
          onClose={() => setIsEditModalOpen(false)}
          className="w-full max-w-sm mx-4 bg-surface rounded-2xl shadow-xl overflow-hidden border border-border"
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-base font-semibold text-foreground">编辑个人资料</h3>
          </div>
          <div className="p-5 space-y-4">
            {/* 头像编辑 (上传图片) */}
            <div className="flex flex-col items-center space-y-3">
              <label className="text-xs font-semibold text-secondary tracking-wider uppercase">头像</label>
              <div className="flex flex-col items-center space-y-2">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-md overflow-hidden text-2xl cursor-pointer hover:opacity-90 transition-opacity"
                  title="点击上传头像"
                >
                  {renderAvatar(editAvatar, editNickname)}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />

              </div>
            </div>
            {/* 昵称编辑 */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-secondary tracking-wider uppercase pl-1">昵称</label>
              <input
                type="text"
                value={editNickname}
                onChange={(e) => setEditNickname(e.target.value)}
                placeholder="请输入昵称"
                className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 text-sm text-foreground"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg text-secondary hover:bg-surface-raised transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => {
                const finalName = editNickname.trim() || 'HeyClaw 用户';
                const finalAvatar = editAvatar.trim() || '🐱';
                setUserNickname(finalName);
                setUserAvatar(finalAvatar);
                localStorage.setItem('heyclaw_user_name', finalName);
                localStorage.setItem('heyclaw_user_avatar', finalAvatar);
                setIsEditModalOpen(false);
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary hover:bg-primary-hover text-white transition-colors"
            >
              保存
            </button>
          </div>
        </Modal>
      )}

      {/* 退出激活二次确认 Modal */}
      {showConfirmDeactivate && (
        <Modal
          onClose={() => setShowConfirmDeactivate(false)}
          className="w-full max-w-sm mx-4 bg-surface rounded-2xl shadow-xl overflow-hidden border border-border"
        >
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
              <svg className="w-5 h-5 text-red-600 dark:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-foreground">确认退出登录</h2>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-secondary">
              确定要退出登录当前账号吗？退出后系统需要重新登录才能继续使用。
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
            <button
              onClick={() => setShowConfirmDeactivate(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg text-secondary hover:bg-surface-raised transition-colors"
            >
              取消
            </button>
            <button
              onClick={async () => {
                setShowConfirmDeactivate(false);
                // 1. 清除本地缓存凭证
                localStorage.removeItem('heyclaw_api_key');
                localStorage.removeItem('heyclaw_user_id');
                localStorage.removeItem('heyclaw_session');
                localStorage.removeItem('heyclaw_user_balance');
                localStorage.removeItem('heyclaw_user_name');
                
                // 2. 清除浏览器缓存 Cookies
                try {
                  await window.electron.artifact.clearBrowserCookies();
                } catch (cookieErr) {
                  console.warn('Failed to clear browser cookies on deactivate:', cookieErr);
                }

                // 3. 触发全局事件，让 App.tsx 同步 SQLite 配置并重启网关
                window.dispatchEvent(new CustomEvent('app:deactivate'));
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
            >
              确认退出
            </button>
          </div>
        </Modal>
      )}

      {/* 账单明细 Modal */}
      {isBillingModalOpen && (
        <BillingModal onClose={() => setIsBillingModalOpen(false)} />
      )}

      {/* 充值 Modal */}
      {isPayModalOpen && (
        <PayModal onClose={() => setIsPayModalOpen(false)} onSuccess={() => handleRefreshBalance(false)} />
      )}

      {/* 修改密码模态框 */}
      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={() => {
          setIsPasswordModalOpen(false);
          window.dispatchEvent(new CustomEvent('app:deactivate'));
        }}
      />
      </div>
    </aside>
  );
};

export default Sidebar;
