import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { wrapRawOpusToOgg } from '../../services/oggOpusEncoder';
import * as recordingCardBle from '../../services/recordingCardBle';
import {
  adoptCognitionItem,
  type AudioListItem,
  type CognitionItem,
  type CognitionStats,
  createAudio,
  deleteAudio,
  deleteChat,
  deleteDocument,
  DOCUMENT_STATUS,
  type DocumentItem,
  downloadDocument,
  fetchAudioList,
  fetchAudioUploadPresignedUrl,
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
  uploadAndCreateDocument,
  uploadFileToTos,
} from '../../services/secondBrainApi';
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
const MATERIAL_TABS = ['文档', '对话', '录音卡'] as const;
type MaterialTab = typeof MATERIAL_TABS[number];

/** 录音卡功能暂未对客户开放（TODO: 硬件正式发布上线后改为 false 即可放开） */
const SHOW_RECORDING_CARD_COMING_SOON = false;

/** 单个上传文档最大限制：2MB */
const MAX_DOCUMENT_FILE_SIZE = 2 * 1024 * 1024;

/** 单次批量上传文档最大数量限制：10 个 */
const MAX_DOCUMENT_BATCH_COUNT = 10;

/** 录音卡与第二大脑持久化日志输出函数 */
const logCard = (level: 'info' | 'warn' | 'error', message: string): void => {
  if (level === 'error') console.error(`[SecondBrain] ${message}`);
  else if (level === 'warn') console.warn(`[SecondBrain] ${message}`);
  else console.log(`[SecondBrain] ${message}`);

  try {
    (window as any)?.electron?.log?.fromRenderer?.(level, 'SecondBrain', message);
  } catch {
    // 忽略
  }
};

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

  /** 录音卡设备状态 */
  const [bleDevice, setBleDevice] = useState<{
    name: string;
    sn?: string;
    battery: number;
    freeKb: number;
    totalKb: number;
    wifiSsid: string;
    wifiPassword: string;
    wifiApOpened?: boolean;
    wifiConnected?: boolean;
  } | null>(null);
  const [bleConnecting, setBleConnecting] = useState(false);
  const [wifiConnecting, setWifiConnecting] = useState(false);
  const [wifiGuideCopied, setWifiGuideCopied] = useState(false);
  const [showUnbindModal, setShowUnbindModal] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const [showWifiSyncModal, setShowWifiSyncModal] = useState(false);
  const pendingSyncActionRef = useRef<(() => Promise<void>) | null>(null);
  const [openingWifiAp, setOpeningWifiAp] = useState(false);
  const [autoConnectingWifi, setAutoConnectingWifi] = useState(false);
  const [autoConnectFailed, setAutoConnectFailed] = useState(false);
  const originalWifiSsidRef = useRef<string | null>(null);
  const [bleFiles, setBleFiles] = useState<Array<{
    name: string;
    file: string;
    size: number;
    duration: number;
    createTime?: number;
  }>>([]);
  const [bleLoadingFiles, setBleLoadingFiles] = useState(false);
  const [syncingFileNames, setSyncingFileNames] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState<Record<string, number>>({});
  const [syncedFileNames, setSyncedFileNames] = useState<Set<string>>(new Set());
  const [backendAudioList, setBackendAudioList] = useState<AudioListItem[]>([]);

  /** Toast 提示状态 */
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  /** 每周趋势数据 */
  const [trendWeeks, setTrendWeeks] = useState<TrendWeekItem[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
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
      setItemsTotal((prev) => Math.max(0, prev - 1));
      loadStats();
      loadTodayAdopted();
      loadTrend();
      loadItems(itemsPage, { silent: true });
      showToast('success', item.replaces ? '已采纳更新，新萃取认知已覆盖旧认知' : '已采纳该认知，已沉淀至商业第二大脑');
    } catch (err: any) {
      console.warn('[SecondBrainView] 采纳失败:', err);
      showToast('error', `采纳失败: ${err?.message || '未知错误'}`);
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
      setItemsTotal((prev) => Math.max(0, prev - 1));
      loadStats();
      loadItems(itemsPage, { silent: true });
      showToast('success', item.replaces ? '已驳回，维持存量旧认知不变' : '已驳回该认知');
    } catch (err: any) {
      console.warn('[SecondBrainView] 驳回失败:', err);
      showToast('error', `驳回失败: ${err?.message || '未知错误'}`);
    } finally {
      setActioning(item.node_id, false);
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
      showToast('success', '人设信息修改成功');
    } catch (err: any) {
      console.warn('[SecondBrainView] 保存人设失败:', err);
      showToast('error', `保存失败: ${err?.message || '未知错误'}`);
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
    loadItems(itemsPage);
  }, [itemsPage, loadItems]);

  /** 拉取资料列表（根据当前 Tab 区分文档/对话/录音卡） */
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
    } else if (tab === '录音卡') {
      fetchAudioList({ page, pageSize: 10 })
        .then((res) => {
          if (materialTab !== '录音卡') return;
          const rawList = res.data || [];
          setBackendAudioList(rawList);
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

          // 更新已同步文件名集合
          const names = new Set(rawList.map((a) => a.name));
          setSyncedFileNames((prev) => {
            const next = new Set(prev);
            names.forEach((n) => next.add(n));
            return next;
          });
        })
        .catch((err) => { console.warn('[SecondBrainView] 音频列表接口失败:', err); })
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
      showToastRef.current('success', `自动同步：已成功上传 ${count} 篇新文档并开始 AI 萃取`);
    };
    window.addEventListener('secondBrain:docUploaded', handleDocUploaded);

    return () => {
      isMounted = false;
      window.removeEventListener('secondBrain:docUploaded', handleDocUploaded);
    };
  }, []);

  /** 组件卸载时断开录音卡连接与 Wi-Fi 同步，恢复原有外网与录音卡常态低功耗待机 */
  useEffect(() => {
    return () => {
      // 由主进程原子化保证：先在存活的 Socket 链路上向录音卡发送退出同步与关 Wi-Fi，再有序切回原有外网
      window.electron.recordingCardWifi.disconnect(originalWifiSsidRef.current).catch(() => {});
      recordingCardBle.closeWifi().catch(() => {});
      recordingCardBle.disconnect();
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

    if (files.length > MAX_DOCUMENT_BATCH_COUNT) {
      showToast('error', `单次最多支持批量上传 ${MAX_DOCUMENT_BATCH_COUNT} 份文档，请分批选择上传`);
      return;
    }

    const oversizedFiles: string[] = [];
    const validFiles: File[] = [];

    for (const file of files) {
      if (file.size > MAX_DOCUMENT_FILE_SIZE) {
        oversizedFiles.push(file.name);
      } else {
        validFiles.push(file);
      }
    }

    if (oversizedFiles.length > 0) {
      showToast('error', `文件 "${oversizedFiles.join(', ')}" 超过 2MB 大小限制，无法上传`);
    }

    if (validFiles.length === 0) return;

    setUploading(true);
    let successCount = 0;
    const failedNames: string[] = [];

    for (const file of validFiles) {
      try {
        await uploadAndCreateDocument({ name: file.name, content: file });
        successCount++;
      } catch (err: any) {
        console.warn(`[SecondBrainView] 资料 "${file.name}" 上传失败:`, err);
        failedNames.push(file.name);
      }
    }

    if (successCount > 0) {
      loadDocs(materialTab, 1);
      loadStats();
    }

    if (failedNames.length === 0) {
      if (files.length === 1) {
        showToast('success', `资料 "${files[0].name}" 上传成功，系统正自动萃取中`);
      } else {
        showToast('success', `成功上传 ${successCount} 份资料，系统正自动萃取中`);
      }
    } else if (successCount > 0) {
      showToast('error', `成功上传 ${successCount} 份资料，${failedNames.length} 份上传失败 (${failedNames.join(', ')})`);
    } else {
      showToast('error', `资料上传失败：${failedNames.join(', ')}`);
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
        showToast('success', '已开始下载资料');
      }
    } catch (err: any) {
      console.warn('[SecondBrainView] 获取下载地址失败:', err);
      showToast('error', `获取下载地址失败: ${err?.message || '未知错误'}`);
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
      showToast('success', '已发起重新萃取，系统正自动处理中');
    } catch (err: any) {
      console.warn('[SecondBrainView] 重新萃取失败:', err);
      showToast('error', `重新萃取失败: ${err?.message || '未知错误'}`);
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
      showToast('success', `${isChat ? '对话' : isAudio ? '音频' : '资料'} "${docName}" 已成功删除`);
    } catch (err: any) {
      console.warn('[SecondBrainView] 删除失败:', err);
      showToast('error', `删除失败: ${err?.message || '未知错误'}`);
    } finally {
      setDeleting(false);
    }
  };

  /** 连接录音卡（BLE 常态连接，不自动开启 Wi-Fi AP，电脑保持正常外网） */
  const handleConnectBle = async () => {
    if (bleConnecting) return;
    const userId = localStorage.getItem('heyclaw_user_id');
    if (!userId) {
      showToast('error', '请先登录 HeyClaw 账号后再连接录音卡');
      return;
    }

    setBleConnecting(true);
    logCard('info', `>>> 用户发起连接录音卡蓝牙 (userId: ${userId})...`);
    try {
      // 1. 扫描与 BLE 握手（获取设备信息并监听物理断开事件）
      const handshakeInfo = await recordingCardBle.handshake(userId, () => {
        logCard('warn', '[SecondBrainView] 监听到录音卡物理断开事件，重置连接状态');
        setBleDevice(null);
      });

      // 注意：严格遵循官方 App 设计与对接协议第三章，常态下保持低功耗 BLE 连接，电脑正常连接外网！
      setBleDevice({
        name: handshakeInfo.deviceName || 'HeyClaw 录音卡',
        sn: handshakeInfo.sn,
        battery: handshakeInfo.battery,
        freeKb: handshakeInfo.freeKb,
        totalKb: handshakeInfo.totalKb,
        wifiSsid: handshakeInfo.wifiSsid,
        wifiPassword: handshakeInfo.wifiPassword,
        wifiApOpened: false,
        wifiConnected: false,
      });

      logCard('info', `<<< 录音卡蓝牙连接与握手成功！(SN: ${handshakeInfo.sn}, 电量: ${handshakeInfo.battery}%, 剩余: ${handshakeInfo.freeKb}KB, 总计: ${handshakeInfo.totalKb}KB)`);
      showToast('success', '录音卡蓝牙连接成功，正在读取录音列表…');

      // 3. 握手后立即通过 BLE 第三章第2节读取录音卡内音频列表
      await loadBleFilesViaBle();
    } catch (err: any) {
      logCard('error', `[SecondBrainView] 连接录音卡失败: ${err?.message || err}`);
      const rawMsg = err?.message || String(err);
      const isScanTimeout =
        rawMsg.includes('User cancelled the requestDevice') ||
        rawMsg.includes('no device') ||
        rawMsg.includes('NotFound');
      const tip = isScanTimeout
        ? '未搜索到录音卡蓝牙信号。若设备刚结束传输，正在重启蓝牙广播，请稍候片刻再试'
        : `连接录音卡失败: ${rawMsg || '请确认蓝牙已开启并靠近设备'}`;
      showToast('error', tip);
    } finally {
      setBleConnecting(false);
    }
  };

  /** 通过 BLE 读取录音卡内文件列表（常态低功耗，严格对齐协议文档第三章第2节） */
  const loadBleFilesViaBle = async () => {
    setBleLoadingFiles(true);
    logCard('info', '>>> 正在通过 BLE 读取录音卡内音频文件列表 (0x1B 0x00)...');
    try {
      const files = await recordingCardBle.getFileListViaBle();
      const list = files.map((f) => ({
        name: f.file,
        file: f.file,
        size: f.size,
        duration: Math.round(f.duration_ms / 1000),
        createTime: f.creat_time,
      }));
      setBleFiles(list);
      logCard('info', `<<< 成功读取到 ${list.length} 个录音文件`);
    } catch (err: any) {
      logCard('error', `[SecondBrainView] 通过 BLE 获取录音卡文件列表失败: ${err?.message || err}`);
      showToast('error', `获取录音文件列表失败: ${err?.message || '未知错误'}`);
    } finally {
      setBleLoadingFiles(false);
    }
  };

  /** 执行自动连接录音卡 Wi-Fi 与 Socket 通道探测 */
  const runAutoConnectWifi = async (
    ssid: string,
    password?: string,
    syncAction?: () => Promise<void>,
    retryCount = 0
  ) => {
    setAutoConnectingWifi(true);
    setAutoConnectFailed(false);
    logCard('info', `>>> [自动连接${retryCount > 0 ? ` 第${retryCount + 1}次重试` : ''}] 开始自动关联录音卡 Wi-Fi: ${ssid}...`);

    try {
      // 阶段 1: 触发系统底层自动连接 Wi-Fi（macOS: networksetup, Windows: netsh）
      // 底层已配置 16 秒充裕超时，给足 WPA2 认证与 DHCP 分配时间
      const autoRes = await window.electron.recordingCardWifi.autoConnect(ssid, password);
      if (!autoRes.success) {
        throw new Error(autoRes.error || '系统连接录音卡 Wi-Fi 超时');
      }
      logCard('info', `[自动连接] 系统已下发关联 Wi-Fi 指令 (${ssid})，开始探测 Socket 就绪状态...`);

      // 阶段 2: Wi-Fi 关联后，给局域网 IP 与 TCP 服务留出 6 秒轮询重试窗口（每 600ms 探测一次）
      const socketDeadline = Date.now() + 6000;
      let socketConnected = false;
      let lastSocketErr = '';

      while (Date.now() < socketDeadline) {
        try {
          const res = await window.electron.recordingCardWifi.connect();
          if (res.success) {
            socketConnected = true;
            break;
          }
          lastSocketErr = res.error || '';
        } catch (sockErr: any) {
          lastSocketErr = sockErr?.message || String(sockErr);
        }
        await new Promise((r) => setTimeout(r, 600));
      }

      if (!socketConnected) {
        throw new Error(lastSocketErr || 'Wi-Fi 关联或录音卡 Socket 通道未就绪');
      }

      // 自动连接与 Socket 通道全部就绪！
      setBleDevice((prev) => (prev ? { ...prev, wifiConnected: true } : null));
      setShowWifiSyncModal(false);
      setAutoConnectingWifi(false);
      logCard('info', `🎉 [自动连接] 录音卡 Wi-Fi (${ssid}) 自动连接成功，开始极速同步！`);
      showToast('success', `已自动连接录音卡 Wi-Fi (${ssid})，正在极速同步...`);

      // 执行挂起的同步任务（优先使用传入的 action，兜底使用 ref）
      const act = syncAction || pendingSyncActionRef.current;
      if (act) {
        pendingSyncActionRef.current = null;
        logCard('info', '[自动连接] 触发执行音频同步下载动作...');
        await act();
      }
    } catch (err: any) {
      if (retryCount < 1) {
        logCard('warn', `[自动连接] 首次切网/通道探测未果 (${err?.message || err})，自动静默重试一次...`);
        await new Promise((r) => setTimeout(r, 1000));
        return runAutoConnectWifi(ssid, password, syncAction, retryCount + 1);
      }
      logCard('warn', `[自动连接] 自动连接未果 (${err?.message || err})，已平滑切换为手动引导模式`);
      setAutoConnectingWifi(false);
      setAutoConnectFailed(true);
    }
  };

  /** 确保 Wi-Fi 同步通道就绪后再执行同步动作（优先全自动连接，失败时平滑降级手动向导） */
  const ensureWifiAndRun = async (action: () => Promise<void>) => {
    if (!bleDevice) return;
    // 如果已经建立 Wi-Fi TCP 同步通道，直接执行
    if (bleDevice.wifiConnected) {
      await action();
      return;
    }

    // 记录挂起的动作并唤出向导弹窗
    pendingSyncActionRef.current = action;
    setShowWifiSyncModal(true);
    setAutoConnectingWifi(true);
    setAutoConnectFailed(false);

    // 记录宿主机当前连接的原外网 Wi-Fi，以便同步完毕后极速切回
    try {
      const currentWifi = await window.electron.recordingCardWifi.getCurrentWifi();
      if (currentWifi && currentWifi !== bleDevice.wifiSsid) {
        originalWifiSsidRef.current = currentWifi;
        logCard('info', `[Wi-Fi] 记录当前外网 Wi-Fi 名称: ${currentWifi}`);
      }
    } catch {
      // 忽略
    }

    // 若录音卡尚未开启 Wi-Fi AP，则通过 BLE 下发 0x0A 0x00 唤醒
    if (!bleDevice.wifiApOpened) {
      setOpeningWifiAp(true);
      logCard('info', `>>> 准备唤醒录音卡开启 Wi-Fi 热点: ${bleDevice.wifiSsid}...`);
      try {
        await recordingCardBle.openWifi();
        setBleDevice((prev) => (prev ? { ...prev, wifiApOpened: true } : null));
        logCard('info', `<<< 录音卡 Wi-Fi 热点已就绪: ${bleDevice.wifiSsid}，等待广播信号稳定 (1.5s)...`);
        // 给录音卡 1.5 秒启动 SoftAP 广播，确保宿主机无线网卡能扫描到
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err: any) {
        logCard('error', `[SecondBrainView] 开启 Wi-Fi 热点失败: ${err?.message || err}`);
        showToast('error', `开启 Wi-Fi 热点失败: ${err?.message || '未知错误'}`);
        setAutoConnectingWifi(false);
        setAutoConnectFailed(true);
        setOpeningWifiAp(false);
        return;
      } finally {
        setOpeningWifiAp(false);
      }
    }

    // 热点就绪后，立即尝试后台全自动连接并传入当前待执行任务
    void runAutoConnectWifi(bleDevice.wifiSsid, bleDevice.wifiPassword, action);
  };

  /** 用户确认已连接热点并建立 Wi-Fi TCP 同步通道 */
  const handleConfirmWifiAndSync = async () => {
    if (!bleDevice) return;
    setWifiConnecting(true);
    logCard('info', '>>> 用户确认连入热点，正在建立 Wi-Fi TCP 同步通道...');
    try {
      const res = await window.electron.recordingCardWifi.connect();
      if (!res.success) {
        throw new Error(res.error || '建立 Wi-Fi 同步连接失败');
      }
      setBleDevice((prev) => (prev ? { ...prev, wifiConnected: true } : null));
      setShowWifiSyncModal(false);
      setAutoConnectingWifi(false);
      logCard('info', '<<< Wi-Fi TCP 同步通道连接成功！');
      showToast('success', '已成功连接录音卡 Wi-Fi 同步通道，开始极速同步');

      // 执行挂起的同步任务
      if (pendingSyncActionRef.current) {
        const act = pendingSyncActionRef.current;
        pendingSyncActionRef.current = null;
        logCard('info', '[手动连接] 触发执行音频同步下载动作...');
        await act();
      }
    } catch (err: any) {
      logCard('error', `[SecondBrainView] 建立 Wi-Fi 同步连接失败: ${err?.message || err}`);
      showToast('error', `连接同步失败: ${err?.message || '请确认电脑已连入录音卡 Wi-Fi 热点'}`);
    } finally {
      setWifiConnecting(false);
    }
  };

  // 当 Wi-Fi 极速同步向导弹窗处于手动引导模式时，开启后台静默探测
  // 一旦检测到电脑连入录音卡热点，自动完成握手、关闭弹窗并触发极速同步，实现无感体验
  useEffect(() => {
    if (!showWifiSyncModal || autoConnectingWifi || wifiConnecting || !bleDevice || bleDevice.wifiConnected) {
      return;
    }

    let isMounted = true;
    const probeTimer = setInterval(async () => {
      try {
        const res = await window.electron.recordingCardWifi.connect();
        if (res.success && isMounted) {
          clearInterval(probeTimer);
          setBleDevice((prev) => (prev ? { ...prev, wifiConnected: true } : null));
          setShowWifiSyncModal(false);
          logCard('info', '🎉 [静默探测] 侦测到电脑已连入录音卡热点，自动开启极速同步！');
          showToast('success', '已检测到连入录音卡 Wi-Fi，正在极速同步...');

          const act = pendingSyncActionRef.current;
          if (act) {
            pendingSyncActionRef.current = null;
            logCard('info', '[静默探测] 触发执行音频同步下载动作...');
            await act();
          }
        }
      } catch {
        // 未连上时静默忽略
      }
    }, 1200);

    return () => {
      isMounted = false;
      clearInterval(probeTimer);
    };
  }, [showWifiSyncModal, autoConnectingWifi, wifiConnecting, bleDevice]);

  /** 关闭 Wi-Fi 热点并断开 Socket（恢复常态低功耗 BLE 状态，电脑切回原有网络，并自动静默回连蓝牙） */
  const handleCloseWifi = async (showTipOrEvent?: boolean | React.MouseEvent) => {
    const showTip = typeof showTipOrEvent === 'boolean' ? showTipOrEvent : true;
    logCard('info', '>>> 正在关闭 Wi-Fi 极速同步并断开 Socket 连接...');
    try {
      // 由主进程保证：先在存活的 Socket 链路上向录音卡发送退出同步与关 Wi-Fi，再将电脑网络切回原有 Wi-Fi
      await window.electron.recordingCardWifi.disconnect(originalWifiSsidRef.current);
    } catch {
      // 忽略
    }
    try {
      await recordingCardBle.closeWifi();
    } catch {
      // 忽略
    }
    setBleDevice((prev) => (prev ? { ...prev, wifiConnected: false, wifiApOpened: false } : null));

    if (showTip) {
      showToast('success', '已关闭 Wi-Fi 极速同步，录音卡已恢复常态低功耗蓝牙模式');
    }

    // 录音卡关闭 Wi-Fi 芯片后会自动重新开启 BLE 广播，自动静默回连（重试 5 次，每次间隔 1 秒）
    logCard('info', '>>> 开始尝试自动静默回连录音卡蓝牙 (重试 5 次)...');
    try {
      const reconnected = await recordingCardBle.reconnect(5, 1000);
      setBleDevice({
        name: reconnected.deviceName || 'HeyClaw 录音卡',
        sn: reconnected.sn,
        battery: reconnected.battery,
        freeKb: reconnected.freeKb,
        totalKb: reconnected.totalKb,
        wifiSsid: reconnected.wifiSsid,
        wifiPassword: reconnected.wifiPassword,
        wifiApOpened: false,
        wifiConnected: false,
      });
      logCard('info', `🎉 [Wi-Fi] 录音卡蓝牙已成功自动无感回连！(SN: ${reconnected.sn}, 电量: ${reconnected.battery}%)`);
    } catch (reconnectErr: any) {
      logCard('warn', `[Wi-Fi] 自动回连录音卡蓝牙未成功: ${reconnectErr?.message || reconnectErr}`);
      setBleDevice(null);
    }
  };

  /** 等待网络恢复连通外网（调用底层专用静默探针，0 业务请求，0 错误日志） */
  const waitForInternetOnline = async (maxWaitMs = 25000): Promise<boolean> => {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const isOnline = await window.electron.recordingCardWifi.checkOnline();
        if (isOnline) {
          return true;
        }
      } catch {
        // 网络还未真正连通，等待下一次轮询
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    return false;
  };

  /** 断开录音卡连接 */
  const handleDisconnectBle = async () => {
    try {
      await window.electron.recordingCardWifi.disconnect(originalWifiSsidRef.current);
    } catch {
      // 忽略
    }
    try {
      await recordingCardBle.closeWifi();
    } catch {
      // 忽略
    }
    recordingCardBle.disconnect();
    setBleDevice(null);
    setBleFiles([]);
    setShowWifiSyncModal(false);
    showToast('success', '录音卡已断开连接');
  };

  /** 解除录音卡绑定（清除配对码，保留录音卡内原始音频） */
  const handleUnbindBle = async () => {
    setUnbinding(true);
    try {
      try {
        await window.electron.recordingCardWifi.disconnect(originalWifiSsidRef.current);
      } catch {
        // 忽略
      }
      try {
        await recordingCardBle.closeWifi();
      } catch {
        // 忽略
      }
      await recordingCardBle.unbind();
      recordingCardBle.disconnect();
      setBleDevice(null);
      setBleFiles([]);
      setShowUnbindModal(false);
      setShowWifiSyncModal(false);
      showToast('success', '已解除录音卡绑定');
    } catch (err: any) {
      console.warn('[SecondBrainView] 解绑录音卡失败:', err);
      showToast('error', `解绑失败: ${err?.message || '未知错误'}`);
    } finally {
      setUnbinding(false);
    }
  };

  /** 格式化秒数 (mm:ss) */
  const formatDurationSec = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(m)}:${pad(rem)}`;
  };

  /** 格式化字节数 */
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /** 判断录音卡文件是否已同步 */
  const isFileSynced = (fileName: string) => {
    const base = fileName.replace(/\.[^.]*$/, '');
    return (
      syncedFileNames.has(fileName) ||
      syncedFileNames.has(`${base}.wav`) ||
      syncedFileNames.has(`${base}.opus`) ||
      syncedFileNames.has(base) ||
      backendAudioList.some((a) => a.name.startsWith(base))
    );
  };

  /** 单个文件同步：通过 Wi-Fi 下载 -> 封装标准 Ogg Opus -> 关闭 Wi-Fi 退出同步切回蓝牙 -> 外网上传 TOS -> 创建音频记录 */
  const handleSyncOneBleFile = async (file: { name: string; file: string; size: number }) => {
    if (syncingFileNames.has(file.name)) return;
    const base = file.name.replace(/\.[^.]*$/, '');
    const uploadFileName = `${base}.opus`;

    setSyncingFileNames((prev) => new Set(prev).add(file.name));
    setSyncProgress((prev) => ({ ...prev, [file.name]: 1 }));

    let removeProgressListener: (() => void) | null = null;
    try {
      logCard('info', `>>> [单文件同步] 开始同步录音: ${file.name} (大小: ${file.size} 字节)...`);
      // 阶段 1: 注册下载进度监听，通过 Wi-Fi TCP 高速下载音频数据
      removeProgressListener = window.electron.recordingCardWifi.onDownloadProgress((data) => {
        if (data.filename === file.file) {
          const percent = file.size > 0 ? Math.min(95, Math.round((data.receivedBytes / file.size) * 95)) : 50;
          setSyncProgress((prev) => ({ ...prev, [file.name]: Math.max(1, percent) }));
        }
      });

      const res = await window.electron.recordingCardWifi.downloadFile(file.file);
      if (!res.success || !res.data) {
        throw new Error(res.error || '下载文件数据为空');
      }
      setSyncProgress((prev) => ({ ...prev, [file.name]: 96 }));
      logCard('info', `<<< [单文件同步] 音频 "${file.name}" 下载成功，原始字节数: ${res.data.byteLength}`);

      // 阶段 1.5: 录音卡传输的是 80 字节/帧的 Raw Opus 裸流，封装为标准 Ogg Opus 容器
      logCard('info', `[单文件同步] 正在将 Raw Opus 音频数据封装为标准 Ogg Opus 格式...`);
      const oggOpusBytes = wrapRawOpusToOgg(res.data);
      logCard('info', `[单文件同步] Ogg Opus 封装完成，封装后字节数: ${oggOpusBytes.byteLength}`);

      // 阶段 2: 下载完成，立即退出音频同步模式并关闭 Wi-Fi，让录音卡切回蓝牙模式，电脑切回外网
      await handleCloseWifi(false);
      showToast('success', `录音 "${uploadFileName}" 已下载完成，正在切回外网上传云端...`);
      logCard('info', `[单文件同步] 已退出 Wi-Fi 并触发自动回连蓝牙，开始等待外网恢复...`);

      // 阶段 3: 等待电脑网络切回并连通外网
      const online = await waitForInternetOnline(25000);
      logCard('info', `[单文件同步] 外网连通性探测结果: online=${online}`);
      if (!online) {
        throw new Error('切回外网超时，电脑尚未连通互联网，请检查网络设置后重试');
      }

      // 阶段 4: 获取预签名参数并上传到 TOS
      logCard('info', `[单文件同步] 正在请求 TOS 预签名上传地址...`);
      const { upload_url, tos_url, key } = await fetchAudioUploadPresignedUrl();

      const oggBuffer = oggOpusBytes.buffer.slice(
        oggOpusBytes.byteOffset,
        oggOpusBytes.byteOffset + oggOpusBytes.byteLength
      ) as ArrayBuffer;
      const oggBlob = new Blob([oggBuffer], { type: 'audio/ogg' });
      const oggFile = new File([oggBlob], uploadFileName, { type: 'audio/ogg' });
      logCard('info', `[单文件同步] 正在上传音频到 TOS: key=${key}...`);
      await uploadFileToTos(upload_url, oggFile);
      logCard('info', `[单文件同步] TOS 上传成功，正在创建第二大脑音频记录...`);

      // 阶段 5: 创建音频记录并触发 ASR 萃取
      await createAudio({
        name: uploadFileName,
        tosUrl: tos_url,
        tosKey: key,
      });
      logCard('info', `🎉 [单文件同步] 录音 "${uploadFileName}" 同步与创建成功！`);

      setSyncProgress((prev) => ({ ...prev, [file.name]: 100 }));
      setSyncedFileNames((prev) => new Set(prev).add(file.name).add(uploadFileName));
      showToast('success', `录音 "${uploadFileName}" 同步成功，系统已自动排队萃取`);
      loadDocs('录音卡', 1);
      loadStats();
    } catch (err: any) {
      logCard('error', `[单文件同步] 同步录音 "${file.name}" 失败: ${err?.message || err}`);
      // 发生异常时也确保切回蓝牙与关闭 Wi-Fi，防止电脑被一直卡在无外网热点上
      await handleCloseWifi(false);
      showToast('error', `同步 "${file.name}" 失败: ${err?.message || '未知错误'}`);
    } finally {
      if (removeProgressListener) {
        removeProgressListener();
      }
      setSyncingFileNames((prev) => {
        const next = new Set(prev);
        next.delete(file.name);
        return next;
      });
      setTimeout(() => {
        setSyncProgress((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
      }, 2000);
    }
  };

  /** 全部同步：一次性 Wi-Fi 极速下载全部音频 -> 关闭 Wi-Fi 切回外网与蓝牙 -> 批量上传云端 */
  const handleSyncAllBleFiles = async () => {
    const unsynced = bleFiles.filter((f) => !isFileSynced(f.name) && !syncingFileNames.has(f.name));
    if (unsynced.length === 0) {
      showToast('success', '所有录音文件均已同步完成');
      return;
    }

    logCard('info', `>>> [批量同步] 开始批量同步录音，待同步数量: ${unsynced.length}`);
    const downloadedList: {
      file: (typeof bleFiles)[number];
      data: Uint8Array;
      uploadFileName: string;
    }[] = [];

    let removeProgressListener: (() => void) | null = null;

    try {
      // 阶段 1: 在 Wi-Fi 热点局域网下，高速逐个下载所有选中的音频
      for (const f of unsynced) {
        setSyncingFileNames((prev) => new Set(prev).add(f.name));
        setSyncProgress((prev) => ({ ...prev, [f.name]: 1 }));
        logCard('info', `[批量同步] 开始下载文件: ${f.name} (大小: ${f.size} 字节)...`);

        if (removeProgressListener) {
          removeProgressListener();
        }
        removeProgressListener = window.electron.recordingCardWifi.onDownloadProgress((data) => {
          if (data.filename === f.file) {
            const percent = f.size > 0 ? Math.min(95, Math.round((data.receivedBytes / f.size) * 95)) : 50;
            setSyncProgress((prev) => ({ ...prev, [f.name]: Math.max(1, percent) }));
          }
        });

        try {
          const res = await window.electron.recordingCardWifi.downloadFile(f.file);
          if (res.success && res.data) {
            const base = f.name.replace(/\.[^.]*$/, '');
            const uploadFileName = `${base}.opus`;
            const oggOpusBytes = wrapRawOpusToOgg(res.data);
            downloadedList.push({ file: f, data: oggOpusBytes, uploadFileName });
            setSyncProgress((prev) => ({ ...prev, [f.name]: 96 }));
            logCard('info', `[批量同步] 文件 "${f.name}" 下载并封装 Ogg 成功，字节数: ${oggOpusBytes.byteLength}`);
          } else {
            logCard('warn', `[批量同步] 下载 "${f.name}" 失败: ${res.error}`);
          }
        } catch (downloadErr: any) {
          logCard('warn', `[批量同步] 下载 "${f.name}" 异常: ${downloadErr?.message || downloadErr}`);
        }
      }

      if (downloadedList.length === 0) {
        throw new Error('未成功下载到任何音频数据');
      }

      // 阶段 2: 下载完毕，立即退出同步模式并关闭 Wi-Fi，让录音卡切回蓝牙模式，电脑切回外网
      logCard('info', `[批量同步] 已成功下载 ${downloadedList.length} 份录音，开始关闭 Wi-Fi 并恢复蓝牙...`);
      await handleCloseWifi(false);
      showToast('success', `已成功下载 ${downloadedList.length} 份录音，正在切回外网上传云端...`);

      // 阶段 3: 等待电脑切回互联网
      logCard('info', '[批量同步] 正在等待电脑网络恢复连通外网...');
      const online = await waitForInternetOnline(25000);
      logCard('info', `[批量同步] 外网连通性探测结果: online=${online}`);
      if (!online) {
        throw new Error('切回外网超时，电脑尚未连通互联网，请检查网络设置后重试');
      }

      // 阶段 4: 外网恢复后，批量上传至 TOS 并创建音频记录
      logCard('info', `[批量同步] 外网已就绪，开始批量上传 ${downloadedList.length} 份音频到云端...`);
      for (const item of downloadedList) {
        try {
          logCard('info', `[批量同步] 正在上传: ${item.uploadFileName}...`);
          const { upload_url, tos_url, key } = await fetchAudioUploadPresignedUrl();
          const oggBuffer = item.data.buffer.slice(
            item.data.byteOffset,
            item.data.byteOffset + item.data.byteLength
          ) as ArrayBuffer;
          const oggBlob = new Blob([oggBuffer], { type: 'audio/ogg' });
          const oggFile = new File([oggBlob], item.uploadFileName, { type: 'audio/ogg' });
          await uploadFileToTos(upload_url, oggFile);

          await createAudio({
            name: item.uploadFileName,
            tosUrl: tos_url,
            tosKey: key,
          });

          setSyncProgress((prev) => ({ ...prev, [item.file.name]: 100 }));
          setSyncedFileNames((prev) => new Set(prev).add(item.file.name).add(item.uploadFileName));
          logCard('info', `[批量同步] "${item.uploadFileName}" 上传并创建记录成功！`);
        } catch (uploadErr: any) {
          logCard('error', `[批量同步] 上传 "${item.file.name}" 失败: ${uploadErr?.message || uploadErr}`);
        }
      }

      logCard('info', `🎉 [批量同步] 录音批量同步全部完成，成功处理 ${downloadedList.length} 份音频！`);
      showToast('success', `录音批量同步完成，已成功上传 ${downloadedList.length} 份音频并排队萃取`);
      loadDocs('录音卡', 1);
      loadStats();
    } catch (err: any) {
      logCard('error', `[批量同步] 批量同步录音卡文件失败: ${err?.message || err}`);
      await handleCloseWifi(false);
      showToast('error', `批量同步失败: ${err?.message || '未知错误'}`);
    } finally {
      if (removeProgressListener) {
        removeProgressListener();
      }
      setSyncingFileNames(new Set());
      setTimeout(() => {
        setSyncProgress({});
      }, 2000);
    }
  };

  /** 点击单个音频同步（包装 Wi-Fi 连接检查） */
  const handleTriggerSyncOne = (file: { name: string; file: string; size: number }) => {
    ensureWifiAndRun(() => handleSyncOneBleFile(file));
  };

  /** 点击全部音频同步（包装 Wi-Fi 连接检查） */
  const handleTriggerSyncAll = () => {
    ensureWifiAndRun(() => handleSyncAllBleFiles());
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
          ‹ 上一页
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
          下一页 ›
        </button>
        <span className="text-secondary text-[11px] ml-1">
          共 <b className="text-foreground font-bold">{total}</b> {unitName}
        </span>
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
              title="展开侧边栏"
            >
              <SidebarToggleIcon className="w-4 h-4" isCollapsed={isSidebarCollapsed ?? false} />
            </button>
          )}
          <h1 className={`${MANAGEMENT_PAGE_TITLE_TEXT} font-semibold text-foreground`}>
            第二大脑
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
        accept=".docx,.md,.txt"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 页面内容区域 */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        {personaLoading ? (
          <div className="h-full flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-secondary text-xs">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              <span>正在加载第二大脑...</span>
            </div>
          </div>
        ) : !hasValidPersona ? (
          <div className="h-full flex flex-col items-center justify-center py-24 text-center px-4 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-3xl">
              🧠
            </div>
            <h3 className="text-base font-bold text-foreground">请先完善人设信息</h3>
            <p className="text-xs text-secondary max-w-sm">
              第二大脑需要了解您的姓名称呼与主营业务，以提供精准的商业认知与拍板建议
            </p>
            <button
              type="button"
              onClick={() => setShowPersonaModal(true)}
              className="mt-2 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors shadow-sm cursor-pointer"
            >
              完善人设信息
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
                      {persona?.name ? `${persona.name}的商业第二大脑` : '老板的商业第二大脑'}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowPersonaModal(true)}
                      className="text-[11.5px] text-secondary hover:text-foreground underline ml-2 font-normal cursor-pointer"
                    >
                      人设侧写 ✏️
                    </button>
                  </div>
                  <p className="text-xs text-secondary">
                    沉淀你的思维，越来越敢替你拍板 · 已形成 <b className="text-foreground font-bold">{stats?.adopted_count ?? 0}</b> 条标准决策
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
                    {uploading ? '上传中…' : '+ 上传文件'}
                  </button>
                  <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-20 whitespace-nowrap rounded-xl bg-black/90 dark:bg-black px-3.5 py-1.5 text-xs font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200">
                    支持 .docx / .md / .txt（单文件最大 2MB，每批最多 10 个）
                  </div>
                </div>
              </div>
            </div>

            {/* 4 个大字重指标格 (.jl-states) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* 格子 1：持续学习 */}
              <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs transition hover:border-border/80">
                <div className="text-[11px] text-secondary font-medium mb-1">持续学习</div>
                <div className="text-[22px] font-extrabold text-foreground leading-tight flex items-baseline">
                  {statsLoading ? '--' : stats?.learning_days ?? 0}
                  <span className="text-xs font-semibold text-secondary ml-1">天</span>
                </div>
                <div className="text-[10.5px] text-secondary mt-1.5">
                  今日被调用 <b className="text-[#FF6B35] font-bold">{stats?.usage_count_today ?? 0}</b> 次
                </div>
              </div>

              {/* 格子 2：学习资料 */}
              <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs transition hover:border-border/80">
                <div className="text-[11px] text-secondary font-medium mb-1">学习资料</div>
                <div className="text-[22px] font-extrabold text-foreground leading-tight flex items-baseline">
                  {statsLoading ? '--' : stats?.material_count ?? 0}
                  <span className="text-xs font-semibold text-secondary ml-1">个</span>
                </div>
                <div className="text-[10.5px] text-secondary mt-1.5">
                  近 7 日上传 <b className="text-foreground font-bold">{stats?.material_count_7d ?? 0}</b> 个文件
                </div>
              </div>

              {/* 格子 3：已形成认知 */}
              <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs transition hover:border-border/80">
                <div className="text-[11px] text-secondary font-medium mb-1">已形成认知</div>
                <div className="text-[22px] font-extrabold text-foreground leading-tight flex items-baseline">
                  {statsLoading ? '--' : stats?.adopted_count ?? 0}
                  <span className="text-xs font-semibold text-secondary ml-1">条</span>
                </div>
                <div className="text-[10.5px] text-secondary mt-1.5">
                  昨日新增 <b className="text-[#2d8a5f] dark:text-emerald-400 font-bold">+{stats?.adopted_count_yesterday ?? 0}</b> 条
                </div>
              </div>

              {/* 格子 4：待确认认知 */}
              <div className="bg-[#f5a623]/5 border border-[#f5a623]/30 rounded-xl p-3.5 shadow-2xs transition hover:border-[#f5a623]/50">
                <div className="text-[11px] text-[#f5a623] font-medium mb-1">待确认认知</div>
                <div className="text-[22px] font-extrabold text-[#f5a623] leading-tight flex items-baseline">
                  {statsLoading ? '--' : stats?.pending_count ?? 0}
                  <span className="text-xs font-semibold text-[#f5a623]/80 ml-1">条</span>
                </div>
                <div className="text-[10.5px] text-[#f5a623] font-bold mt-1.5">
                  需你拍板
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
                <span className="text-xs md:text-sm font-bold text-foreground">今日 AI 自动吸收</span>
                <span className="text-[10.5px] font-bold bg-[#2d8a5f] text-white px-2 py-0.5 rounded-md">
                  {todayAdoptedList.length}
                </span>
              </div>

              <div className="text-xs text-secondary truncate hidden sm:block">
                {todayAdoptedLoading
                  ? '加载中…'
                  : todayAdoptedList.length > 0
                  ? `+${todayAdoptedList.length} 新增 · 今日已自动沉淀到第二大脑`
                  : '今日暂无自动沉淀，与 AI 专家日常对话后将自动提炼吸收'}
              </div>

              <div className="flex items-center gap-1 text-xs font-bold text-[#2d8a5f] shrink-0">
                <span>{isUpgradeCollapsed ? '查看详情' : '收起'}</span>
                <span className={`inline-block transition-transform duration-200 ${isUpgradeCollapsed ? '' : 'rotate-180'}`}>
                  ▾
                </span>
              </div>
            </div>

            {/* 展开内容 */}
            {!isUpgradeCollapsed && (
              <div className="border-t border-border px-4 py-3.5 bg-background/40 space-y-2.5">
                {todayAdoptedLoading && (
                  <div className="py-6 text-center text-xs text-secondary/60">加载今日自动吸收数据中…</div>
                )}
                {!todayAdoptedLoading && todayAdoptedList.length === 0 && (
                  <div className="py-6 text-center text-xs text-secondary">
                    今日暂无自动吸收的认知，与 AI 专家日常对话后系统将自动提炼沉淀。
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
                              + 新增
                            </span>
                            <span className="text-[10px] font-bold text-secondary bg-surface-raised border border-border px-1.5 py-0.5 rounded">
                              {LAYER_LABEL[item.layer] ?? `层级${item.layer}`}
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
                          📥 {item.source_type === 1 ? '来自文档' : item.source_type === 2 ? '来自对话' : item.source_type === 3 ? '来自音频' : '来自日常业务'} · 已写入商业第二大脑
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-border/60 text-center text-[11px] text-secondary">
                  今日 <b>{todayAdoptedList.length}</b> 条自动吸收 · 历史共 <b>{stats?.adopted_count ?? 0}</b> 条沉淀
                </div>
              </div>
            )}
          </div>

          {/* 3. 待审核认知区 (#s-pending) */}
          <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">
                  待审核认知
                </h2>
                {itemsTotal > 0 && (
                  <span className="text-xs font-bold bg-[#f5a623]/15 text-[#f5a623] px-2 py-0.5 rounded-md">
                    {itemsTotal}
                  </span>
                )}
              </div>
              <p className="text-xs text-secondary mt-1">
                AI 拿不准的才会出现在这里 · 点「编辑」可直接修正局部信息 · 想补材料就重新上传文档
              </p>
            </div>

            {/* 加载中 */}
            {itemsLoading && (
              <div className="flex items-center justify-center py-10">
                <span className="text-xs text-secondary/60">加载待审核认知中…</span>
              </div>
            )}

            {/* 空状态 */}
            {!itemsLoading && items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-10 w-10 rounded-full bg-surface-raised border border-border flex items-center justify-center mb-2 text-secondary font-bold">
                  ✓
                </div>
                <p className="text-xs font-semibold text-foreground">暂无待审核认知</p>
                <p className="text-[11px] text-secondary mt-0.5">所有认知均已处理完毕</p>
              </div>
            )}

            {/* 待审核列表 */}
            {!itemsLoading && items.length > 0 && (
              <div className="space-y-3.5">
                {items.map((item) => {
                  const isConflict = Boolean(item.replaces);
                  const isEditing = editingNodeId === item.node_id;

                  return (
                    <div
                      key={item.node_id}
                      className={`rounded-2xl border border-border ${
                        isConflict ? 'border-l-[3.5px] border-l-[#f53f3f]' : 'border-l-[3.5px] border-l-[#9b59b6]'
                      } bg-surface p-4 md:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-3.5 transition`}
                    >
                      {/* 顶部标签与来源 */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10.5px] font-extrabold text-[#9b59b6] bg-[#9b59b6]/12 px-2.5 py-0.5 rounded-[7px]">
                            {LAYER_LABEL[item.layer] ?? `层级${item.layer}`}
                          </span>
                          <span className={`text-[11px] font-bold ${isConflict ? 'text-[#f53f3f]' : 'text-secondary'}`}>
                            {isConflict ? '⚠️ 认知冲突 · 与存量判断不一致' : '📥 候选判断 · 待你确认收编'}
                          </span>
                        </div>
                        <span className="text-[11px] text-secondary ml-auto">
                          {item.source_type === 1 && (item.source_name ? `来源：${item.source_name}` : '来源：文档')}
                          {item.source_type === 2 && (item.source_name ? `来源：${item.source_name}` : '来源：对话')}
                          {item.source_type === 3 && (item.source_name ? `来源：${item.source_name}` : '来源：音频')}
                          {item.source_type === 9 && (item.source_name ? `来源：${item.source_name}` : '来源：归纳')}
                          {` · ${formatTimestamp(item.create_time)}`}
                        </span>
                      </div>

                      {/* 编辑态 */}
                      {isEditing ? (
                        <div className="space-y-2.5 pt-1">
                          <div>
                            <label className="block text-[11px] font-medium text-secondary mb-1">
                              认知命题（标题）
                            </label>
                            <input
                              type="text"
                              autoFocus
                              value={editingPropText}
                              onChange={(e) => setEditingPropText(e.target.value)}
                              placeholder="请输入认知摘要"
                              className="w-full rounded-lg border border-primary bg-surface px-3 py-2 text-xs font-semibold text-foreground outline-none shadow-2xs focus:ring-1 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-secondary mb-1">
                              认知阐述（正文）
                            </label>
                            <textarea
                              rows={3}
                              value={editingElabText}
                              onChange={(e) => setEditingElabText(e.target.value)}
                              placeholder="请输入具体阐述内容"
                              className="w-full rounded-lg border border-primary bg-surface px-3 py-2 text-xs text-foreground outline-none shadow-2xs focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-secondary hover:bg-surface transition-colors cursor-pointer"
                            >
                              取消编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditing(item.node_id)}
                              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors shadow-2xs cursor-pointer"
                            >
                              完成编辑
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
                                    <div className="text-[11px] font-extrabold text-[#f5a623]">旧认知</div>
                                    <div className="text-xs md:text-[13px] font-bold text-foreground leading-snug break-words">
                                      "{item.replaces?.proposition || '存量既有认知'}"
                                    </div>
                                  </div>
                                  <div className="text-[10.5px] text-secondary bg-surface px-2.5 py-1 rounded-[5px] border-l-2 border-l-[#f5a623] truncate block shadow-2xs" title={item.replaces?.elaboration || '已沉淀判断'}>
                                    {item.replaces?.elaboration || '已沉淀判断'}
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
                                    <div className="text-[11px] font-extrabold text-[#4a8fe7]">新萃取</div>
                                    <div className="text-xs md:text-[13px] font-bold text-foreground leading-snug break-words">
                                      "{editedPropositions[item.node_id] ?? item.proposition}"
                                    </div>
                                  </div>
                                  <div className="text-[10.5px] text-secondary bg-surface px-2.5 py-1 rounded-[5px] border-l-2 border-l-[#4a8fe7] truncate block shadow-2xs" title={item.source_name || '新提取判断'}>
                                    {item.source_name || '新提取判断'}
                                  </div>
                                </div>
                              </div>

                              {/* 提示文案 */}
                              <div className="bg-surface-raised/80 rounded-lg px-3.5 py-2 text-[11.5px] text-secondary leading-relaxed">
                                采纳后，「新萃取」内容将覆盖旧认知。驳回则维持旧认知不变。
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
                              <div className="text-[11.5px] text-secondary leading-relaxed border-t border-border/60 pt-2">
                                <b>采纳后影响：</b>直接写入你的第二大脑，影响后续所有对话与方案生成。
                              </div>
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
                              {actioningIds.has(item.node_id) ? '处理中…' : '采纳'}
                            </button>
                            <button
                              type="button"
                              disabled={actioningIds.has(item.node_id)}
                              onClick={() => handleReject(item)}
                              className="border border-border bg-surface-raised hover:bg-surface text-foreground font-semibold text-xs px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {actioningIds.has(item.node_id) ? '处理中…' : '驳回'}
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditing(item)}
                              className="border border-border bg-surface-raised hover:bg-surface text-foreground font-semibold text-xs px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              编辑
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* 分页器 */}
                {renderPager(itemsPage, itemsLastPage, itemsTotal, setItemsPage, '条待确认认知')}
              </div>
            )}
          </div>

          {/* 4. 学习资料区 (#s-materials) */}
          <div id="s-materials" className="space-y-2">
            <div className="text-[11px] font-bold tracking-wider text-secondary uppercase">
              学习资料
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4">
              {/* Tab 栏 + 上传按钮 (.mtabs) */}
              <div className="flex items-center justify-between border-b border-border">
                <div className="flex items-end gap-1 -mb-[1px]">
                  {MATERIAL_TABS.map((tab) => (
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
                      {tab}
                    </button>
                  ))}
                </div>

                {/* 仅在文档 Tab 下展示上传与自动同步按钮 */}
                {materialTab === '文档' && (
                  <div className="flex items-center gap-2 mb-1.5">
                    {/* 自动同步设置入口 */}
                    <button
                      type="button"
                      onClick={() => setShowAutoUploadModal(true)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-surface-raised/60 hover:bg-surface-raised text-secondary hover:text-foreground transition-colors flex items-center gap-1.5 cursor-pointer font-medium"
                    >
                      <span>📁</span>
                      <span>自动同步</span>
                    </button>

                    {/* 手动上传文档按钮 */}
                    <div className="relative group">
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={handleUploadClick}
                        className="bg-[#4a8fe7] hover:bg-[#3b7ed4] text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-2xs transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <span>+</span>
                        <span>{uploading ? '上传中…' : '上传文档'}</span>
                      </button>
                      <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-20 whitespace-nowrap rounded-xl bg-black/90 dark:bg-black px-3.5 py-1.5 text-xs font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200">
                        支持 .docx / .md / .txt（单文件最大 2MB，每批最多 10 个）
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 加载中 */}
              {docsLoading && (
                <div className="flex items-center justify-center py-10">
                  <span className="text-xs text-secondary/60">加载资料列表中…</span>
                </div>
              )}

              {/* 录音卡专属区域 */}
              {materialTab === '录音卡' && (() => {
                if (SHOW_RECORDING_CARD_COMING_SOON) {
                  return (
                    <div className="flex flex-col items-center justify-center py-14 text-center rounded-xl border border-dashed border-border bg-surface-raised/20">
                      <div className="w-10 h-10 rounded-full bg-[#FF6B35]/10 text-[#FF6B35] flex items-center justify-center text-lg mb-2">
                        🎙
                      </div>
                      <p className="text-xs font-semibold text-foreground">敬请期待</p>
                      <p className="text-[11px] text-secondary mt-0.5">硬件录音卡连接与一键同步萃取功能即将开放</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4 pt-1">
                    {/* 设备信息卡 */}
                    {bleDevice ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-surface-raised/40">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-[#FF6B35]/10 text-[#FF6B35] flex items-center justify-center text-lg shrink-0">
                              🎙
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs md:text-sm font-bold text-foreground truncate">{bleDevice.name}</span>
                                {bleDevice.wifiConnected ? (
                                  <span className="text-[10px] font-bold text-[#2d8a5f] bg-[#2d8a5f]/12 px-1.5 py-0.5 rounded">
                                    Wi-Fi 极速同步已就绪
                                  </span>
                                ) : bleDevice.wifiApOpened ? (
                                  <span className="text-[10px] font-bold text-[#e67e22] bg-[#e67e22]/12 px-1.5 py-0.5 rounded">
                                    热点已开启 · 待连接
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-[#1e6ba8] bg-[#1e6ba8]/12 px-1.5 py-0.5 rounded">
                                    蓝牙已连接
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-secondary mt-0.5">
                                电量 {bleDevice.battery}% · 剩余存储 {(bleDevice.freeKb / (1024 * 1024)).toFixed(1)}GB · 总容量 {(bleDevice.totalKb / (1024 * 1024)).toFixed(1)}GB
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {bleDevice.wifiConnected ? (
                              <button
                                type="button"
                                onClick={handleCloseWifi}
                                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-raised transition-colors cursor-pointer"
                                title="关闭录音卡热点，恢复低功耗蓝牙模式"
                              >
                                关闭 Wi-Fi
                              </button>
                            ) : bleDevice.wifiApOpened ? (
                              <button
                                type="button"
                                onClick={() => setShowWifiSyncModal(true)}
                                className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                              >
                                连接热点
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={handleDisconnectBle}
                              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-raised transition-colors cursor-pointer"
                            >
                              断开连接
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowUnbindModal(true)}
                              className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/15 transition-colors cursor-pointer"
                            >
                              解除绑定
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-dashed border-border bg-surface-raised/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-lg text-secondary shrink-0">
                            🎙
                          </div>
                          <div>
                            <div className="text-xs md:text-sm font-bold text-foreground">录音卡未连接</div>
                            <div className="text-[11px] text-secondary mt-0.5">通过低功耗蓝牙读取录音列表，按需 Wi-Fi 极速同步并一键萃取</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={bleConnecting}
                          onClick={handleConnectBle}
                          className="rounded-lg bg-primary hover:bg-primary-hover px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                        >
                          {bleConnecting ? '连接中…' : '连接录音卡'}
                        </button>
                      </div>
                    )}

                    {/* 录音卡文件列表工具栏（只要蓝牙已连接即常态展示） */}
                    {bleDevice && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-xs text-secondary">
                            录音卡内 <b className="text-foreground font-bold">{bleFiles.length}</b> 个文件 ·{' '}
                            <b className="text-[#FF6B35] font-bold">
                              {bleFiles.filter((f) => !isFileSynced(f.name)).length}
                            </b>{' '}
                            个待同步
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={bleLoadingFiles}
                              onClick={loadBleFilesViaBle}
                              className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-secondary hover:bg-surface-raised transition-colors cursor-pointer"
                            >
                              {bleLoadingFiles ? '读取中…' : '刷新列表'}
                            </button>
                            <button
                              type="button"
                              onClick={handleTriggerSyncAll}
                              className="rounded-lg bg-[#FF6B35] hover:bg-[#E85A28] px-3 py-1 text-xs font-bold text-white shadow-2xs transition-colors cursor-pointer"
                            >
                              全部同步
                            </button>
                          </div>
                        </div>

                        {/* 录音卡内文件项列表 */}
                        {bleLoadingFiles ? (
                          <div className="py-6 text-center text-xs text-secondary/60">正在通过蓝牙读取录音卡文件列表中…</div>
                        ) : bleFiles.length === 0 ? (
                          <div className="py-6 text-center text-xs text-secondary">录音卡内暂无录音文件</div>
                        ) : (
                          <div className="space-y-2">
                            {bleFiles.map((file) => {
                              const isSynced = isFileSynced(file.name);
                              const isSyncing = syncingFileNames.has(file.name);
                              const prog = syncProgress[file.name] ?? 0;

                              return (
                                <div
                                  key={file.name}
                                  className="flex items-center gap-3 p-3 rounded-xl border border-border/80 bg-background/40 hover:bg-surface transition-all"
                                >
                                  <div className="w-8 h-8 rounded-lg bg-[#FF6B35]/10 text-[#FF6B35] flex items-center justify-center text-sm shrink-0">
                                    🎧
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs md:text-[13px] font-semibold text-foreground truncate">
                                      {file.name}
                                    </div>
                                    <div className="text-[11px] text-secondary mt-0.5 flex items-center gap-1.5">
                                      <span>{formatDurationSec(file.duration)}</span>
                                      <span>·</span>
                                      <span>{formatBytes(file.size)}</span>
                                    </div>
                                    {isSyncing && (
                                      <div className="mt-1.5 h-1 w-full bg-border rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-[#FF6B35] rounded-full transition-all duration-200"
                                          style={{ width: `${prog}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {isSyncing ? (
                                      <span className="text-[11px] font-bold text-[#1e6ba8] bg-[#1e6ba8]/10 px-2 py-0.5 rounded">
                                        同步中 {prog}%
                                      </span>
                                    ) : isSynced ? (
                                      <span className="text-[11px] font-bold text-[#2d8a5f] bg-[#2d8a5f]/12 px-2 py-0.5 rounded">
                                        已同步 · 进萃取
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-bold text-secondary bg-surface-raised border border-border px-2 py-0.5 rounded">
                                        待同步
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      disabled={isSynced || isSyncing}
                                      onClick={() => handleTriggerSyncOne(file)}
                                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                                        isSynced
                                          ? 'border border-border text-secondary/40 cursor-not-allowed'
                                          : 'border border-[#FF6B35] text-[#FF6B35] hover:bg-[#FF6B35]/10'
                                      }`}
                                    >
                                      {isSynced ? '已同步' : isSyncing ? '同步中…' : '同步'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 分割线与历史已同步音频列表 */}
                    <div className="pt-3 border-t border-border space-y-2">
                      <div className="text-xs font-bold text-foreground">
                        已沉淀音频资料 ({docsTotal})
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 当前 Tab 匹配的有效资料列表（防止旧 Tab 残留闪烁；敬请期待模式下不展示音频列表） */}
              {(() => {
                if (SHOW_RECORDING_CARD_COMING_SOON && materialTab === '录音卡') {
                  return null;
                }

                const currentDocs = docs.filter((d) => {
                  if (materialTab === '录音卡') return (d.type as any) === 'audio';
                  if (materialTab === '对话') return d.type === 'chat';
                  return d.type === 'document';
                });

                return (
                  <>
                    {/* 空状态 */}
                    {!docsLoading && currentDocs.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="h-10 w-10 rounded-full bg-surface-raised border border-border flex items-center justify-center mb-2 text-secondary text-base">
                          {materialTab === '录音卡' ? '🎙' : materialTab === '对话' ? '💬' : '📄'}
                        </div>
                        <p className="text-xs font-semibold text-foreground">
                          {materialTab === '对话' ? '暂无对话' : materialTab === '录音卡' ? '暂无已沉淀音频' : '暂无资料'}
                        </p>
                        <p className="text-[11px] text-secondary mt-0.5">
                          {materialTab === '对话'
                            ? '与智能体进行日常业务对话，系统将自动从对话中提炼出你的决策逻辑'
                            : materialTab === '录音卡'
                            ? '通过录音卡同步音频后，系统将自动转写并萃取决策原则'
                            : '上传个人笔记、项目总结等第一手资料，系统将自动萃取决策原则'}
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
                                  <span className="text-[#f5a623] font-semibold">待萃取</span>
                                )}
                                {doc.extract_status === DOCUMENT_STATUS.Processing && (
                                  <span className="text-[#4a8fe7] font-semibold">萃取中</span>
                                )}
                                {doc.extract_status === DOCUMENT_STATUS.Done && (
                                  <span className="text-[#2d8a5f] dark:text-emerald-400 font-semibold">
                                    已萃取 {doc.extract_count} 条认知
                                  </span>
                                )}
                                {doc.extract_status === DOCUMENT_STATUS.Failed && (
                                  <span className="text-destructive font-semibold">萃取失败</span>
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
                                      ? '萃取中…'
                                      : doc.extract_status === DOCUMENT_STATUS.Pending
                                      ? '排队中…'
                                      : '重新萃取'}
                                  </button>
                                  <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-20 whitespace-nowrap rounded-xl bg-black/90 dark:bg-black px-3.5 py-1.5 text-xs font-medium text-white shadow-lg opacity-0 group-hover/re:opacity-100 transition-all duration-200">
                                    {doc.extract_status === DOCUMENT_STATUS.Pending || doc.extract_status === DOCUMENT_STATUS.Processing
                                      ? '当前正在处理中，暂不可重新萃取'
                                      : '将同步删除已萃取的认知'}
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
                                    title="更多操作"
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
                                        {downloadingId === doc.id ? '获取中…' : '下载'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setMoreMenuDocId(null);
                                          setDeletingDoc(doc);
                                        }}
                                        className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                      >
                                        删除
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
                                  删除
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* 分页器 */}
                        {renderPager(docsPage, docsLastPage, docsTotal, setDocsPage, materialTab === '对话' ? '份对话' : materialTab === '录音卡' ? '份音频' : '份资料')}
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
                大脑词条近况
              </h2>
              <p className="text-xs text-secondary mt-1">
                本周新增 <b className="text-foreground font-bold">{trendWeeks[trendWeeks.length - 1]?.adopted_count ?? 0}</b> 条 · 总沉淀 <b className="text-foreground font-bold">{stats?.adopted_count ?? 0}</b> 条，覆盖价值 · 决策 · 方式 · 案例。
              </p>
            </div>

            {/* 判断力成长曲线 */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs md:text-[13px] font-bold text-foreground flex items-center gap-1.5">
                  <span>📈</span>
                  <span>判断力成长曲线</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-secondary">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#2d8a5f]" />
                    已沉淀判断
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#FF6B35]" />
                    本周被调用
                  </span>
                </div>
              </div>

              {/* 曲线图 */}
              {trendLoading ? (
                <div className="h-[120px] flex items-center justify-center text-xs text-secondary/60">
                  加载趋势数据中…
                </div>
              ) : trendWeeks.length === 0 ? (
                <div className="h-[120px] flex items-center justify-center text-xs text-secondary/60">
                  暂无近 8 周趋势数据
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
                                  被调用: <b>{trendWeeks[hoveredWeekIndex].usage_count}</b> 次
                                </span>
                                <span className="text-[#2d8a5f] font-semibold flex items-center gap-1">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2d8a5f]" />
                                  已采纳: <b>{trendWeeks[hoveredWeekIndex].adopted_count}</b> 条
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

              <div className="text-[11px] text-secondary pt-1">
                近 {trendWeeks.length || 8} 周 · 已沉淀判断共 <b className="text-[#FF6B35] font-bold">{stats?.adopted_count ?? 0}</b> 条，被调用频次同步攀升（本周 <b className="text-[#FF6B35] font-bold">{trendWeeks[trendWeeks.length - 1]?.usage_count ?? 0}</b> 次）
              </div>
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
                确认删除{deletingDoc.type === 'chat' ? '对话' : '资料'}
              </h3>
              <p className="text-xs text-secondary">
                确定要删除 "{deletingDoc.name}" 吗？删除后将无法恢复。
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeletingDoc(null)}
                className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-raised transition-colors disabled:opacity-50 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="rounded-lg bg-destructive px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-destructive/90 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                {deleting ? '删除中…' : '确认删除'}
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
                {hasValidPersona ? '人设信息' : '完善商业人设信息'}
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
                第二大脑将以您的身份和主营业务为核心视角进行认知萃取与商业决策，请先完善人设信息。
              </p>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-secondary mb-1">
                  称呼/姓名 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={personaForm.name}
                  onChange={(e) => setPersonaForm({ ...personaForm, name: e.target.value })}
                  placeholder="例如：陈总"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-secondary mb-1">
                  主营业务 <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={personaForm.business}
                  onChange={(e) => setPersonaForm({ ...personaForm, business: e.target.value })}
                  placeholder="例如：高端美甲加盟与供应链"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-secondary mb-1">所属行业</label>
                <input
                  type="text"
                  value={personaForm.industry}
                  onChange={(e) => setPersonaForm({ ...personaForm, industry: e.target.value })}
                  placeholder="例如：美业 / 消费零售"
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-secondary mb-1">定位与风格</label>
                <textarea
                  rows={3}
                  value={personaForm.positioning}
                  onChange={(e) => setPersonaForm({ ...personaForm, positioning: e.target.value })}
                  placeholder="例如：专业实战派，重数据与落地交付，不做网红做生意"
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
                  取消
                </button>
              )}
              <button
                type="button"
                disabled={savingPersona || !personaForm.name.trim() || !personaForm.business.trim()}
                onClick={handleSavePersona}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {savingPersona ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 解除录音卡绑定确认弹窗 */}
      {showUnbindModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center text-lg shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">解除录音卡绑定</h3>
                <p className="text-xs text-secondary mt-0.5">此操作不会删除设备内音频</p>
              </div>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              确定要解除与当前录音卡的绑定吗？解绑后将清除与本电脑的配对记录，录音卡内存储的原始录音将完整保留。
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={unbinding}
                onClick={() => setShowUnbindModal(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-surface-raised transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={unbinding}
                onClick={handleUnbindBle}
                className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-destructive hover:bg-destructive/90 text-white shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {unbinding ? '解绑中…' : '确认解绑'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 录音卡 Wi-Fi 极速同步向导弹窗 */}
      {showWifiSyncModal && bleDevice && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200"
          onClick={() => !wifiConnecting && setShowWifiSyncModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📡</span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {autoConnectingWifi ? '正在自动连接录音卡 Wi-Fi' : '开启 Wi-Fi 极速同步'}
                  </h3>
                  <p className="text-[11px] text-secondary">音频文件较大，通过专用高速热点毫秒级传输</p>
                </div>
              </div>
              <button
                type="button"
                disabled={wifiConnecting}
                onClick={() => {
                  setShowWifiSyncModal(false);
                  setAutoConnectingWifi(false);
                }}
                className="text-secondary hover:text-foreground text-sm cursor-pointer disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            {openingWifiAp ? (
              <div className="py-8 flex flex-col items-center justify-center gap-3 text-xs text-secondary">
                <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                <span>正在唤醒录音卡高速 Wi-Fi 热点，请稍候…</span>
              </div>
            ) : autoConnectingWifi ? (
              <div className="py-6 flex flex-col items-center justify-center gap-3.5 text-center">
                <div className="relative flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-xl">
                    📡
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-foreground">
                    正在尝试自动连接录音卡热点
                  </div>
                  <div className="text-[11px] text-primary font-mono font-bold">
                    {bleDevice.wifiSsid}
                  </div>
                </div>
                <div className="text-[11px] text-secondary/80 max-w-[280px] leading-relaxed">
                  系统正在尝试自动直连。通常首次需连接 1 次，电脑记住热点后后续将免密自动同步。
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAutoConnectingWifi(false);
                    setAutoConnectFailed(true);
                  }}
                  className="mt-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                >
                  切换为手动连接模式 →
                </button>
              </div>
            ) : (
              <div className="space-y-3.5 text-xs">
                {autoConnectFailed && (
                  <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/20 text-warning text-[11px] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span>💡</span>
                      <span>未能自动直连，可手动选择热点（或重试）</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void runAutoConnectWifi(bleDevice.wifiSsid, bleDevice.wifiPassword);
                      }}
                      className="text-primary hover:underline font-semibold cursor-pointer shrink-0"
                    >
                      重试自动连接
                    </button>
                  </div>
                )}
                <div className="p-3 rounded-xl bg-surface-raised/60 border border-border/80 space-y-2">
                  <div className="text-[11.5px] font-semibold text-foreground">
                    ① 打开电脑 Wi-Fi 设置，连接设备热点：
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-surface border border-border">
                      <span className="text-secondary text-[11px]">Wi-Fi 热点名称 (SSID)</span>
                      <span className="font-mono font-bold text-foreground select-all">{bleDevice.wifiSsid}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-surface border border-border">
                      <span className="text-secondary text-[11px]">Wi-Fi 密码</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground select-all">{bleDevice.wifiPassword}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(bleDevice.wifiPassword);
                            setWifiGuideCopied(true);
                            setTimeout(() => setWifiGuideCopied(false), 2000);
                          }}
                          className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                        >
                          {wifiGuideCopied ? '已复制' : '复制密码'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 极速同步须知（免密记忆 + 临时切网说明） */}
                <div className="p-3 rounded-xl bg-surface-raised/80 border border-border/80 space-y-2 text-[11px] leading-relaxed">
                  <div className="flex items-center gap-1.5 text-foreground font-semibold">
                    <span className="text-primary text-xs">💡</span>
                    <span>极速同步须知</span>
                  </div>
                  <div className="space-y-1.5 text-secondary pl-3.5">
                    <div className="relative before:content-['•'] before:absolute before:-left-3 before:text-secondary">
                      <strong className="text-foreground">免输密码</strong>：通常仅需首次连接时输入 1 次密码。电脑记住热点后，后续日常同步将<strong>全自动无感直连</strong>。
                    </div>
                    <div className="relative before:content-['•'] before:absolute before:-left-3 before:text-secondary">
                      <strong className="text-foreground">临时占用网络</strong>：为实现超高速传输，同步期间电脑 Wi-Fi 将<strong>短暂占用数秒至数十秒</strong>直连设备，传输完成后<strong>立即自动恢复原有网络</strong>。若当前正在进行重要网络会议或通话，建议结束后再开启同步。
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-secondary leading-relaxed">
                  ② 电脑连上热点后，点击下方【我已连接，开始极速同步】，系统将自动建立高速通道并完成同步。传输完成后会自动切回原有网络。
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    disabled={wifiConnecting}
                    onClick={() => {
                      setShowWifiSyncModal(false);
                      setAutoConnectingWifi(false);
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border text-secondary hover:bg-surface-raised transition-colors cursor-pointer disabled:opacity-40"
                  >
                    暂不同步
                  </button>
                  <button
                    type="button"
                    disabled={wifiConnecting}
                    onClick={handleConfirmWifiAndSync}
                    className="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary hover:bg-primary-hover text-white shadow-2xs transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {wifiConnecting ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        <span>正在建立同步…</span>
                      </>
                    ) : (
                      '我已连接热点，开始极速同步'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* 自动同步设置弹窗 */}
      <AutoUploadSettingsModal
        isOpen={showAutoUploadModal}
        onClose={() => setShowAutoUploadModal(false)}
      />

      {/* 全局 Toast */}
      {toast && createPortal(
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-medium shadow-lg transition-all ${
            toast.type === 'success'
              ? 'bg-foreground text-background dark:bg-white dark:text-black'
              : 'bg-destructive text-destructive-foreground'
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
