import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { AgentId } from '@shared/agent';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { agentService } from '../services/agent';
import { logoutAndDeactivate } from '../services/authStorage';
import { configService } from '../services/config';
import { coworkService } from '../services/cowork';
import { httpClient } from '../services/httpClient';
import { i18nService } from '../services/i18n';
import { LogReporterAction, reportYdAnalyzer } from '../services/logReporter';
import { fetchCognitionStats } from '../services/secondBrainApi';
import { vipService } from '../services/vipService';
import { RootState } from '../store';
import {
  selectCoworkSessions,
  selectCurrentSessionId,
} from '../store/selectors/coworkSelectors';
import { setUserBalance } from '../store/slices/authSlice';
import type { CoworkSessionSummary } from '../types/cowork';
import { getAgentDisplayNameById } from '../utils/agentDisplay';
import {
  type AgentSidebarBatchItem,
  AgentSidebarBatchItemKind,
  createSessionBatchKey,
} from './agentSidebar/batchSelection';
import MyAgentSidebarTree from './agentSidebar/MyAgentSidebarTree';
import SidebarTaskFilterButton, { SIDEBAR_TASK_FILTER_ENABLED } from './agentSidebar/SidebarTaskFilterButton';
import SidebarTaskSearchButton from './agentSidebar/SidebarTaskSearchButton';
import BillingModal from './BillingModal';
import Modal from './common/Modal';
import {
  type CoworkTaskSearchRequestEventDetail,
  CoworkTaskSearchRequestSource,
  CoworkUiEvent,
} from './cowork/constants';
import CoworkSearchModal from './cowork/CoworkSearchModal';
import BrainIcon from './icons/BrainIcon';
import ComposeIcon from './icons/ComposeIcon';
import SidebarAutomationIcon from './icons/SidebarAutomationIcon';
import SidebarKitsIcon from './icons/SidebarKitsIcon';
import SidebarLibraryIcon from './icons/SidebarLibraryIcon';
import SidebarSitesIcon from './icons/SidebarSitesIcon';
import SidebarToggleIcon from './icons/SidebarToggleIcon';
import TrashIcon from './icons/TrashIcon';
import { PasswordModal } from './PasswordModal';
import PayModal from './PayModal';
import ReportIssueModal from './ReportIssueModal';

interface SidebarProps {
  onShowSettings: () => void;
  onShowLogin?: () => void;
  activeView: 'cowork' | 'skills' | 'scheduledTasks' | 'kits' | 'mcp' | 'sites' | 'experts' | 'secondBrain' | 'library';
  onShowSkills: () => void;
  onShowCowork: () => void;
  onShowScheduledTasks: () => void;
  onShowKits?: () => void;
  onShowExperts: () => void;
  onShowSecondBrain: () => void;
  onShowMcp?: () => void;
  onShowSites: () => void;
  onShowLibrary?: () => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  updateBadge?: React.ReactNode;
  isTaskFilterActive: boolean;
  hasUnreadCompletedTasks: boolean;
  onToggleTaskFilter: () => void;
  onTaskFilterSummaryChange: (hasUnreadCompletedTasks: boolean) => void;
  onWidthChange?: (width: number) => void;
  updateNotice?: React.ReactNode;
  /** The expanded update card owns the sidebar bottom; temporarily hide the
   * promo banner while preserving it for a smooth return after collapse. */
  hideAdBanner?: boolean;
  hideLogin?: boolean;
  hideSites?: boolean;
  isEngineStartupOverlayVisible?: boolean;
}

const DEFAULT_SIDEBAR_WIDTH = 244;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;
const SIDEBAR_COLLAPSE_TRANSITION_MS = 200;
const SIDEBAR_LOGIN_PROMO_TIP_DURATION_MS = 5000;
const SIDEBAR_LOGIN_PROMO_TIP_FADE_MS = 220;

const normalizeAgentId = (agentId?: string | null) => agentId?.trim() || AgentId.Main;
const SidebarNewFeatureBadge = {
  KitsDismissedVersionKey: 'sidebar.kitsNewFeatureBadge.dismissedVersion',
  KitsVersion: '2026-06-05',
} as const;

const sidebarNavItemClassName =
  'w-full inline-flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-normal text-foreground/85 transition-all duration-150 hover:bg-foreground/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]';
const activeSidebarNavItemClassName =
  'w-full inline-flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium text-foreground bg-foreground/[0.07] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] dark:bg-white/[0.08] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-all duration-150';
