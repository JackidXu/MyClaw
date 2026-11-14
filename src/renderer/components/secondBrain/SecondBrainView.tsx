import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  SECOND_BRAIN_MAX_BATCH_COUNT,
  SECOND_BRAIN_MAX_FILE_SIZE,
  SECOND_BRAIN_SUPPORTED_EXTENSIONS,
} from '../../../shared/secondBrain/constants';
import { i18nService } from '../../services/i18n';
import {
  adoptCognitionItem,
  batchUploadDocuments,
  type CognitionItem,
  type CognitionStats,
  deleteAudio,
  deleteChat,
  deleteDocument,
  DOCUMENT_STATUS,
  type DocumentItem,
  downloadDocument,
  fetchAudioList,
  fetchChatList,
  fetchCognitionItemList,
  fetchCognitionStats,
  fetchCognitionTrend,
  fetchDocumentList,
  fetchPersonaDetail,
  LAYER_LABEL,
  type PersonaData,
  reExtractAudio,
  reExtractDocument,
  rejectCognitionItem,
  TrendWeekItem,
  updatePersona,
} from '../../services/secondBrainApi';
import { secondBrainAutoUploadService } from '../../services/secondBrainAutoUpload';
import {
  MANAGEMENT_PAGE_TITLE_TEXT,
} from '../common/managementTypography';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import { AutoUploadSettingsModal } from './AutoUploadSettingsModal';

interface SecondBrainViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

/** 资料 Tab */
const MATERIAL_TABS = ['文档', '对话', '录音'] as const;
type MaterialTab = typeof MATERIAL_TABS[number];


/** 获取层级国际化标签 */
function getLayerLabel(layer: number): string {
  switch (layer) {
    case 0:
      return i18nService.t('secondBrainLayerModel');
    case 1:
      return i18nService.t('secondBrainLayerValue');
    case 2:
      return i18nService.t('secondBrainLayerRule');
    case 3:
      return i18nService.t('secondBrainLayerMethod');
    case 4:
      return i18nService.t('secondBrainLayerIndustry');
    case 5:
      return i18nService.t('secondBrainLayerCase');
    case 6:
      return i18nService.t('secondBrainLayerExpression');
    default:
      return LAYER_LABEL[layer] ?? `Layer ${layer}`;
  }
}