const sidebarCreateIconClassName = 'h-4 w-4 shrink-0 text-foreground/80';

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

const writeSidebarRendererLog = (
  level: 'debug' | 'warn',
  message: string,
  error?: unknown,
): void => {
  try {
    window.electron?.log?.fromRenderer?.(level, 'Sidebar', message);
  } catch (logError) {
    const logErrorMessage = logError instanceof Error ? logError.message : String(logError);
    console.debug(`[Sidebar] renderer log unavailable: ${logErrorMessage}`, error);
  }
};
const logTaskSearchRequest = (
  source: CoworkTaskSearchRequestSource,
  activeView: SidebarProps['activeView'],
): void => {
  try {
    const message = `task search requested source=${source} activeView=${activeView} platform=${window.electron?.platform ?? 'unknown'}`;
    console.debug(`[Sidebar] ${message}`);
    writeSidebarRendererLog('debug', message);
  } catch (error) {
    // Task search must remain available when renderer diagnostic logging fails.
    console.debug('[Sidebar] task search diagnostic logging unavailable:', error);
  }
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
  onShowSecondBrain,
  onShowSites,
  onShowLibrary,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  isTaskFilterActive,
  hasUnreadCompletedTasks,
  onToggleTaskFilter,
  onTaskFilterSummaryChange,
  onWidthChange,
  updateNotice,
  hideSites,
  hideAdBanner,
  hideLogin,
  isEngineStartupOverlayVisible = false,
}) => {
  void hideSites;
  void hideAdBanner;
  void onShowKits;
  void onShowSkills;
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const agents = useSelector((state: RootState) => state.agent.agents);
  const isLoggedIn = useSelector((state: RootState) => state.auth.isLoggedIn);
  const isAuthLoading = useSelector((state: RootState) => state.auth.isLoading);
  const sessions = useSelector(selectCoworkSessions);
  const currentSessionId = useSelector(selectCurrentSessionId);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [pendingCognitionCount, setPendingCognitionCount] = useState<number>(0);

  const [hasSecondBrain, setHasSecondBrain] = useState<boolean>(() => vipService.hasSecondBrainPermission());

  useEffect(() => {
    const unsubscribe = vipService.subscribe((state) => {
      const granted = state.authorized && state.permissions.includes('secondBrain');
      setHasSecondBrain(granted);
    });
    return unsubscribe;
  }, []);

  /** 加载待确认认知数，用于侧边栏徽章显示（仅在有第二大脑权限时初始化请求一次，后续通过事件精准更新） */
  useEffect(() => {
    if (!hasSecondBrain) {
      setPendingCognitionCount(0);
      return;
    }

    let cancelled = false;
    const loadPendingCount = () => {
      const session = localStorage.getItem('heyclaw_session');
      const userId = localStorage.getItem('heyclaw_user_id');
      if (!session || !userId || !vipService.hasSecondBrainPermission()) return;

      fetchCognitionStats()
        .then((data) => {
          if (!cancelled && data) {
            setPendingCognitionCount(data.pending_count || 0);
          }
        })
        .catch(() => {});
    };

    loadPendingCount();

    const handleStatsUpdated = (event: Event) => {
      if (!vipService.hasSecondBrainPermission()) return;
      const customEvent = event as CustomEvent<{ pending_count?: number } | number>;
      if (typeof customEvent.detail === 'number') {
        setPendingCognitionCount(customEvent.detail);
      } else if (customEvent.detail && typeof customEvent.detail.pending_count === 'number') {
        setPendingCognitionCount(customEvent.detail.pending_count);
      } else {
        loadPendingCount();
      }
    };

    window.addEventListener('app:secondBrain:statsUpdated', handleStatsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('app:secondBrain:statsUpdated', handleStatsUpdated);
    };
  }, [hasSecondBrain]);

  const dispatch = useDispatch();
  const balance = useSelector((state: RootState) => state.auth.userBalance);

  // 用户卡片状态与逻辑
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const balanceLoadingRef = useRef(false);
  const [accountUsername, setAccountUsername] = useState('');
  const [userNickname, setUserNickname] = useState('');
  const [userAvatar, setUserAvatar] = useState('🐱');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [showConfirmDeactivate, setShowConfirmDeactivate] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isReportIssueModalOpen, setIsReportIssueModalOpen] = useState(false);

  const userCardContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 渲染头像辅助函数
  const isImageAvatar = (avatarValue?: string) => {
    if (!avatarValue) return false;
    return avatarValue.startsWith('data:image/') || avatarValue.startsWith('http://') || avatarValue.startsWith('https://') || avatarValue.startsWith('blob:');
  };

  const renderAvatar = (avatarValue: string, nickname: string) => {
    if (isImageAvatar(avatarValue)) {
      return (
        <img 
          src={avatarValue} 
          alt={nickname} 
          className="w-full h-full object-cover" 
        />
      );
    }
    return <span className="select-none text-lg leading-none">{avatarValue || '🐱'}</span>;
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

  // 连续点击头像唤起开发者工具
  const avatarClickCountRef = useRef<number>(0);
  const avatarClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAvatarDebugClick = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    avatarClickCountRef.current += 1;
    if (avatarClickTimerRef.current) {
      clearTimeout(avatarClickTimerRef.current);
    }
    if (avatarClickCountRef.current >= 10) {
      avatarClickCountRef.current = 0;
      void window.electron?.appInfo?.toggleDevTools?.();
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: '已切换开发者工具' }));
    } else {
      avatarClickTimerRef.current = setTimeout(() => {
        avatarClickCountRef.current = 0;
      }, 3000);
    }
  };

  const onShowLoginRef = useRef(onShowLogin);
  useEffect(() => {
    onShowLoginRef.current = onShowLogin;
  }, [onShowLogin]);

  const handleRefreshBalance = useCallback(async (showToast = true) => {
    if (balanceLoadingRef.current) return;
    balanceLoadingRef.current = true;
    setBalanceLoading(true);
    const minDelayPromise = new Promise((resolve) => setTimeout(resolve, 600));
    try {
      const session = localStorage.getItem('heyclaw_session');
      if (!session) {
        await minDelayPromise;
        onShowLoginRef.current?.();
        return;
      }

      let remainQuota = 0;

      const fetchPromise = (async () => {
        // 统一通过管理后台后端代理查询用户最新配额与昵称 (携带用户访问令牌)
        const selfResp = await httpClient.admin.get<{
          success: boolean;
          data?: {
            id: number;
            username: string;
            displayName: string;
            quota: number;
            usedQuota: number;
          };
          error?: string;
        }>('/api/client/user-profile');

        if (selfResp.ok && selfResp.data && selfResp.data.success) {
          const userProfile = selfResp.data.data;
          remainQuota = Number(userProfile?.quota || 0);
          const rawAccount = userProfile?.username || userProfile?.displayName || '';
          setAccountUsername(rawAccount);
        } else {
          const errorMsg = selfResp.data?.error || '获取用户信息失败';
          throw new Error(errorMsg);
        }
      })();

      await Promise.all([fetchPromise, minDelayPromise]);

      const points = Math.max(0, Math.round(remainQuota / 5000));
      dispatch(setUserBalance(points));

    } catch (err) {
      console.error('[Sidebar] Refresh balance error:', err);
      if (showToast) {
        window.dispatchEvent(new CustomEvent('app:showToast', { detail: '余额刷新失败，请检查网络' }));
      }
    } finally {
      balanceLoadingRef.current = false;
      setBalanceLoading(false);
    }
  }, [dispatch]);

  // 从 localStorage 加载配置
  useEffect(() => {
    const apiKey = localStorage.getItem('heyclaw_api_key');
    const userId = localStorage.getItem('heyclaw_user_id');
    if (!apiKey || !userId) {
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

    const savedName = localStorage.getItem('heyclaw_user_name') || '';
    setUserNickname(savedName);
    setEditNickname(savedName);
    const savedAvatar = localStorage.getItem('heyclaw_user_avatar');
    if (savedAvatar) {
      setUserAvatar(savedAvatar);
      setEditAvatar(savedAvatar);
    } else {
      setEditAvatar('🐱');
    }
    // 启动时自动静默加载一次用户账号与余额
    void handleRefreshBalance(false);
  }, [handleRefreshBalance]);

  const [batchAgentId, setBatchAgentId] = useState<string | null>(null);
  const [batchSelectableItems, setBatchSelectableItems] = useState<AgentSidebarBatchItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deletedSessionIds, setDeletedSessionIds] = useState<string[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [agentScrollEdges, setAgentScrollEdges] = useState({ top: false, bottom: false });
  const [showKitsNewBadge, setShowKitsNewBadge] = useState(false);
  const [showLoginPromoTip, setShowLoginPromoTip] = useState(true);
  const [isLoginPromoTipFading, setIsLoginPromoTipFading] = useState(false);
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const agentScrollContainerRef = useRef<HTMLDivElement>(null);
  const isWindows = window.electron.platform === 'win32';
  const showHeaderRow = !isWindows;
  const showLoginPromo = !hideLogin && !isAuthLoading && !isLoggedIn;
  const shouldShowLoginPromoTip = showLoginPromo && showLoginPromoTip;
  void isLoginPromoTipFading;
  void shouldShowLoginPromoTip;
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

  useEffect(() => {
    if (!showLoginPromo) {
      setShowLoginPromoTip(true);
      setIsLoginPromoTipFading(false);
      return undefined;
    }

    if (isEngineStartupOverlayVisible) {
      if (showLoginPromoTip) {
        const message = 'pausing login promo tip auto-hide while engine startup overlay is visible';
        console.debug(`[Sidebar] ${message}`);
        writeSidebarRendererLog('debug', message);
        setIsLoginPromoTipFading(false);
      }
      return undefined;
    }

    if (!showLoginPromoTip) {
      return undefined;
    }

    const startMessage = 'starting login promo tip auto-hide timer';
    console.debug(`[Sidebar] ${startMessage}`);
    writeSidebarRendererLog('debug', startMessage);

    const hideTimer = window.setTimeout(() => {
      const message = 'auto hiding login promo tip';
      console.debug(`[Sidebar] ${message}`);
      writeSidebarRendererLog('debug', message);
      setIsLoginPromoTipFading(true);
    }, SIDEBAR_LOGIN_PROMO_TIP_DURATION_MS);

    const removeTimer = window.setTimeout(() => {
      setShowLoginPromoTip(false);
      setIsLoginPromoTipFading(false);
    }, SIDEBAR_LOGIN_PROMO_TIP_DURATION_MS + SIDEBAR_LOGIN_PROMO_TIP_FADE_MS);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [isEngineStartupOverlayVisible, showLoginPromo, showLoginPromoTip]);

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
  const openTaskSearch = useCallback((source: CoworkTaskSearchRequestSource) => {
    logTaskSearchRequest(source, activeView);
    onShowCowork();
    setIsSearchOpen(true);
  }, [activeView, onShowCowork]);

  useEffect(() => {
    const handleSearch = (event: Event) => {
      const detail = (event as CustomEvent<CoworkTaskSearchRequestEventDetail>).detail;
      openTaskSearch(detail?.source ?? CoworkTaskSearchRequestSource.UiEvent);
    };
    window.addEventListener(CoworkUiEvent.ShortcutSearch, handleSearch);
    return () => {
      window.removeEventListener(CoworkUiEvent.ShortcutSearch, handleSearch);
    };
  }, [openTaskSearch]);

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
                  onClick={onToggleCollapse}
                  className="non-draggable h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
                  aria-label={isCollapsed ? i18nService.t('expand') : i18nService.t('collapse')}
                >
                  <SidebarToggleIcon className="h-4 w-4" isCollapsed={isCollapsed} />
                </button>
                {!isCollapsed && (
                  <>
                    <SidebarTaskSearchButton
                      onClick={() => {
                        reportSidebarAction('open_search', { activeView, isCollapsed });
                        openTaskSearch(CoworkTaskSearchRequestSource.SidebarHeader);
                      }}
                      className="non-draggable"
                      label={i18nService.t('search')}
                    />
                    {SIDEBAR_TASK_FILTER_ENABLED && activeView === 'cowork' && (
                      <SidebarTaskFilterButton
                        isActive={isTaskFilterActive}
                        hasUnreadCompletedTasks={hasUnreadCompletedTasks}
                        label={i18nService.t('sidebarFilter')}
                        onClick={onToggleTaskFilter}
                        className="non-draggable"
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
        {showHeaderRow && (
          <div className="px-3 pt-2 pb-1 flex items-center select-none text-[11px] font-medium tracking-wide text-secondary/60">
            HeyClaw 增长助手
          </div>
        )}
        <div className="mt-1 space-y-1 px-2.5">
          <button
            type="button"
            onClick={() => {
              reportSidebarAction('new_task', { activeView, isCollapsed });
              onNewChat();
            }}
            className={sidebarNavItemClassName}
          >
            <ComposeIcon className={sidebarCreateIconClassName} />
            <span>{i18nService.t('newChat')}</span>
            <span className="ml-auto inline-flex items-center text-[10.5px] font-medium text-secondary/40">
              ⌘N
            </span>
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
          {hasSecondBrain && (
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                onShowSecondBrain();
              }}
              className={activeView === 'secondBrain' ? activeSidebarNavItemClassName : sidebarNavItemClassName}
              aria-current={activeView === 'secondBrain' ? 'page' : undefined}
            >
              <BrainIcon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">第二大脑</span>
              {pendingCognitionCount > 0 && (
                <span className="ml-auto flex items-center gap-1.5 shrink-0 text-[11px] font-medium text-amber-500 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span>新增 {pendingCognitionCount} 条</span>
                </span>
              )}
            </button>
          )}
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
          {onShowLibrary && (
            <button
              type="button"
              onClick={() => {
                reportSidebarAction('open_library', { activeView, isCollapsed });
                setIsSearchOpen(false);
                onShowLibrary();
              }}
              className={activeView === 'library' ? activeSidebarNavItemClassName : sidebarNavItemClassName}
              aria-current={activeView === 'library' ? 'page' : undefined}
            >
              <SidebarLibraryIcon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{i18nService.t('librarySidebarTitle')}</span>
            </button>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={agentScrollContainerRef}
          className="scrollbar-hidden h-full overflow-y-auto px-2.5"
          onScroll={handleAgentScroll}
        >
          <MyAgentSidebarTree
            isBatchMode={isBatchMode}
            batchAgentId={batchAgentId}
            deletedSessionIds={deletedSessionIds}
            selectedKeys={selectedKeys}
            isTaskFilterActive={isTaskFilterActive}
            onShowCowork={onShowCowork}
            onShowExperts={onShowExperts}
            onTaskFilterSummaryChange={onTaskFilterSummaryChange}
            onTaskSelected={(params) => {
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
            onClick={() => {
              const willOpen = !showUserMenu;
              setShowUserMenu(willOpen);
              if (willOpen) {
                void handleRefreshBalance(false);
              }
            }}
            className="flex items-center gap-2.5 p-2 rounded-xl bg-surface/50 hover:bg-surface-raised transition-all duration-200 shadow-sm border border-border/10 cursor-pointer select-none"
          >
            {/* 头像 */}
            <div 
              className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-xs select-none shrink-0 overflow-hidden ${
                isImageAvatar(userAvatar)
                  ? 'bg-transparent border border-border/40'
                  : 'bg-surface-raised border border-border/40'
              }`}
            >
              {renderAvatar(userAvatar, userNickname)}
            </div>
            {/* 昵称与账号名双行展示 */}
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-[13px] font-semibold text-foreground/90 truncate">
                {userNickname || <span className="text-secondary font-normal">未设置昵称</span>}
              </div>
              {accountUsername && (
                <div className="text-[11px] text-secondary truncate mt-0.5" title={accountUsername}>
                  @{accountUsername}
                </div>
              )}
            </div>
          </div>

          {/* 个人中心弹窗 */}
          {showUserMenu && (
            <div className="absolute bottom-[calc(100%+8px)] left-2 right-2 z-50 rounded-2xl border border-border/80 bg-surface shadow-2xl overflow-hidden flex flex-col animate-fade-in text-[13px]">
              {/* Profile Head: 头像、昵称、账号与算力点数 */}
              <div className="flex items-center gap-2.5 p-3.5 border-b border-border/50">
                <div 
                  onClick={handleAvatarDebugClick}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-xs select-none shrink-0 overflow-hidden text-sm font-bold cursor-pointer ${
                    isImageAvatar(userAvatar)
                      ? 'bg-transparent border border-border/40'
                      : 'bg-surface-raised border border-border/40'
                  }`}
                >
                  {renderAvatar(userAvatar, userNickname)}
                </div>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="font-bold text-foreground truncate text-sm">
                    {userNickname || <span className="text-secondary font-normal">未设置昵称</span>}
                  </div>
                  {accountUsername && (
                    <div className="text-xs text-secondary truncate mt-0.5" title={accountUsername}>
                      @{accountUsername}
                    </div>
                  )}
                </div>
                {/* 算力点数展示徽章 */}
                <div 
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-raised border border-border/60 text-foreground font-semibold text-xs shrink-0 select-none"
                >
                  {balanceLoading ? (
                    <svg className="animate-spin h-3.5 w-3.5 text-amber-500 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  )}
                  <span>{balance !== null ? balance.toLocaleString() : '--'}</span>
                </div>
              </div>

              {/* Profile Body */}
              <div className="py-1">
                {/* 第一组：算力充值、我的账单 */}
                <div className="py-1 border-b border-border/40">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserMenu(false);
                      const config = configService.getConfig();
                      const oneapiConfig = config.providers?.['oneapi'];
                      const apiKey = oneapiConfig?.apiKey?.trim();
                      if (!apiKey) {
                        window.dispatchEvent(new CustomEvent('app:showToast', { detail: '未激活系统，请先输入激活码' }));
                        return;
                      }
                      setIsPayModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-foreground/85 hover:bg-surface-raised hover:text-foreground transition-colors font-medium"
                  >
                    <svg className="w-4 h-4 text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                    <span>算力充值</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserMenu(false);
                      setIsBillingModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-foreground/85 hover:bg-surface-raised hover:text-foreground transition-colors font-medium"
                  >
                    <svg className="w-4 h-4 text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <span>我的账单</span>
                  </button>
                </div>

                {/* 第二组：编辑资料、修改密码 */}
                <div className="py-1 border-b border-border/40">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserMenu(false);
                      setEditNickname(userNickname);
                      setEditAvatar(userAvatar);
                      setIsEditModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-foreground/85 hover:bg-surface-raised hover:text-foreground transition-colors font-medium"
                  >
                    <svg className="w-4 h-4 text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>编辑资料</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserMenu(false);
                      setIsPasswordModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-foreground/85 hover:bg-surface-raised hover:text-foreground transition-colors font-medium"
                  >
                    <svg className="w-4 h-4 text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2z" />
                      <circle cx="12" cy="11" r="2" />
                      <path d="M12 11V7a4 4 0 0 1 4-4h0" />
                    </svg>
                    <span>修改密码</span>
                  </button>
                </div>

                {/* 第三组：设置、报告问题 */}
                <div className="py-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserMenu(false);
                      onShowSettings();
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-foreground/85 hover:bg-surface-raised hover:text-foreground transition-colors font-medium"
                  >
                    <svg className="w-4 h-4 text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    <span>设置</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserMenu(false);
                      setIsReportIssueModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-foreground/85 hover:bg-surface-raised hover:text-foreground transition-colors font-medium"
                  >
                    <svg className="w-4 h-4 text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>报告问题</span>
                  </button>
                </div>
              </div>

              {/* Profile Foot: 退出登录 */}
              <div className="p-2.5 bg-surface-raised/60 border-t border-border/40">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowUserMenu(false);
                    setShowConfirmDeactivate(true);
                  }}
                  className="w-full py-2 px-3 flex items-center justify-center gap-2 rounded-xl bg-surface hover:bg-surface-raised text-foreground/90 font-medium border border-border/60 shadow-xs transition-all active:scale-[0.98]"
                >
                  <svg className="w-4 h-4 text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>退出登录</span>
                </button>
              </div>
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
                  className={`w-16 h-16 rounded-xl flex items-center justify-center shadow-sm overflow-hidden text-2xl cursor-pointer hover:opacity-90 transition-opacity border border-border ${
                    isImageAvatar(editAvatar)
                      ? 'bg-transparent'
                      : 'bg-surface-raised'
                  }`}
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
            {/* 登录账号展示（只读） */}
            {accountUsername && (
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-semibold text-secondary tracking-wider uppercase pl-1">当前账号</label>
                <div className="w-full px-4 py-2 bg-surface-raised/70 border border-border/60 rounded-xl text-sm text-secondary select-all font-mono">
                  {accountUsername}
                </div>
              </div>
            )}
            {/* 昵称编辑 */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-secondary tracking-wider uppercase pl-1">自定义昵称</label>
              <input
                type="text"
                value={editNickname}
                onChange={(e) => setEditNickname(e.target.value)}
                placeholder="未设置昵称（点击设置）"
                className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 text-sm text-foreground"
              />
              <p className="text-[11px] text-secondary pl-1">仅保存在当前设备，与登录账号完全独立</p>
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
                const finalName = editNickname.trim();
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
              onClick={() => {
                setShowConfirmDeactivate(false);
                logoutAndDeactivate();
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
        <PayModal
          onClose={() => setIsPayModalOpen(false)}
          onSuccess={() => setIsPayModalOpen(false)}
        />
      )}

      {/* 修改密码模态框 */}
      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={() => {
          setIsPasswordModalOpen(false);
        }}
      />

      {/* 报告问题模态框 */}
      {isReportIssueModalOpen && (
        <ReportIssueModal onClose={() => setIsReportIssueModalOpen(false)} />
      )}
      </div>
    </aside>
  );
};

export default Sidebar;