/** 秒级时间戳转可读日期时间 */
function formatTimestamp(ts: string | number): string {
  const num = typeof ts === 'string' ? Number(ts) : ts;
  if (!num || isNaN(num)) return '';
  const d = new Date(num * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 秒级时间戳转日期（MM-DD HH:mm） */
function formatDate(ts: string | number): string {
  const num = typeof ts === 'string' ? Number(ts) : ts;
  if (!num || isNaN(num)) return '';
  const d = new Date(num * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SecondBrainView: React.FC<SecondBrainViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  updateBadge,
}) => {
  const [materialTab, setMaterialTab] = useState<MaterialTab>('文档');
  const [stats, setStats] = useState<CognitionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  /** 待审核认知列表相关 */
  const [items, setItems] = useState<CognitionItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsPage, setItemsPage] = useState(1);
  const [itemsLastPage, setItemsLastPage] = useState(1);
  const [itemsTotal, setItemsTotal] = useState(0);
  /** 批量操作：当前选中的 nodeId 集合 */
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<number>>(new Set());
  /** 批量操作执行中状态（'adopt' | 'reject' | null） */
  const [batchActionType, setBatchActionType] = useState<'adopt' | 'reject' | null>(null);

  /** 今日 AI 自动吸收相关 */
  const [todayAdoptedList, setTodayAdoptedList] = useState<CognitionItem[]>([]);
  const [todayAdoptedLoading, setTodayAdoptedLoading] = useState(true);
  const [isUpgradeCollapsed, setIsUpgradeCollapsed] = useState(true);

  /** 正在操作中的 nodeId（防止重复点击） */
  const [actioningIds, setActioningIds] = useState<Set<number>>(new Set());
  /** 用户编辑后的认知命题：key 为 node_id，value 为最新编辑的命题 */
  const [editedPropositions, setEditedPropositions] = useState<Record<number, string>>({});
  /** 用户编辑后的认知阐述/正文：key 为 node_id，value 为最新编辑的正文 */
  const [editedElaborations, setEditedElaborations] = useState<Record<number, string>>({});
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editingPropText, setEditingPropText] = useState<string>('');
  const [editingElabText, setEditingElabText] = useState<string>('');

  const startEditing = (item: CognitionItem) => {
    const curProp = editedPropositions[item.node_id] ?? item.proposition;
    const curElab = editedElaborations[item.node_id] ?? item.elaboration ?? '';
    setEditingNodeId(item.node_id);
    setEditingPropText(curProp);
    setEditingElabText(curElab);
  };

  const saveEditing = (nodeId: number) => {
    setEditedPropositions((prev) => ({
      ...prev,
      [nodeId]: editingPropText,
    }));
    setEditedElaborations((prev) => ({
      ...prev,
      [nodeId]: editingElabText,
    }));
    setEditingNodeId(null);
  };

  const cancelEditing = () => {
    setEditingNodeId(null);
  };

  /** 人设相关状态 */
  const [persona, setPersona] = useState<PersonaData | null>(null);
  const [personaLoading, setPersonaLoading] = useState(true);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);
  const [personaForm, setPersonaForm] = useState<{
    name: string;
    business: string;
    industry: string;
    positioning: string;
  }>({
    name: '',
    business: '',
    industry: '',
    positioning: '',
  });

  const hasValidPersona = Boolean(persona?.name?.trim() && persona?.business?.trim());

  /** 资料列表相关 */
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsPage, setDocsPage] = useState(1);
  const [docsLastPage, setDocsLastPage] = useState(1);
  const [docsTotal, setDocsTotal] = useState(0);

  /** 上传/删除/下载/重新萃取/更多菜单状态 */
  const [uploading, setUploading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [reExtractingId, setReExtractingId] = useState<number | null>(null);
  const [moreMenuDocId, setMoreMenuDocId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 自动同步弹窗控制 */
  const [showAutoUploadModal, setShowAutoUploadModal] = useState(false);
  const [autoUploadWatchDir, setAutoUploadWatchDir] = useState<string>('');
  const [autoUploadSyncing, setAutoUploadSyncing] = useState<boolean>(false);

  const refreshAutoUploadStatus = React.useCallback(() => {
    void secondBrainAutoUploadService.getConfigAndStatus().then((res) => {
      if (res) {
        setAutoUploadWatchDir(res.config.watchDir || '');
        setAutoUploadSyncing(res.status.isSyncing);
      }
    });
  }, []);

  useEffect(() => {
    refreshAutoUploadStatus();
    const cleanup = window.electron.secondBrainAutoUpload?.onStatusChanged?.((status) => {
      setAutoUploadWatchDir(status.watchDir || '');
      setAutoUploadSyncing(status.isSyncing);
    });
    return () => {
      cleanup?.();
    };
  }, [refreshAutoUploadStatus]);

  /** 触发立即同步操作 */
  const handleTriggerAutoSync = async () => {
    if (!autoUploadWatchDir) {
      showToast('error', i18nService.t('secondBrainNoSyncDirToast'));
      return;
    }
    if (autoUploadSyncing) return;

    setAutoUploadSyncing(true);
    try {
      const result = await secondBrainAutoUploadService.triggerSync();
      if (result.success) {
        if (result.count === 0) {
          showToast('info', i18nService.t('secondBrainAlreadyLatestToast'));
        } else {
          showToast('success', i18nService.t('secondBrainSyncSuccessToast', { count: result.count }));
        }
      } else {
        showToast('error', i18nService.t('secondBrainSyncScanFailToast'));
      }
    } catch {
      showToast('error', i18nService.t('secondBrainSyncExecuteErrorToast'));
    } finally {
      setAutoUploadSyncing(false);
    }
  };

  /** 点击外部关闭更多菜单 */
  useEffect(() => {
    const handleOutsideClick = () => {
      setMoreMenuDocId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  /** Toast 提示状态 */
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  /** 每周趋势数据 */
  const [trendWeeks, setTrendWeeks] = useState<TrendWeekItem[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  /** 添加/移除操作中标记 */
  const setActioning = (id: number, on: boolean) => {
    setActioningIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  /** 刷新统计数据 */
  const loadStats = () => {
    setStatsLoading(true);
    fetchCognitionStats()
      .then((data) => {
        setStats(data);
        if (data && typeof data.pending_count === 'number') {
          window.dispatchEvent(
            new CustomEvent('app:secondBrain:statsUpdated', { detail: data.pending_count })
          );
        }
      })
      .catch((err) => console.warn('[SecondBrainView] 统计接口失败:', err))
      .finally(() => setStatsLoading(false));
  };

  /** 拉取每周趋势数据 (近 8 周) */
  const loadTrend = () => {
    setTrendLoading(true);
    fetchCognitionTrend(8)
      .then((res) => {
        setTrendWeeks(res.weeks || []);
      })
      .catch((err) => {
        console.warn('[SecondBrainView] 每周趋势接口失败:', err);
        setTrendWeeks([]);
      })
      .finally(() => {
        setTrendLoading(false);
      });
  };

  /** 拉取待审核认知列表 (status: 0) */
  const loadItems = React.useCallback((page: number, options?: { silent?: boolean }): void => {
    if (!options?.silent) {
      setItemsLoading(true);
    }
    fetchCognitionItemList({ status: 0, page, pageSize: 10 })
      .then((res) => {
        const list = res.data || [];
        const lastPage = Number(res.last_page) || 1;
        const total = Number(res.total) || 0;

        // 若当前页已无数据但总数大于0且页码大于1（如整页裁决完毕），自动回退到上一页
        if (list.length === 0 && total > 0 && page > 1) {
          const prevPage = Math.min(page - 1, lastPage);
          setItemsPage(prevPage);
          loadItems(prevPage, options);
          return;
        }

        setItems(list);
        setItemsLastPage(lastPage);
        setItemsTotal(total);
      })
      .catch((err) => {
        console.warn('[SecondBrainView] 待审核认知列表接口失败:', err);
        if (!options?.silent) {
          setItems([]);
        }
      })
      .finally(() => {
        if (!options?.silent) {
          setItemsLoading(false);
        }
      });
  }, []);

  /** 拉取今日 AI 自动吸收列表 (status: 1, 当天时间范围) */
  const loadTodayAdopted = () => {
    setTodayAdoptedLoading(true);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    fetchCognitionItemList({
      status: 1,
      createTimeStart: `${ymd} 00:00:00`,
      createTimeEnd: `${ymd} 23:59:59`,
      page: 1,
      pageSize: 20,
    })
      .then((res) => {
        setTodayAdoptedList(res.data || []);
      })
      .catch((err) => { console.warn('[SecondBrainView] 今日自动吸收接口失败:', err); })
      .finally(() => { setTodayAdoptedLoading(false); });
  };

  /** 采纳 */
  const handleAdopt = async (item: CognitionItem) => {
    if (actioningIds.has(item.node_id)) return;
    setActioning(item.node_id, true);
    try {
      const propToAdopt = (editingNodeId === item.node_id ? editingPropText : editedPropositions[item.node_id]) ?? item.proposition;
      const elabToAdopt = (editingNodeId === item.node_id ? editingElabText : editedElaborations[item.node_id]) ?? item.elaboration;
      await adoptCognitionItem({
        nodeId: item.node_id,
        proposition: propToAdopt,
        elaboration: elabToAdopt,
      });
      if (editingNodeId === item.node_id) {
        setEditingNodeId(null);
      }
      setItems((prev) => prev.filter((i) => i.node_id !== item.node_id));
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(item.node_id);
        return next;
      });
      setItemsTotal((prev) => Math.max(0, prev - 1));
      loadStats();
      loadTodayAdopted();
      loadTrend();
      loadItems(itemsPage, { silent: true });
      showToast('success', item.replaces ? i18nService.t('secondBrainAdoptSuccessOverrideToast') : i18nService.t('secondBrainAdoptSuccessToast'));
    } catch (err: any) {
      console.warn('[SecondBrainView] 采纳失败:', err);
      showToast('error', i18nService.t('secondBrainAdoptFailToast', { msg: err?.message || '' }));
    } finally {
      setActioning(item.node_id, false);
    }
  };

  /** 驳回 */
  const handleReject = async (item: CognitionItem) => {
    if (actioningIds.has(item.node_id)) return;
    setActioning(item.node_id, true);
    try {
      await rejectCognitionItem(item.node_id);
      if (editingNodeId === item.node_id) {
        setEditingNodeId(null);
      }
      setItems((prev) => prev.filter((i) => i.node_id !== item.node_id));
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(item.node_id);
        return next;
      });
      setItemsTotal((prev) => Math.max(0, prev - 1));
      loadStats();
      loadItems(itemsPage, { silent: true });
      showToast('success', item.replaces ? i18nService.t('secondBrainRejectSuccessKeepToast') : i18nService.t('secondBrainRejectSuccessToast'));
    } catch (err: any) {
      console.warn('[SecondBrainView] 驳回失败:', err);
      showToast('error', i18nService.t('secondBrainRejectFailToast', { msg: err?.message || '' }));
    } finally {
      setActioning(item.node_id, false);
    }
  };

  /** 切换单项选择状态 */
  const toggleSelectNode = (nodeId: number) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  /** 全选 / 取消全选当前页 */
  const toggleSelectAllCurrentPage = () => {
    const selectableItems = items.filter((item) => !actioningIds.has(item.node_id));
    if (selectableItems.length === 0) return;

    const allSelected = selectableItems.every((item) => selectedNodeIds.has(item.node_id));
    if (allSelected) {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        selectableItems.forEach((item) => next.delete(item.node_id));
        return next;
      });
    } else {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        selectableItems.forEach((item) => next.add(item.node_id));
        return next;
      });
    }
  };

  /** 批量采纳 */
  const handleBatchAdopt = async () => {
    if (selectedNodeIds.size === 0 || batchActionType !== null) return;
    const targetItems = items.filter((item) => selectedNodeIds.has(item.node_id));
    if (targetItems.length === 0) return;

    setBatchActionType('adopt');
    // 标记所有选中项为处理中
    targetItems.forEach((i) => setActioning(i.node_id, true));

    let successCount = 0;
    let failCount = 0;

    try {
      await Promise.all(
        targetItems.map(async (item) => {
          try {
            const propToAdopt = (editingNodeId === item.node_id ? editingPropText : editedPropositions[item.node_id]) ?? item.proposition;
            const elabToAdopt = (editingNodeId === item.node_id ? editingElabText : editedElaborations[item.node_id]) ?? item.elaboration;
            await adoptCognitionItem({
              nodeId: item.node_id,
              proposition: propToAdopt,
              elaboration: elabToAdopt,
            });
            successCount += 1;
            setSelectedNodeIds((prev) => {
              const next = new Set(prev);
              next.delete(item.node_id);
              return next;
            });
          } catch (err) {
            console.warn(`[SecondBrainView] 批量采纳节点 ${item.node_id} 失败:`, err);
            failCount += 1;
          } finally {
            setActioning(item.node_id, false);
          }
        })
      );

      if (editingNodeId && selectedNodeIds.has(editingNodeId)) {
        setEditingNodeId(null);
      }

      loadStats();
      loadTodayAdopted();
      loadTrend();
      loadItems(itemsPage, { silent: true });

      if (failCount === 0) {
        showToast('success', i18nService.t('secondBrainBatchAdoptSuccessToast', { count: successCount }));
      } else {
        showToast('info', i18nService.t('secondBrainBatchAdoptDoneToast', { success: successCount, fail: failCount }));
      }
    } finally {
      setBatchActionType(null);
    }
  };

  /** 批量驳回 */
  const handleBatchReject = async () => {
    if (selectedNodeIds.size === 0 || batchActionType !== null) return;
    const targetItems = items.filter((item) => selectedNodeIds.has(item.node_id));
    if (targetItems.length === 0) return;

    setBatchActionType('reject');
    // 标记所有选中项为处理中
    targetItems.forEach((i) => setActioning(i.node_id, true));

    let successCount = 0;
    let failCount = 0;

    try {
      await Promise.all(
        targetItems.map(async (item) => {
          try {
            await rejectCognitionItem(item.node_id);
            successCount += 1;
            setSelectedNodeIds((prev) => {
              const next = new Set(prev);
              next.delete(item.node_id);
              return next;
            });
          } catch (err) {
            console.warn(`[SecondBrainView] 批量驳回节点 ${item.node_id} 失败:`, err);
            failCount += 1;
          } finally {
            setActioning(item.node_id, false);
          }
        })
      );

      if (editingNodeId && selectedNodeIds.has(editingNodeId)) {
        setEditingNodeId(null);
      }

      loadStats();
      loadItems(itemsPage, { silent: true });

      if (failCount === 0) {
        showToast('success', i18nService.t('secondBrainBatchRejectSuccessToast', { count: successCount }));
      } else {
        showToast('info', i18nService.t('secondBrainBatchRejectDoneToast', { success: successCount, fail: failCount }));
      }
    } finally {
      setBatchActionType(null);
    }
  };

  /** 加载人设详情 */
  const loadPersona = async () => {
    setPersonaLoading(true);
    try {
      const data = await fetchPersonaDetail();
      setPersona(data);
      if (data && data.name?.trim() && data.business?.trim()) {
        setPersonaForm({
          name: data.name ?? '',
          business: data.business ?? '',
          industry: data.industry ?? '',
          positioning: data.positioning ?? '',
        });
      } else {
        setShowPersonaModal(true);
      }
    } catch (err) {
      console.warn('[SecondBrainView] 获取人设详情失败:', err);
      setShowPersonaModal(true);
    } finally {
      setPersonaLoading(false);
    }
  };

  /** 保存/完善人设信息 */
  const handleSavePersona = async () => {
    if (!personaForm.name.trim() || !personaForm.business.trim() || savingPersona) return;
    setSavingPersona(true);
    try {
      await updatePersona({
        name: personaForm.name.trim(),
        business: personaForm.business.trim(),
        industry: personaForm.industry.trim(),
        positioning: personaForm.positioning.trim(),
      });
      setPersona({
        name: personaForm.name.trim(),
        business: personaForm.business.trim(),
        industry: personaForm.industry.trim(),
        positioning: personaForm.positioning.trim(),
      });
      setShowPersonaModal(false);
      loadStats();
      showToast('success', i18nService.t('secondBrainPersonaSaveSuccessToast'));
    } catch (err: any) {
      console.warn('[SecondBrainView] 保存人设失败:', err);
      showToast('error', i18nService.t('secondBrainPersonaSaveFailToast', { msg: err?.message || '' }));
    } finally {
      setSavingPersona(false);
    }
  };

  /** 挂载时拉取人设、统计、今日自动吸收和趋势 */
  useEffect(() => {
    loadPersona();
    loadStats();
    loadTodayAdopted();
    loadTrend();
  }, []);

  /** 翻页或挂载时拉取待审核认知列表 */
  useEffect(() => {
    setSelectedNodeIds(new Set());
    loadItems(itemsPage);
  }, [itemsPage, loadItems]);

  /** 拉取资料列表（根据当前 Tab 区分文档/对话/录音） */
  const loadDocs = React.useCallback((tab: MaterialTab, page: number) => {
    setDocsLoading(true);
    if (tab === '对话') {
      fetchChatList({ page, pageSize: 10 })
        .then((res) => {
          if (materialTab !== '对话') return;
          const list: DocumentItem[] = (res.data || []).map((item) => ({
            type: 'chat',
            id: item.chat_id,
            name: item.name,
            extract_status: item.extract_status,
            extract_count: item.extract_count,
            create_time: Number(item.create_time) || 0,
          }));
          setDocs(list);
          setDocsLastPage(Number(res.last_page) || 1);
          setDocsTotal(Number(res.total) || 0);
        })
        .catch((err) => { console.warn('[SecondBrainView] 对话列表接口失败:', err); })
        .finally(() => { setDocsLoading(false); });
    } else if (tab === '录音') {
      fetchAudioList({ page, pageSize: 10 })
        .then((res) => {
          if (materialTab !== '录音') return;
          const rawList = res.data || [];
          const list: DocumentItem[] = rawList.map((item) => ({
            type: 'audio' as any,
            id: item.audio_id,
            name: item.name,
            extract_status: item.extract_status,
            extract_count: item.extract_count,
            create_time: Number(item.create_time) || 0,
          }));
          setDocs(list);
          setDocsLastPage(Number(res.last_page) || 1);
          setDocsTotal(Number(res.total) || 0);
        })
        .catch((err) => { console.warn('[SecondBrainView] 录音音频列表接口失败:', err); })
        .finally(() => { setDocsLoading(false); });
    } else {
      fetchDocumentList({ page, pageSize: 10 })
        .then((res) => {
          if (materialTab !== '文档') return;
          const list: DocumentItem[] = (res.data || []).map((item) => ({
            type: 'document',
            id: item.document_id,
            name: item.name,
            extract_status: item.extract_status,
            extract_count: item.extract_count,
            create_time: Number(item.create_time) || 0,
          }));
          setDocs(list);
          setDocsLastPage(Number(res.last_page) || 1);
          setDocsTotal(Number(res.total) || 0);
        })
        .catch((err) => { console.warn('[SecondBrainView] 资料文档列表接口失败:', err); })
        .finally(() => { setDocsLoading(false); });
    }
  }, [materialTab]);

  /** 资料 Tab 或页码切换时拉取资料列表 */
  useEffect(() => {
    loadDocs(materialTab, docsPage);
  }, [loadDocs, materialTab, docsPage]);

  const loadDocsRef = useRef(loadDocs);
  loadDocsRef.current = loadDocs;
  const loadStatsRef = useRef(loadStats);
  loadStatsRef.current = loadStats;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  /** 监听自动同步成功事件，自动刷新列表与统计 */
  useEffect(() => {
    let isMounted = true;
    const handleDocUploaded = (e: Event) => {
      if (!isMounted) return;
      const customEvt = e as CustomEvent<{ count: number }>;
      const count = customEvt.detail?.count ?? 1;
      loadDocsRef.current('文档', 1);
      loadStatsRef.current();
      showToastRef.current('success', i18nService.t('secondBrainAutoSyncUploadedToast', { count }));
    };
    window.addEventListener('secondBrain:docUploaded', handleDocUploaded);

    return () => {
      isMounted = false;
      window.removeEventListener('secondBrain:docUploaded', handleDocUploaded);
    };
  }, []);

  /** Tab 切换处理（即刻清空历史列表，重置回第 1 页） */
  const handleTabChange = (tab: MaterialTab) => {
    if (tab === materialTab) return;
    setDocs([]);
    setDocsTotal(0);
    setDocsLastPage(1);
    setDocsLoading(true);
    setMaterialTab(tab);
    if (docsPage !== 1) {
      setDocsPage(1);
    }
  };

  /** 点击上传资料触发文件选择框 */
  const handleUploadClick = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  /** 文件选择回调：批量支持 预签名 -> TOS 上传 -> 创建记录 -> 刷新列表 */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = '';

    const unsupportedFiles: string[] = [];
    const oversizedFiles: string[] = [];
    const validFiles: File[] = [];

    for (const file of files) {
      // 忽略隐藏文件与 Office 临时锁文件（如 ~$xxx.docx）
      if (file.name.startsWith('.') || file.name.startsWith('~$')) {
        continue;
      }
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!SECOND_BRAIN_SUPPORTED_EXTENSIONS.includes(ext as any)) {
        unsupportedFiles.push(file.name);
      } else if (file.size > SECOND_BRAIN_MAX_FILE_SIZE) {
        oversizedFiles.push(file.name);
      } else {
        validFiles.push(file);
      }
    }

    if (unsupportedFiles.length > 0) {
      showToast(
        'error',
        i18nService.t('secondBrainFileFormatUnsupportedToast', {
          files: unsupportedFiles.join(', '),
          formats: SECOND_BRAIN_SUPPORTED_EXTENSIONS.join('、'),
        }),
      );
    }

    if (oversizedFiles.length > 0) {
      showToast('error', i18nService.t('secondBrainFileSizeExceededToast', { files: oversizedFiles.join(', ') }));
    }

    if (validFiles.length === 0) return;

    setUploading(true);

    const uploadItems = validFiles.map((file) => {
      let filePath: string | undefined;
      try {
        filePath = window.electron.dialog?.getPathForFile?.(file);
      } catch {
        // ignore
      }
      if (!filePath && (file as any).path) {
        filePath = (file as any).path;
      }
      return {
        name: file.name,
        content: file,
        filePath,
        mtimeMs: file.lastModified || Date.now(),
      };
    });

    const result = await batchUploadDocuments(uploadItems);

    if (result.realUploadedCount > 0) {
      loadDocs(materialTab, 1);
      loadStats();
    }

    if (result.failedItems.length === 0) {
      if (result.truncatedCount > 0) {
        showToast(
          'info',
          i18nService.t('secondBrainUploadMaxBatchToast', {
            uploaded: result.realUploadedCount,
            max: SECOND_BRAIN_MAX_BATCH_COUNT,
            remaining: result.truncatedCount,
          }),
        );
      } else if (result.realUploadedCount > 0 && result.skippedCount > 0) {
        showToast('success', i18nService.t('secondBrainUploadSuccessSkippedToast', {
          uploaded: result.realUploadedCount,
          skipped: result.skippedCount,
        }));
      } else if (result.realUploadedCount > 0) {
        showToast(
          'success',
          validFiles.length === 1
            ? i18nService.t('secondBrainUploadSingleSuccessToast', { name: validFiles[0].name })
            : i18nService.t('secondBrainUploadBatchSuccessToast', { count: result.realUploadedCount }),
        );
      } else if (result.skippedCount > 0) {
        showToast(
          'info',
          validFiles.length === 1
            ? i18nService.t('secondBrainUploadAlreadyExistsToast', { name: validFiles[0].name })
            : i18nService.t('secondBrainUploadAllSkippedToast', { count: result.skippedCount }),
        );
      }
    } else {
      const failSummary = result.failedItems.map((f) => `${f.name} (${f.error})`).join('；');
      if (result.realUploadedCount > 0) {
        showToast('error', i18nService.t('secondBrainUploadPartialFailToast', {
          uploaded: result.realUploadedCount,
          failedCount: result.failedItems.length,
          summary: failSummary,
        }));
      } else {
        showToast('error', i18nService.t('secondBrainUploadFailToast', { summary: failSummary }));
      }
    }

    setUploading(false);
  };

  /** 下载资料 */
  const handleDownload = async (docId: number) => {
    if (downloadingId === docId) return;
    setDownloadingId(docId);
    try {
      const res = await downloadDocument(docId);
      if (res.download_url) {
        const a = document.createElement('a');
        a.href = res.download_url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
        showToast('success', i18nService.t('secondBrainDownloadStartedToast'));
      }
    } catch (err: any) {
      console.warn('[SecondBrainView] 获取下载地址失败:', err);
      showToast('error', i18nService.t('secondBrainDownloadFailToast', { msg: err?.message || '' }));
    } finally {
      setDownloadingId(null);
    }
  };

  /** 重新萃取资料/音频 */
  const handleReExtract = async (docId: number, isAudio = false) => {
    if (reExtractingId === docId) return;
    setReExtractingId(docId);
    try {
      if (isAudio) {
        await reExtractAudio(docId);
      } else {
        await reExtractDocument(docId);
      }
      loadDocs(materialTab, docsPage);
      loadStats();
      showToast('success', i18nService.t('secondBrainReExtractSuccessToast'));
    } catch (err: any) {
      console.warn('[SecondBrainView] 重新萃取失败:', err);
      showToast('error', i18nService.t('secondBrainReExtractFailToast', { msg: err?.message || '' }));
    } finally {
      setReExtractingId(null);
    }
  };

  /** 确认删除 */
  const handleConfirmDelete = async () => {
    if (!deletingDoc || deleting) return;
    setDeleting(true);
    const docName = deletingDoc.name;
    const isChat = deletingDoc.type === 'chat';
    const isAudio = (deletingDoc.type as any) === 'audio';
    const typeLabel = isChat ? i18nService.t('secondBrainUnitChat') : isAudio ? i18nService.t('secondBrainUnitAudio') : i18nService.t('secondBrainUnitDoc');
    try {
      if (isChat) {
        await deleteChat(deletingDoc.id);
      } else if (isAudio) {
        await deleteAudio(deletingDoc.id);
      } else {
        await deleteDocument(deletingDoc.id);
      }
      setDeletingDoc(null);
      loadDocs(materialTab, docsPage);
      loadStats();
      showToast('success', i18nService.t('secondBrainDeleteSuccessToast', { type: typeLabel, name: docName }));
    } catch (err: any) {
      console.warn('[SecondBrainView] 删除失败:', err);
      showToast('error', i18nService.t('secondBrainDeleteFailToast', { msg: err?.message || '' }));
    } finally {
      setDeleting(false);
    }
  };

  /** 原型款通用居中分页器 */
  const renderPager = (
    page: number,
    lastPage: number,
    total: number,
    onPageChange: (p: number) => void,
    unitName: string
  ) => {
    if (lastPage <= 1) return null;
    return (
      <div className="flex items-center justify-center gap-3.5 pt-4 border-t border-border/70 text-xs select-none">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="min-w-[76px] h-7 px-3 rounded-lg border border-border bg-surface hover:bg-surface-raised font-bold text-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {i18nService.t('secondBrainPrevPage')}
        </button>
        <div className="flex items-center gap-1 font-mono">
          <span className="text-[#FF6B35] font-extrabold text-[15px]">{page}</span>
          <span className="text-secondary/60 font-semibold">/</span>
          <span className="text-secondary font-bold text-xs">{lastPage}</span>
        </div>
        <button
          type="button"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
          className="min-w-[76px] h-7 px-3 rounded-lg border border-border bg-surface hover:bg-surface-raised font-bold text-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {i18nService.t('secondBrainNextPage')}
        </button>
        <span
          className="text-secondary text-[11px] ml-1"
          dangerouslySetInnerHTML={{
            __html: i18nService.t('secondBrainTotalCount', {
              count: `<b class="text-foreground font-bold">${total}</b>`,
              unit: unitName,
            }),
          }}
        />
      </div>
    );
  };

  return (
    <div data-skin-management-page="true" className="relative z-10 flex-1 flex flex-col bg-background h-full overflow-hidden">
      {/* 顶部 Header */}
      <div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {isSidebarCollapsed && (
            <button
              type="button"
              className="non-draggable p-1.5 text-secondary hover:text-foreground hover:bg-surface-raised rounded-md transition-colors"
              onClick={onToggleSidebar}
              title={i18nService.t('secondBrainExpandSidebar')}
            >
              <SidebarToggleIcon className="w-4 h-4" isCollapsed={isSidebarCollapsed ?? false} />
            </button>
          )}
          <h1 className={`${MANAGEMENT_PAGE_TITLE_TEXT} font-semibold text-foreground`}>
            {i18nService.t('secondBrainTitle')}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {updateBadge}
        </div>
      </div>

      {/* 隐藏文件输入框（支持批量与常见格式） */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={SECOND_BRAIN_SUPPORTED_EXTENSIONS.join(',')}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 页面内容区域 */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        {personaLoading ? (
          <div className="h-full flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-secondary text-xs">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              <span>{i18nService.t('secondBrainLoading')}</span>
            </div>
          </div>
        ) : !hasValidPersona ? (
          <div className="h-full flex flex-col items-center justify-center py-24 text-center px-4 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-3xl">
              🧠
            </div>
            <h3 className="text-base font-bold text-foreground">{i18nService.t('secondBrainPersonaModalTitle')}</h3>
            <p className="text-xs text-secondary max-w-sm">
              {i18nService.t('secondBrainPersonaModalSubtitle')}
            </p>
            <button
              type="button"
              onClick={() => setShowPersonaModal(true)}
              className="mt-2 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors shadow-sm cursor-pointer"
            >
              {i18nService.t('secondBrainPersonaCompleteBtn')}
            </button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[1120px] px-8 py-6 space-y-5">

          {/* 1. 我的判断库（统领大卡片 .judge-lib） */}
          <div className="rounded-2xl border border-border bg-gradient-to-b from-surface to-surface-raised/40 p-5 md:p-6 shadow-[0_4px_16px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3.5 border-b border-dashed border-border/90">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-[#9b59b6]/15 via-[#f5a623]/10 to-[#34a853]/15 border border-[#9b59b6]/25 flex items-center justify-center text-2xl shadow-2xs">
                  🧠
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center">
                    <h2 className="text-sm md:text-[15px] font-bold text-foreground">
                      {persona?.name ? i18nService.t('secondBrainUserPersonaTitle', { name: persona.name }) : i18nService.t('secondBrainBossPersonaTitle')}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowPersonaModal(true)}
                      className="text-[11.5px] text-secondary hover:text-foreground underline ml-2 font-normal cursor-pointer"
                    >
                      {i18nService.t('secondBrainPersonaProfileBtn')}
                    </button>
                  </div>
                  <p className="text-xs text-secondary">
                    {i18nService.t('secondBrainPersonaRequiredNotice')} · <span dangerouslySetInnerHTML={{ __html: i18nService.t('secondBrainStatAdoptedCognition', { count: stats?.adopted_count ?? 0 }) }} />
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto">
                <div className="relative group">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={handleUploadClick}
                    className="bg-[#FF6B35] hover:bg-[#e85c27] text-white border-0 rounded-lg px-4 py-2 text-xs font-bold shadow-[0_2px_8px_rgba(255,107,53,0.3)] transition-all whitespace-nowrap disabled:opacity-50 cursor-pointer"
                  >
                    {uploading ? i18nService.t('secondBrainUploadingBtn') : i18nService.t('secondBrainUploadDocBtn')}
                  </button>
                  <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-20 whitespace-nowrap rounded-xl bg-black/90 dark:bg-black px-3.5 py-1.5 text-xs font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200">
                    {i18nService.t('secondBrainUploadDocTip')}
                  </div>
                </div>
              </div>
            </div>

            {/* 4 个大字重指标格 (.jl-states) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* 格子 1：持续学习 */}
              <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs transition hover:border-border/80">
                <div className="text-[11px] text-secondary font-medium mb-1">{i18nService.t('secondBrainStatContinuousLearn')}</div>
                <div className="text-[22px] font-extrabold text-foreground leading-tight flex items-baseline">
                  {statsLoading ? '--' : stats?.learning_days ?? 0}
                  <span className="text-xs font-semibold text-secondary ml-1">{i18nService.t('secondBrainStatContinuousLearnDays')}</span>
                </div>
                <div
                  className="text-[10.5px] text-secondary mt-1.5"
                  dangerouslySetInnerHTML={{
                    __html: i18nService.t('secondBrainStatUsageToday', {
                      count: `<b class="text-[#FF6B35] font-bold">${stats?.usage_count_today ?? 0}</b>`,
                    }),
                  }}
                />
              </div>

              {/* 格子 2：学习资料 */}
              <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs transition hover:border-border/80">
                <div className="text-[11px] text-secondary font-medium mb-1">{i18nService.t('secondBrainStatMaterials')}</div>
                <div className="text-[22px] font-extrabold text-foreground leading-tight flex items-baseline">
                  {statsLoading ? '--' : stats?.material_count ?? 0}
                  {i18nService.t('secondBrainStatMaterialsCount') && (
                    <span className="text-xs font-semibold text-secondary ml-1">{i18nService.t('secondBrainStatMaterialsCount')}</span>
                  )}
                </div>
                <div
                  className="text-[10.5px] text-secondary mt-1.5"
                  dangerouslySetInnerHTML={{
                    __html: i18nService.t('secondBrainStatUploads7d', {
                      count: `<b class="text-foreground font-bold">${stats?.material_count_7d ?? 0}</b>`,
                    }),
                  }}
                />
              </div>

              {/* 格子 3：已形成认知 */}
              <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs transition hover:border-border/80">
                <div className="text-[11px] text-secondary font-medium mb-1">{i18nService.t('secondBrainStatAdoptedCognition', { count: '' }).replace(/<[^>]+>/g, '')}</div>
                <div className="text-[22px] font-extrabold text-foreground leading-tight flex items-baseline">
                  {statsLoading ? '--' : stats?.adopted_count ?? 0}
                  <span className="text-xs font-semibold text-secondary ml-1">{i18nService.t('secondBrainStatAdoptedItems')}</span>
                </div>
                <div
                  className="text-[10.5px] text-secondary mt-1.5"
                  dangerouslySetInnerHTML={{
                    __html: i18nService.t('secondBrainStatYesterdayNew', {
                      count: `<b class="text-[#2d8a5f] dark:text-emerald-400 font-bold">${stats?.adopted_count_yesterday ?? 0}</b>`,
                    }),
                  }}
                />
              </div>

              {/* 格子 4：待确认认知 */}
              <div className="bg-[#f5a623]/5 border border-[#f5a623]/30 rounded-xl p-3.5 shadow-2xs transition hover:border-[#f5a623]/50">
                <div className="text-[11px] text-[#f5a623] font-medium mb-1">{i18nService.t('secondBrainStatPendingReview')}</div>
                <div className="text-[22px] font-extrabold text-[#f5a623] leading-tight flex items-baseline">
                  {statsLoading ? '--' : stats?.pending_count ?? 0}
                  <span className="text-xs font-semibold text-[#f5a623]/80 ml-1">{i18nService.t('secondBrainStatPendingItems')}</span>
                </div>
                <div className="text-[10.5px] text-[#f5a623] font-bold mt-1.5">
                  {i18nService.t('secondBrainStatPendingAction')}
                </div>
              </div>
            </div>
          </div>

          {/* 2. 今日 AI 自动吸收（单行折叠 + 点击展开 .upg-card） */}
          <div className="rounded-2xl border border-border bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden transition-all">
            <div
              onClick={() => setIsUpgradeCollapsed(!isUpgradeCollapsed)}
              className="grid grid-cols-[auto_1fr_auto] gap-3.5 items-center px-4 py-3 cursor-pointer select-none hover:bg-surface-raised/60 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">💡</span>
                <span className="text-xs md:text-sm font-bold text-foreground">{i18nService.t('secondBrainDailyBannerCount', { count: '' }).split('{')[0] || '今日 AI 自动吸收'}</span>
                <span className="text-[10.5px] font-bold bg-[#2d8a5f] text-white px-2 py-0.5 rounded-md">
                  {todayAdoptedList.length}
                </span>
              </div>

              <div className="text-xs text-secondary truncate hidden sm:block">
                {todayAdoptedLoading
                  ? i18nService.t('secondBrainExtracting')
                  : todayAdoptedList.length > 0
                  ? i18nService.t('secondBrainDailyBannerCount', { count: todayAdoptedList.length })
                  : i18nService.t('secondBrainDailyBannerEmpty')}
              </div>

              <div className="flex items-center gap-1 text-xs font-bold text-[#2d8a5f] shrink-0">
                <span>{isUpgradeCollapsed ? i18nService.t('secondBrainDailyViewDetails') : i18nService.t('secondBrainDailyCollapse')}</span>
                <span className={`inline-block transition-transform duration-200 ${isUpgradeCollapsed ? '' : 'rotate-180'}`}>
                  ▾
                </span>
              </div>
            </div>

            {/* 展开内容 */}
            {!isUpgradeCollapsed && (
              <div className="border-t border-border px-4 py-3.5 bg-background/40 space-y-2.5">
                {todayAdoptedLoading && (
                  <div className="py-6 text-center text-xs text-secondary/60">{i18nService.t('secondBrainTrendsLoading')}</div>
                )}
                {!todayAdoptedLoading && todayAdoptedList.length === 0 && (
                  <div className="py-6 text-center text-xs text-secondary">
                    {i18nService.t('secondBrainDailyEmptyDesc')}
                  </div>
                )}
                {!todayAdoptedLoading && todayAdoptedList.length > 0 && (
                  <div className="space-y-2">
                    {todayAdoptedList.map((item) => (
                      <div
                        key={item.node_id}
                        className="bg-surface border border-border border-l-[3.5px] border-l-[#2d8a5f] rounded-2xl p-3.5 space-y-1.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10.5px] font-bold text-[#2d8a5f] bg-[#2d8a5f]/12 px-2 py-0.5 rounded-[6px]">
                              {i18nService.t('secondBrainDailyNewBadge')}
                            </span>
                            <span className="text-[10px] font-bold text-secondary bg-surface-raised border border-border px-1.5 py-0.5 rounded">
                              {getLayerLabel(item.layer)}
                            </span>
                          </div>
                          <span className="text-[11px] text-secondary/60">{formatTimestamp(item.create_time)}</span>
                        </div>
                        <p className="text-xs font-semibold text-foreground leading-relaxed">
                          "{item.proposition}"
                        </p>
                        {item.elaboration && (
                          <p className="text-[11px] text-secondary leading-relaxed">
                            {item.elaboration}
                          </p>
                        )}
                        <div className="text-[10.5px] text-secondary/70 pt-0.5">
                          📥 {item.source_type === 1 ? i18nService.t('secondBrainPendingSourceDoc') : item.source_type === 2 ? i18nService.t('secondBrainPendingSourceChat') : item.source_type === 3 ? i18nService.t('secondBrainPendingSourceAudio') : i18nService.t('secondBrainPendingSourceGeneral')} · 已写入商业第二大脑
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-border/60 text-center text-[11px] text-secondary">
                  <span dangerouslySetInnerHTML={{ __html: i18nService.t('secondBrainDailySummaryText', { today: todayAdoptedList.length, total: stats?.adopted_count ?? 0 }) }} />
                </div>
              </div>
            )}
          </div>

          {/* 3. 待审核认知区 (#s-pending) */}
          <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground">
                    {i18nService.t('secondBrainPendingTitle')}
                  </h2>
                  {itemsTotal > 0 && (
                    <span className="text-xs font-bold bg-[#f5a623]/15 text-[#f5a623] px-2 py-0.5 rounded-md">
                      {itemsTotal}
                    </span>
                  )}
                </div>
                <p className="text-xs text-secondary mt-1">
                  {i18nService.t('secondBrainPendingSubtitle')}
                </p>
              </div>

              {/* 批量操作工具栏 */}
              {!itemsLoading && items.length > 0 && (
                <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0 bg-surface-raised/70 border border-border/80 px-3 py-1.5 rounded-xl">
                  <label className="flex items-center gap-1.5 text-xs text-secondary hover:text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={
                        items.length > 0 &&
                        items.every((item) => selectedNodeIds.has(item.node_id))
                      }
                      ref={(el) => {
                        if (el) {
                          const hasSelected = items.some((item) => selectedNodeIds.has(item.node_id));
                          const allSelected = items.length > 0 && items.every((item) => selectedNodeIds.has(item.node_id));
                          el.indeterminate = hasSelected && !allSelected;
                        }
                      }}
                      onChange={toggleSelectAllCurrentPage}
                      disabled={batchActionType !== null}
                      className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
                    />
                    <span>{i18nService.t('secondBrainPendingSelectAll')}</span>
                  </label>

                  {selectedNodeIds.size > 0 && (
                    <span
                      className="text-xs text-secondary font-medium"
                      dangerouslySetInnerHTML={{
                        __html: i18nService.t('secondBrainPendingSelectedCount', {
                          count: `<b class="text-foreground">${selectedNodeIds.size}</b>`,
                        }),
                      }}
                    />
                  )}

                  <div className="h-3.5 w-[1px] bg-border/80 mx-0.5" />

                  <button
                    type="button"
                    disabled={selectedNodeIds.size === 0 || batchActionType !== null}
                    onClick={handleBatchAdopt}
                    className="bg-[#f5a623] hover:bg-[#df9318] text-white font-bold text-xs px-2.5 py-1 rounded-lg border border-[#f5a623] shadow-2xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {batchActionType === 'adopt' ? i18nService.t('secondBrainPendingBatchAdopting') : i18nService.t('secondBrainPendingBatchAdopt')}
                  </button>

                  <button
                    type="button"
                    disabled={selectedNodeIds.size === 0 || batchActionType !== null}
                    onClick={handleBatchReject}
                    className="border border-border bg-surface hover:bg-surface-raised text-foreground font-semibold text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {batchActionType === 'reject' ? i18nService.t('secondBrainPendingBatchRejecting') : i18nService.t('secondBrainPendingBatchReject')}
                  </button>
                </div>
              )}
            </div>

            {/* 加载中 */}
            {itemsLoading && (
              <div className="flex items-center justify-center py-10">
                <span className="text-xs text-secondary/60">{i18nService.t('secondBrainTrendsLoading')}</span>
              </div>
            )}

            {/* 空状态 */}
            {!itemsLoading && items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-10 w-10 rounded-full bg-surface-raised border border-border flex items-center justify-center mb-2 text-secondary font-bold">
                  ✓
                </div>
                <p className="text-xs font-semibold text-foreground">{i18nService.t('secondBrainPendingEmptyCount')}</p>
                <p className="text-[11px] text-secondary mt-0.5">{i18nService.t('secondBrainPendingEmptySubtitle')}</p>
              </div>
            )}

            {/* 待审核列表 */}
            {!itemsLoading && items.length > 0 && (
              <div className="space-y-3.5">
                {items.map((item) => {
                  const isConflict = Boolean(item.replaces);
                  const isEditing = editingNodeId === item.node_id;
                  const isSelected = selectedNodeIds.has(item.node_id);
                  const isActioning = actioningIds.has(item.node_id);

                  return (
                    <div
                      key={item.node_id}
                      className={`rounded-2xl border ${
                        isSelected
                          ? 'border-primary/60 ring-1 ring-primary/30'
                          : 'border-border'
                      } ${
                        isConflict ? 'border-l-[3.5px] border-l-[#f53f3f]' : 'border-l-[3.5px] border-l-[#9b59b6]'
                      } bg-surface p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-3.5 transition`}
                    >
                      {/* 顶部标签与来源 */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="flex items-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isActioning || batchActionType !== null}
                              onChange={() => toggleSelectNode(item.node_id)}
                              className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
                            />
                          </label>
                          <span className="text-[10.5px] font-extrabold text-[#9b59b6] bg-[#9b59b6]/12 px-2.5 py-0.5 rounded-[7px]">
                            {getLayerLabel(item.layer)}
                          </span>
                          <span className={`text-[11px] font-bold ${isConflict ? 'text-[#f53f3f]' : 'text-secondary'}`}>
                            {isConflict ? i18nService.t('secondBrainPendingConflictBadge') : i18nService.t('secondBrainPendingCandidateBadge')}
                          </span>
                        </div>
                        <span className="text-[11px] text-secondary ml-auto">
                          {item.source_type === 1 && (item.source_name ? i18nService.t('secondBrainPendingSourceNamed', { name: item.source_name }) : i18nService.t('secondBrainPendingSourceDoc'))}
                          {item.source_type === 2 && (item.source_name ? i18nService.t('secondBrainPendingSourceNamed', { name: item.source_name }) : i18nService.t('secondBrainPendingSourceChat'))}
                          {item.source_type === 3 && (item.source_name ? i18nService.t('secondBrainPendingSourceNamed', { name: item.source_name }) : i18nService.t('secondBrainPendingSourceAudio'))}
                          {item.source_type === 9 && (item.source_name ? i18nService.t('secondBrainPendingSourceNamed', { name: item.source_name }) : i18nService.t('secondBrainPendingSourceGeneral'))}
                          {` · ${formatTimestamp(item.create_time)}`}
                        </span>
                      </div>

                      {/* 编辑态 */}
                      {isEditing ? (
                        <div className="space-y-2.5 pt-1">
                          <div>
                            <label className="block text-[11px] font-medium text-secondary mb-1">
                              {i18nService.t('secondBrainPendingEditTitleLabel')}
                            </label>
                            <input
                              type="text"
                              autoFocus
                              value={editingPropText}
                              onChange={(e) => setEditingPropText(e.target.value)}
                              placeholder={i18nService.t('secondBrainPendingEditTitlePlaceholder')}
                              className="w-full rounded-lg border border-primary bg-surface px-3 py-2 text-xs font-semibold text-foreground outline-none shadow-2xs focus:ring-1 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-secondary mb-1">
                              {i18nService.t('secondBrainPendingEditContentLabel')}
                            </label>
                            <textarea
                              rows={3}
                              value={editingElabText}
                              onChange={(e) => setEditingElabText(e.target.value)}
                              placeholder={i18nService.t('secondBrainPendingEditContentPlaceholder')}
                              className="w-full rounded-lg border border-primary bg-surface px-3 py-2 text-xs text-foreground outline-none shadow-2xs focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-secondary hover:bg-surface transition-colors cursor-pointer"
                            >
                              {i18nService.t('secondBrainPendingCancelEdit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditing(item.node_id)}
                              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors shadow-2xs cursor-pointer"
                            >
                              {i18nService.t('secondBrainPendingFinishEdit')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* 展示态：普通认知 vs 冲突对比认知 */
                        <>
                          {isConflict ? (
                            <div className="space-y-2.5">
                              {/* VS 对比框 */}
                              <div className="grid grid-cols-[minmax(0,1fr)_38px_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_42px_minmax(0,1fr)] items-stretch gap-2 md:gap-3">
                                {/* 左侧：旧认知 */}
                                <div className="min-w-0 flex flex-col justify-between bg-[#f5a623]/8 border border-[#f5a623]/30 rounded-xl p-3.5 space-y-2">
                                  <div className="space-y-1.5">
                                    <div className="text-[11px] font-extrabold text-[#f5a623]">{i18nService.t('secondBrainPendingOldCognitionTitle')}</div>
                                    <div className="text-xs md:text-[13px] font-bold text-foreground leading-snug break-words">
                                      "{item.replaces?.proposition || i18nService.t('secondBrainPendingOldCognitionDefault')}"
                                    </div>
                                  </div>
                                  <div className="text-[10.5px] text-secondary bg-surface px-2.5 py-1 rounded-[5px] border-l-2 border-l-[#f5a623] truncate block shadow-2xs" title={item.replaces?.elaboration || i18nService.t('secondBrainPendingAdoptedTitle')}>
                                    {item.replaces?.elaboration || i18nService.t('secondBrainPendingAdoptedTitle')}
                                  </div>
                                </div>

                                {/* 中间：VS 圆圈 */}
                                <div className="flex items-center justify-center shrink-0">
                                  <div className="w-8 h-8 md:w-[34px] md:h-[34px] rounded-full bg-[#f5a623] text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                    VS
                                  </div>
                                </div>

                                {/* 右侧：新萃取 */}
                                <div className="min-w-0 flex flex-col justify-between bg-[#4a8fe7]/8 border border-[#4a8fe7]/30 rounded-xl p-3.5 space-y-2">
                                  <div className="space-y-1.5">
                                    <div className="text-[11px] font-extrabold text-[#4a8fe7]">{i18nService.t('secondBrainPendingNewCognitionTitle')}</div>
                                    <div className="text-xs md:text-[13px] font-bold text-foreground leading-snug break-words">
                                      "{editedPropositions[item.node_id] ?? item.proposition}"
                                    </div>
                                  </div>
                                  <div className="text-[10.5px] text-secondary bg-surface px-2.5 py-1 rounded-[5px] border-l-2 border-l-[#4a8fe7] truncate block shadow-2xs" title={item.source_name || i18nService.t('secondBrainPendingNewCognitionDefault')}>
                                    {item.source_name || i18nService.t('secondBrainPendingNewCognitionDefault')}
                                  </div>
                                </div>
                              </div>

                              {/* 提示文案 */}
                              <div className="bg-surface-raised/80 rounded-lg px-3.5 py-2 text-[11.5px] text-secondary leading-relaxed">
                                {i18nService.t('secondBrainPendingOverrideTip')}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-border bg-surface-raised/50 p-3.5 space-y-2">
                              <div className="text-xs md:text-[13.5px] font-bold text-foreground leading-relaxed">
                                {editedPropositions[item.node_id] ?? item.proposition}
                              </div>
                              {(editedElaborations[item.node_id] ?? item.elaboration) && (
                                <p className="text-xs text-secondary leading-relaxed">
                                  {editedElaborations[item.node_id] ?? item.elaboration}
                                </p>
                              )}
                              <div
                                className="text-[11.5px] text-secondary leading-relaxed border-t border-border/60 pt-2"
                                dangerouslySetInnerHTML={{ __html: i18nService.t('secondBrainPendingImpactTip') }}
                              />
                            </div>
                          )}

                          {/* 底部按钮组 (.pact) */}
                          <div className="flex items-center gap-2.5 pt-1">
                            <button
                              type="button"
                              disabled={actioningIds.has(item.node_id)}
                              onClick={() => handleAdopt(item)}
                              className="bg-[#f5a623] hover:bg-[#df9318] text-white font-bold text-xs px-4 py-1.5 rounded-lg border border-[#f5a623] shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {actioningIds.has(item.node_id) ? i18nService.t('secondBrainPendingProcessing') : i18nService.t('secondBrainPendingAdoptBtn')}
                            </button>
                            <button
                              type="button"
                              disabled={actioningIds.has(item.node_id)}
                              onClick={() => handleReject(item)}
                              className="border border-border bg-surface-raised hover:bg-surface text-foreground font-semibold text-xs px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {actioningIds.has(item.node_id) ? i18nService.t('secondBrainPendingProcessing') : i18nService.t('secondBrainPendingRejectBtn')}
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditing(item)}
                              className="border border-border bg-surface-raised hover:bg-surface text-foreground font-semibold text-xs px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              {i18nService.t('secondBrainPendingEditBtn')}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* 分页器 */}
                {renderPager(itemsPage, itemsLastPage, itemsTotal, setItemsPage, i18nService.t('secondBrainPendingTitle'))}
              </div>
            )}
          </div>

          {/* 4. 学习资料区 (#s-materials) */}
          <div id="s-materials" className="space-y-2">
            <div className="text-[11px] font-bold tracking-wider text-secondary uppercase">
              {i18nService.t('secondBrainMaterialsTitle')}
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4">
              {/* Tab 栏 + 上传按钮 (.mtabs) */}
              <div className="flex items-center justify-between border-b border-border">
                <div className="flex items-end gap-1 -mb-[1px]">
                  {MATERIAL_TABS.map((tab) => {
                    const tabLabel = tab === '文档' ? i18nService.t('secondBrainTabDocument') : tab === '对话' ? i18nService.t('secondBrainTabChat') : i18nService.t('secondBrainTabAudio');
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => handleTabChange(tab)}
                        className={`text-xs md:text-sm px-4 py-2 rounded-t-lg transition-colors cursor-pointer border-b-2 ${
                          materialTab === tab
                            ? 'bg-[#FF6B35]/10 text-[#FF6B35] border-b-[#FF6B35] font-bold'
                            : 'text-secondary hover:text-foreground border-b-transparent font-semibold'
                        }`}
                      >
                        {tabLabel}
                      </button>
                    );
                  })}
                </div>

                {/* 仅在文档 Tab 下展示上传与自动同步按钮 */}
                {materialTab === '文档' && (
                  <div className="flex items-center gap-2 mb-1.5">
                    {/* 自动同步悬停菜单入口 */}
                    <div className="relative group">
                      <button
                        type="button"
                        onClick={() => setShowAutoUploadModal(true)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-surface-raised/60 hover:bg-surface-raised text-secondary hover:text-foreground transition-colors flex items-center gap-1.5 cursor-pointer font-medium"
                      >
                        <span className={autoUploadSyncing ? 'animate-spin' : ''}>
                          {autoUploadSyncing ? '🔄' : '📁'}
                        </span>
                        <span>{i18nService.t('secondBrainAutoSyncBtn')}</span>
                        <span className="text-[10px] text-secondary/60 group-hover:text-foreground transition-transform duration-150 group-hover:rotate-180">
                          ▾
                        </span>
                      </button>

                      {/* 鼠标悬浮下拉菜单 */}
                      <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150 absolute left-0 top-full pt-1 z-30">
                        <div className="min-w-[124px] bg-surface border border-border rounded-xl shadow-modal p-1 space-y-0.5 text-xs backdrop-blur-md">
                          <button
                            type="button"
                            onClick={() => setShowAutoUploadModal(true)}
                            className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-surface-raised text-foreground transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <span>⚙️</span>
                            <span>{i18nService.t('secondBrainAutoSyncSetting')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={!autoUploadWatchDir || autoUploadSyncing}
                            onClick={handleTriggerAutoSync}
                            title={!autoUploadWatchDir ? i18nService.t('secondBrainNoSyncDirToast') : undefined}
                            className={`w-full px-2.5 py-1.5 text-left rounded-lg transition-colors flex items-center gap-2 ${
                              !autoUploadWatchDir || autoUploadSyncing
                                ? 'opacity-40 cursor-not-allowed text-secondary'
                                : 'hover:bg-surface-raised text-foreground cursor-pointer'
                            }`}
                          >
                            <span className={autoUploadSyncing ? 'animate-spin' : ''}>🔄</span>
                            <span>{autoUploadSyncing ? i18nService.t('secondBrainSyncingBtn') : i18nService.t('secondBrainSyncNowBtn')}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 手动上传文档按钮 */}
                    <div className="relative group">
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={handleUploadClick}
                        className="bg-[#4a8fe7] hover:bg-[#3b7ed4] text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-2xs transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <span>+</span>
                        <span>{uploading ? i18nService.t('secondBrainUploadingBtn') : i18nService.t('secondBrainUploadDocBtn')}</span>
                      </button>
                      <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-20 whitespace-nowrap rounded-xl bg-black/90 dark:bg-black px-3.5 py-1.5 text-xs font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200">
                        {i18nService.t('secondBrainUploadDocTip')}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 加载中 */}
              {docsLoading && (
                <div className="flex items-center justify-center py-10">
                  <span className="text-xs text-secondary/60">{i18nService.t('secondBrainTrendsLoading')}</span>
                </div>
              )}

              {/* 当前 Tab 匹配的有效资料列表 */}
              {(() => {
                const currentDocs = docs.filter((d) => {
                  if (materialTab === '录音') return (d.type as any) === 'audio';
                  if (materialTab === '对话') return d.type === 'chat';
                  return d.type === 'document';
                });

                return (
                  <>
                    {/* 空状态 */}
                    {!docsLoading && currentDocs.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="h-10 w-10 rounded-full bg-surface-raised border border-border flex items-center justify-center mb-2 text-secondary text-base">
                          {materialTab === '录音' ? '🎙' : materialTab === '对话' ? '💬' : '📄'}
                        </div>
                        <p className="text-xs font-semibold text-foreground">
                          {materialTab === '对话' ? i18nService.t('secondBrainEmptyChat') : materialTab === '录音' ? i18nService.t('secondBrainEmptyAudio') : i18nService.t('secondBrainEmptyDoc')}
                        </p>
                        <p className="text-[11px] text-secondary mt-0.5">
                          {materialTab === '对话'
                            ? i18nService.t('secondBrainEmptyChatDesc')
                            : materialTab === '录音'
                            ? i18nService.t('secondBrainEmptyAudioDesc')
                            : i18nService.t('secondBrainEmptyDocDesc')}
                        </p>
                      </div>
                    )}

                    {/* 资料列表 (.mlist & .mitem) */}
                    {!docsLoading && currentDocs.length > 0 && (
                      <div className="space-y-2.5">
                        {currentDocs.map((doc) => (
                          <div
                            key={`${doc.type}-${doc.id}`}
                            className="group flex items-center gap-3.5 p-3 rounded-xl border border-border/80 bg-background/40 hover:bg-surface hover:border-primary/40 transition-all shadow-2xs"
                          >
                            {/* 图标 .mic */}
                            <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-sm shrink-0">
                              {doc.type === 'document' ? '📄' : (doc.type as any) === 'audio' ? '🎧' : '💬'}
                            </div>

                            {/* 主信息 .mbody */}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs md:text-[13px] font-semibold text-foreground truncate">{doc.name}</div>
                              <div className="text-[11px] text-secondary mt-0.5 flex items-center gap-1.5">
                                <span>{formatDate(doc.create_time)}</span>
                                <span>·</span>
                                {doc.extract_status === DOCUMENT_STATUS.Pending && (
                                  <span className="text-[#f5a623] font-semibold">{i18nService.t('secondBrainQueued')}</span>
                                )}
                                {doc.extract_status === DOCUMENT_STATUS.Processing && (
                                  <span className="text-[#4a8fe7] font-semibold">{i18nService.t('secondBrainExtracting')}</span>
                                )}
                                {doc.extract_status === DOCUMENT_STATUS.Done && (
                                  <span className="text-[#2d8a5f] dark:text-emerald-400 font-semibold">
                                    {i18nService.t('secondBrainExtractedCount', { count: doc.extract_count })}
                                  </span>
                                )}
                                {doc.extract_status === DOCUMENT_STATUS.Failed && (
                                  <span className="text-destructive font-semibold">{i18nService.t('secondBrainReExtractFailToast', { msg: '' }).split(':')[0]}</span>
                                )}
                              </div>
                            </div>

                            {/* 右侧操作 .mops */}
                            <div
                              className={`flex items-center gap-2 shrink-0 transition-opacity ${
                                moreMenuDocId === doc.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                            >
                              {(doc.type === 'document' || (doc.type as any) === 'audio') && (
                                <div className="relative group/re">
                                  <button
                                    type="button"
                                    disabled={
                                      reExtractingId === doc.id ||
                                      doc.extract_status === DOCUMENT_STATUS.Pending ||
                                      doc.extract_status === DOCUMENT_STATUS.Processing
                                    }
                                    onClick={() => handleReExtract(doc.id, (doc.type as any) === 'audio')}
                                    className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                  >
                                    {reExtractingId === doc.id || doc.extract_status === DOCUMENT_STATUS.Processing
                                      ? i18nService.t('secondBrainExtracting')
                                      : doc.extract_status === DOCUMENT_STATUS.Pending
                                      ? i18nService.t('secondBrainQueued')
                                      : i18nService.t('secondBrainReExtractBtn')}
                                  </button>
                                  <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-20 whitespace-nowrap rounded-xl bg-black/90 dark:bg-black px-3.5 py-1.5 text-xs font-medium text-white shadow-lg opacity-0 group-hover/re:opacity-100 transition-all duration-200">
                                    {doc.extract_status === DOCUMENT_STATUS.Pending || doc.extract_status === DOCUMENT_STATUS.Processing
                                      ? i18nService.t('secondBrainProcessingCannotReExtract')
                                      : i18nService.t('secondBrainDeleteCascadeTip')}
                                  </div>
                                </div>
                              )}

                              {doc.type === 'document' ? (
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMoreMenuDocId(moreMenuDocId === doc.id ? null : doc.id);
                                    }}
                                    className={`h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border text-xs text-secondary hover:bg-surface-raised hover:text-foreground transition-colors cursor-pointer ${
                                      moreMenuDocId === doc.id ? 'bg-surface-raised text-foreground' : ''
                                    }`}
                                    title={i18nService.t('secondBrainMoreOps')}
                                  >
                                    ···
                                  </button>
                                  {moreMenuDocId === doc.id && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-0 top-full mt-1 z-30 min-w-[88px] rounded-xl border border-border bg-surface p-1 shadow-lg animate-in fade-in"
                                    >
                                      <button
                                        type="button"
                                        disabled={downloadingId === doc.id}
                                        onClick={() => {
                                          setMoreMenuDocId(null);
                                          handleDownload(doc.id);
                                        }}
                                        className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised transition-colors disabled:opacity-50 cursor-pointer"
                                      >
                                        {downloadingId === doc.id ? i18nService.t('secondBrainDownloading') : i18nService.t('secondBrainDownloadBtn')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setMoreMenuDocId(null);
                                          setDeletingDoc(doc);
                                        }}
                                        className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                      >
                                        {i18nService.t('secondBrainDeleteConfirmBtn')}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setDeletingDoc(doc)}
                                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-secondary hover:bg-surface-raised hover:text-destructive transition-colors cursor-pointer"
                                >
                                  {i18nService.t('secondBrainDeleteConfirmBtn')}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* 分页器 */}
                        {renderPager(docsPage, docsLastPage, docsTotal, setDocsPage, materialTab === '对话' ? i18nService.t('secondBrainUnitChat') : materialTab === '录音' ? i18nService.t('secondBrainUnitAudio') : i18nService.t('secondBrainUnitDoc'))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* 5. 大脑词条近况 (#s-fmp) */}
          <div className="rounded-2xl border border-[#FF6B35]/25 bg-gradient-to-b from-[#FF6B35]/[0.02] to-surface bg-surface p-5 md:p-6 shadow-[0_4px_20px_rgba(255,107,53,0.05)] space-y-4">
            <div className="pb-3.5 border-b border-dashed border-[#FF6B35]/20">
              <h2 className="text-sm font-bold text-foreground">
                {i18nService.t('secondBrainTrendsTitle')}
              </h2>
              <p
                className="text-xs text-secondary mt-1"
                dangerouslySetInnerHTML={{
                  __html: i18nService.t('secondBrainTrendsSubtitle', {
                    newCount: `<b class="text-foreground font-bold">${trendWeeks[trendWeeks.length - 1]?.adopted_count ?? 0}</b>`,
                    total: `<b class="text-foreground font-bold">${stats?.adopted_count ?? 0}</b>`,
                  }),
                }}
              />
            </div>

            {/* 判断力成长曲线 */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs md:text-[13px] font-bold text-foreground flex items-center gap-1.5">
                  <span>📈</span>
                  <span>{i18nService.t('secondBrainTrendsCurveTitle')}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-secondary">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#2d8a5f]" />
                    {i18nService.t('secondBrainTrendsAdoptedLegend')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#FF6B35]" />
                    {i18nService.t('secondBrainTrendsInvokedLegend')}
                  </span>
                </div>
              </div>

              {/* 曲线图 */}
              {trendLoading ? (
                <div className="h-[120px] flex items-center justify-center text-xs text-secondary/60">
                  {i18nService.t('secondBrainTrendsLoading')}
                </div>
              ) : trendWeeks.length === 0 ? (
                <div className="h-[120px] flex items-center justify-center text-xs text-secondary/60">
                  {i18nService.t('secondBrainTrendsEmpty')}
                </div>
              ) : (() => {
                const count = trendWeeks.length;
                const maxVal = Math.max(...trendWeeks.flatMap((w) => [w.adopted_count, w.usage_count]), 1);
                const stepX = count > 1 ? (302 - 18) / (count - 1) : 0;

                const pointsUsage = trendWeeks.map((w, idx) => {
                  const x = 18 + idx * stepX;
                  const y = 68 - (w.usage_count / maxVal) * 52;
                  return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), val: w.usage_count, week: w };
                });

                const pointsAdopted = trendWeeks.map((w, idx) => {
                  const x = 18 + idx * stepX;
                  const y = 68 - (w.adopted_count / maxVal) * 52;
                  return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), val: w.adopted_count, week: w };
                });

                const pathUsage = pointsUsage.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                const fillUsage = `${pathUsage} L${pointsUsage[pointsUsage.length - 1].x},72 L${pointsUsage[0].x},72 Z`;
                const pathAdopted = pointsAdopted.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

                return (
                  <div className="space-y-2">
                    <div className="relative pt-1">
                      <svg className="w-full h-[95px] block overflow-visible" viewBox="0 0 320 80" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="gcFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FF6B35" stopOpacity="0.22" />
                            <stop offset="100%" stopColor="#FF6B35" stopOpacity="0" />
                          </linearGradient>
                        </defs>

                        {/* 浅灰极细水平参考线 */}
                        <line x1="10" y1="16" x2="310" y2="16" stroke="currentColor" strokeDasharray="3 3" opacity="0.06" />
                        <line x1="10" y1="42" x2="310" y2="42" stroke="currentColor" strokeDasharray="3 3" opacity="0.06" />
                        <line x1="10" y1="68" x2="310" y2="68" stroke="currentColor" opacity="0.1" />

                        {/* 悬浮列极细竖向导引虚线 */}
                        {hoveredWeekIndex !== null && pointsUsage[hoveredWeekIndex] && (
                          <line
                            x1={pointsUsage[hoveredWeekIndex].x}
                            y1={6}
                            x2={pointsUsage[hoveredWeekIndex].x}
                            y2={72}
                            stroke="currentColor"
                            strokeWidth="0.8"
                            strokeDasharray="2 2"
                            opacity="0.3"
                          />
                        )}

                        {/* 面积渐变与主折线 */}
                        <path d={fillUsage} fill="url(#gcFill)" />
                        <path
                          d={pathUsage}
                          fill="none"
                          stroke="#FF6B35"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                        <path
                          d={pathAdopted}
                          fill="none"
                          stroke="#2d8a5f"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray="3 3"
                          opacity=".85"
                          vectorEffect="non-scaling-stroke"
                        />

                        {/* 悬浮时精致发光高亮点（仅悬停时展示精致双层微点） */}
                        {hoveredWeekIndex !== null && pointsUsage[hoveredWeekIndex] && (
                          <g>
                            {/* 橙色调用点 */}
                            <circle
                              cx={pointsUsage[hoveredWeekIndex].x}
                              cy={pointsUsage[hoveredWeekIndex].y}
                              r="5.5"
                              fill="#FF6B35"
                              opacity="0.22"
                            />
                            <circle
                              cx={pointsUsage[hoveredWeekIndex].x}
                              cy={pointsUsage[hoveredWeekIndex].y}
                              r="2.5"
                              fill="#FF6B35"
                              stroke="#ffffff"
                              strokeWidth="1"
                            />

                            {/* 绿色采纳点 */}
                            <circle
                              cx={pointsAdopted[hoveredWeekIndex].x}
                              cy={pointsAdopted[hoveredWeekIndex].y}
                              r="5.5"
                              fill="#2d8a5f"
                              opacity="0.22"
                            />
                            <circle
                              cx={pointsAdopted[hoveredWeekIndex].x}
                              cy={pointsAdopted[hoveredWeekIndex].y}
                              r="2.5"
                              fill="#2d8a5f"
                              stroke="#ffffff"
                              strokeWidth="1"
                            />
                          </g>
                        )}

                        {/* 交互热区 rect */}
                        {pointsUsage.map((p, i) => (
                          <rect
                            key={i}
                            x={Math.max(0, p.x - (stepX || 40) / 2)}
                            y={0}
                            width={stepX || 40}
                            height={80}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredWeekIndex(i)}
                            onMouseLeave={() => setHoveredWeekIndex(null)}
                          />
                        ))}
                      </svg>

                      {/* 动态随位置浮动的 Tooltip 卡片 */}
                      {hoveredWeekIndex !== null && trendWeeks[hoveredWeekIndex] && (() => {
                        const leftPercent = count > 1 ? (hoveredWeekIndex / (count - 1)) * 100 : 50;
                        const transformStyle =
                          hoveredWeekIndex <= 1
                            ? 'translateX(0%)'
                            : hoveredWeekIndex >= count - 2
                              ? 'translateX(-100%)'
                              : 'translateX(-50%)';

                        return (
                          <div
                            className="absolute -top-3 z-20 pointer-events-none transition-all duration-150 ease-out"
                            style={{
                              left: `${leftPercent}%`,
                              transform: transformStyle,
                            }}
                          >
                            <div className="bg-surface/95 backdrop-blur-md border border-border px-3 py-1.5 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] text-[11px] space-y-0.5 whitespace-nowrap">
                              <div className="font-bold text-foreground flex items-center gap-1">
                                <span>📅</span>
                                <span>{trendWeeks[hoveredWeekIndex].label}</span>
                              </div>
                              <div className="flex items-center gap-3 pt-0.5 text-[10.5px]">
                                <span className="text-[#FF6B35] font-semibold flex items-center gap-1">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FF6B35]" />
                                  <span dangerouslySetInnerHTML={{ __html: i18nService.t('secondBrainTrendsTooltipInvoked', { count: trendWeeks[hoveredWeekIndex].usage_count }) }} />
                                </span>
                                <span className="text-[#2d8a5f] font-semibold flex items-center gap-1">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2d8a5f]" />
                                  <span dangerouslySetInnerHTML={{ __html: i18nService.t('secondBrainTrendsTooltipAdopted', { count: trendWeeks[hoveredWeekIndex].adopted_count }) }} />
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* X 轴日期刻度列表 */}
                    <div className="flex items-center justify-between px-1 text-[10.5px] text-secondary">
                      {trendWeeks.map((w, idx) => {
                        const isHovered = hoveredWeekIndex === idx;
                        const shortLabel = w.label.includes('~') ? w.label.split('~')[0].trim() : w.label;

                        return (
                          <button
                            key={idx}
                            type="button"
                            onMouseEnter={() => setHoveredWeekIndex(idx)}
                            onMouseLeave={() => setHoveredWeekIndex(null)}
                            className={`text-center font-medium transition-colors cursor-pointer py-0.5 ${
                              isHovered ? 'text-[#FF6B35] font-bold scale-105' : 'text-secondary/70 hover:text-foreground'
                            }`}
                            style={{ flex: 1 }}
                            title={w.label}
                          >
                            {shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div
                className="text-[11px] text-secondary pt-1"
                dangerouslySetInnerHTML={{
                  __html: i18nService.t('secondBrainTrendsSummaryFooter', {
                    weeks: trendWeeks.length || 8,
                    total: `<b class="text-[#FF6B35] font-bold">${stats?.adopted_count ?? 0}</b>`,
                    thisWeek: `<b class="text-[#FF6B35] font-bold">${trendWeeks[trendWeeks.length - 1]?.usage_count ?? 0}</b>`,
                  }),
                }}
              />
            </div>
          </div>

        </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deletingDoc && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !deleting && setDeletingDoc(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-foreground">
                {i18nService.t('secondBrainDeleteConfirmTitle', { type: deletingDoc.type === 'chat' ? i18nService.t('secondBrainTabChat') : i18nService.t('secondBrainTabDocument') })}
              </h3>
              <p className="text-xs text-secondary">
                {i18nService.t('secondBrainDeleteConfirmDesc', { name: deletingDoc.name })}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeletingDoc(null)}
                className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-raised transition-colors disabled:opacity-50 cursor-pointer"
              >
                {i18nService.t('cancel')}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="rounded-lg bg-destructive px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-destructive/90 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                {deleting ? i18nService.t('secondBrainDeleteDeletingBtn') : i18nService.t('secondBrainDeleteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 人设信息编辑弹窗（限制在页面容器内部，不阻塞左侧侧边栏导航） */}
      {showPersonaModal && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            if (!savingPersona && hasValidPersona) {
              setShowPersonaModal(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">
                {hasValidPersona ? i18nService.t('secondBrainPersonaProfileBtn').replace(/[^\u4e00-\u9fa5A-Za-z]/g, '') : i18nService.t('secondBrainPersonaModalTitle')}
              </h3>
              {hasValidPersona && (
                <button
                  type="button"
                  onClick={() => setShowPersonaModal(false)}
                  className="text-secondary hover:text-foreground text-sm cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {!hasValidPersona && (
              <p className="text-xs text-secondary leading-relaxed bg-surface-raised/60 p-2.5 rounded-lg border border-border/80">
                {i18nService.t('secondBrainPersonaModalSubtitle')}
              </p>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-secondary mb-1">
                  {i18nService.t('secondBrainPersonaNameLabel')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={personaForm.name}
                  onChange={(e) => setPersonaForm({ ...personaForm, name: e.target.value })}
                  placeholder={i18nService.t('secondBrainPersonaNamePlaceholder')}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-secondary mb-1">
                  {i18nService.t('secondBrainPersonaBusinessLabel')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={personaForm.business}
                  onChange={(e) => setPersonaForm({ ...personaForm, business: e.target.value })}
                  placeholder={i18nService.t('secondBrainPersonaBusinessPlaceholder')}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-secondary mb-1">{i18nService.t('secondBrainPersonaIndustryLabel')}</label>
                <input
                  type="text"
                  value={personaForm.industry}
                  onChange={(e) => setPersonaForm({ ...personaForm, industry: e.target.value })}
                  placeholder={i18nService.t('secondBrainPersonaIndustryPlaceholder')}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-secondary mb-1">{i18nService.t('secondBrainPersonaStyleLabel')}</label>
                <textarea
                  rows={3}
                  value={personaForm.positioning}
                  onChange={(e) => setPersonaForm({ ...personaForm, positioning: e.target.value })}
                  placeholder={i18nService.t('secondBrainPersonaStylePlaceholder')}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-foreground outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              {hasValidPersona && (
                <button
                  type="button"
                  disabled={savingPersona}
                  onClick={() => setShowPersonaModal(false)}
                  className="rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-secondary hover:bg-surface-raised transition-colors"
                >
                  {i18nService.t('cancel')}
                </button>
              )}
              <button
                type="button"
                disabled={savingPersona || !personaForm.name.trim() || !personaForm.business.trim()}
                onClick={handleSavePersona}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {savingPersona ? i18nService.t('secondBrainUploadingBtn') : i18nService.t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自动同步设置弹窗 */}
      <AutoUploadSettingsModal
        isOpen={showAutoUploadModal}
        onClose={() => {
          setShowAutoUploadModal(false);
          refreshAutoUploadStatus();
        }}
      />

      {/* 全局 Toast */}
      {toast && createPortal(
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-medium shadow-lg transition-all ${
            toast.type === 'error'
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-foreground text-background dark:bg-white dark:text-black'
          }`}
        >
          {toast.message}
        </div>,
        document.body
      )}
    </div>
  );
};

export default SecondBrainView;
