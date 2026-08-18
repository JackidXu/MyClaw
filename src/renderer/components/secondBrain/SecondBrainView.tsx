import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  adoptCognitionItem,
  type CognitionItem,
  type CognitionStats,
  createDocument,
  deleteChat,
  deleteDocument,
  DOCUMENT_STATUS,
  type DocumentItem,
  downloadDocument,
  fetchCognitionItemList,
  fetchCognitionStats,
  fetchDocumentList,
  fetchPersonaDetail,
  fetchUploadPresignedUrl,
  LAYER_LABEL,
  MATERIAL_TAB_TYPE,
  type PersonaData,
  reExtractDocument,
  rejectCognitionItem,
  updatePersona,
  uploadFileToTos,
} from '../../services/secondBrainApi';
import {
  MANAGEMENT_BODY_TEXT,
  MANAGEMENT_META_TEXT,
  MANAGEMENT_PAGE_TITLE_TEXT,
  MANAGEMENT_TITLE_TEXT,
} from '../common/managementTypography';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';

interface SecondBrainViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

/** 资料 Tab */
const MATERIAL_TABS = ['全部', '文档', '对话'] as const;
type MaterialTab = typeof MATERIAL_TABS[number];

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
  onNewChat,
  updateBadge,
}) => {
  const [materialTab, setMaterialTab] = useState<MaterialTab>('全部');
  const [stats, setStats] = useState<CognitionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [items, setItems] = useState<CognitionItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsPage, setItemsPage] = useState(1);
  const [itemsLastPage, setItemsLastPage] = useState(1);
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

  /** 资料列表相关 */
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsPage, setDocsPage] = useState(1);
  const [docsLastPage, setDocsLastPage] = useState(1);

  /** 上传/删除/下载/重新萃取/更多菜单状态 */
  const [uploading, setUploading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [reExtractingId, setReExtractingId] = useState<number | null>(null);
  const [moreMenuDocId, setMoreMenuDocId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isMac = window.electron.platform === 'darwin';
  const isWindows = window.electron.platform === 'win32';

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
      .then((data) => setStats(data))
      .catch((err) => console.warn('[SecondBrainView] 统计接口失败:', err))
      .finally(() => setStatsLoading(false));
  };

  /** 拉取待确认认知列表 */
  const loadItems = (page: number) => {
    setItemsLoading(true);
    fetchCognitionItemList({ page, pageSize: 10 })
      .then((res) => {
        setItems(res.data || []);
        setItemsLastPage(Number(res.last_page) || 1);
      })
      .catch((err) => { console.warn('[SecondBrainView] 认知列表接口失败:', err); })
      .finally(() => { setItemsLoading(false); });
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
      loadItems(itemsPage);
      loadStats();
      showToast('success', '认知已成功采纳并存入第二大脑');
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
      loadItems(itemsPage);
      loadStats();
      showToast('success', '认知已驳回');
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
      if (data) {
        setPersonaForm({
          name: data.name ?? '',
          business: data.business ?? '',
          industry: data.industry ?? '',
          positioning: data.positioning ?? '',
        });
      }
    } catch (err) {
      console.warn('[SecondBrainView] 获取人设详情失败:', err);
    } finally {
      setPersonaLoading(false);
    }
  };

  /** 保存/完善人设信息 */
  const handleSavePersona = async (isGuide = false) => {
    if (!personaForm.name.trim() || !personaForm.business.trim() || savingPersona) return;
    setSavingPersona(true);
    try {
      await updatePersona({
        name: personaForm.name.trim(),
        business: personaForm.business.trim(),
        industry: personaForm.industry.trim() || undefined,
        positioning: personaForm.positioning.trim() || undefined,
      });
      setPersona({
        name: personaForm.name.trim(),
        business: personaForm.business.trim(),
        industry: personaForm.industry.trim(),
        positioning: personaForm.positioning.trim(),
      });
      setShowPersonaModal(false);
      if (isGuide) {
        loadStats();
        loadItems(1);
        loadDocs(materialTab, 1);
      }
      showToast('success', isGuide ? '人设信息已完善，欢迎使用第二大脑' : '人设信息修改成功');
    } catch (err: any) {
      console.warn('[SecondBrainView] 保存人设失败:', err);
      showToast('error', `保存失败: ${err?.message || '未知错误'}`);
    } finally {
      setSavingPersona(false);
    }
  };

  /** 挂载时拉取人设和统计 */
  useEffect(() => {
    loadPersona();
    loadStats();
  }, []);

  /** 翻页或挂载时拉取认知列表 */
  useEffect(() => {
    loadItems(itemsPage);
  }, [itemsPage]);

  /** 拉取资料列表 */
  const loadDocs = (tab: MaterialTab, page: number) => {
    setDocsLoading(true);
    fetchDocumentList({ type: MATERIAL_TAB_TYPE[tab], page, pageSize: 10 })
      .then((res) => {
        setDocs(res.data);
        setDocsLastPage(Number(res.last_page) || 1);
      })
      .catch((err) => { console.warn('[SecondBrainView] 资料列表接口失败:', err); })
      .finally(() => { setDocsLoading(false); });
  };

  /** Tab 切换时重置页码并重新拉取 */
  useEffect(() => {
    setDocsPage(1);
    loadDocs(materialTab, 1);
  }, [materialTab]);

  /** 翻页时重新拉取 */
  useEffect(() => {
    loadDocs(materialTab, docsPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docsPage]);

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

    setUploading(true);
    let successCount = 0;
    const failedNames: string[] = [];

    for (const file of files) {
      try {
        const { upload_url, tos_url, key } = await fetchUploadPresignedUrl();
        await uploadFileToTos(upload_url, file);
        await createDocument({
          name: file.name,
          tosUrl: tos_url,
          tosKey: key,
        });
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

  /** 重新萃取资料 */
  const handleReExtract = async (docId: number) => {
    if (reExtractingId === docId) return;
    setReExtractingId(docId);
    try {
      await reExtractDocument(docId);
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
    try {
      if (isChat) {
        await deleteChat(deletingDoc.id);
      } else {
        await deleteDocument(deletingDoc.id);
      }
      setDeletingDoc(null);
      loadDocs(materialTab, docsPage);
      loadStats();
      showToast('success', `${isChat ? '对话' : '资料'} "${docName}" 已成功删除`);
    } catch (err: any) {
      console.warn('[SecondBrainView] 删除失败:', err);
      showToast('error', `删除失败: ${err?.message || '未知错误'}`);
    } finally {
      setDeleting(false);
    }
  };

  /** 统计卡片配置 */
  const statCards = stats
    ? [
        { label: '持续学习', value: String(stats.learning_days), unit: '天', pending: false },
        { label: '学习资料', value: String(stats.material_count), unit: '个', pending: false },
        { label: '已形成认知', value: String(stats.adopted_count), unit: '条', pending: false },
        { label: '待确认认知', value: String(stats.pending_count), unit: '条', pending: stats.pending_count > 0 },
      ]
    : [
        { label: '持续学习', value: '--', unit: '天', pending: false },
        { label: '学习资料', value: '--', unit: '个', pending: false },
        { label: '已形成认知', value: '--', unit: '条', pending: false },
        { label: '待确认认知', value: '--', unit: '条', pending: false },
      ];

  return (
    <div
      data-skin-management-page="true"
      className="relative z-10 flex-1 flex flex-col bg-background h-full overflow-hidden"
    >
      {/* Toast 反馈提示 */}
      {toast && (
        <div className="fixed top-4 right-6 z-50 flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg transition-all animate-in fade-in slide-in-from-top-2">
          {toast.type === 'success' ? (
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-destructive" />
          )}
          <span className={`text-xs font-medium ${toast.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {toast.message}
          </span>
        </div>
      )}

      {/* 顶部标题栏 */}
      <div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center space-x-3 h-8">
          {isSidebarCollapsed && !isWindows && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
                title="展开侧边栏"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
                title="新建对话"
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}
          <h1 className={`${MANAGEMENT_PAGE_TITLE_TEXT} font-semibold text-foreground`}>
            第二大脑
          </h1>
        </div>
      </div>

      {/* 页面内容区 */}
      {personaLoading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <span className="text-xs text-secondary/60">加载中…</span>
        </div>
      ) : !persona ? (
        /* 人设引导录入页 */
        <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-lg space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-1.5">
              <h1 className="text-xl font-bold text-foreground tracking-tight">打造你的「第二大脑」</h1>
              <p className={`${MANAGEMENT_BODY_TEXT} text-secondary`}>填写以下信息，让认知萃取更贴合你的真实情况</p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-6 space-y-4 shadow-subtle">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">称呼 <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={personaForm.name}
                  onChange={(e) => setPersonaForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：王老板"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">所属行业</label>
                <input
                  type="text"
                  value={personaForm.industry}
                  onChange={(e) => setPersonaForm((prev) => ({ ...prev, industry: e.target.value }))}
                  placeholder="例如：制造业"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">主要业务 <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={personaForm.business}
                  onChange={(e) => setPersonaForm((prev) => ({ ...prev, business: e.target.value }))}
                  placeholder="例如：跨境电商，主营东南亚服装零售"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">定位描述</label>
                <textarea
                  rows={3}
                  value={personaForm.positioning}
                  onChange={(e) => setPersonaForm((prev) => ({ ...prev, positioning: e.target.value }))}
                  placeholder="你希望对外传递的核心定位，将以此为基础理解你的专业视角进行认知萃取"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={!personaForm.name.trim() || !personaForm.business.trim() || savingPersona}
              onClick={() => handleSavePersona(true)}
              className="w-full h-10 rounded-xl bg-primary text-xs font-medium text-white shadow-xs hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {savingPersona ? '提交中…' : '开始使用'}
            </button>
          </div>
        </div>
      ) : (
        /* 常规第二大脑主页 */
        <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-[1120px] px-8 py-6 space-y-6">
            {/* 页面副标题 */}
            <p className={`${MANAGEMENT_BODY_TEXT} pb-1 text-secondary`}>
              持续学习你的经验、思考与决策方式，让 AI 在长期使用中越来越懂你
            </p>

            {/* 统计与人设卡片区 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {statCards.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-border bg-surface px-4 py-3.5 shadow-subtle transition hover:shadow-card"
                >
                  <div className={`${MANAGEMENT_META_TEXT} text-secondary mb-1`}>{stat.label}</div>
                  <div className={`text-xl font-semibold leading-tight ${statsLoading ? 'text-secondary/40' : 'text-foreground'}`}>
                    {/* 待确认认知：只有 > 0 时才显示橙色高亮 */}
                    <span className={stat.pending ? 'text-amber-500 dark:text-amber-400' : ''}>
                      {stat.value}
                    </span>
                    <span className={`${MANAGEMENT_BODY_TEXT} font-normal text-secondary ml-1`}>{stat.unit}</span>
                  </div>
                </div>
              ))}
              {/* 人设信息卡片 */}
              <div
                onClick={() => {
                  if (persona) {
                    setPersonaForm({
                      name: persona.name ?? '',
                      business: persona.business ?? '',
                      industry: persona.industry ?? '',
                      positioning: persona.positioning ?? '',
                    });
                  }
                  setShowPersonaModal(true);
                }}
                className="group cursor-pointer rounded-xl border border-border bg-surface px-4 py-3.5 shadow-subtle transition hover:border-primary/50 hover:shadow-card flex flex-col justify-between"
              >
                <div className={`${MANAGEMENT_META_TEXT} text-secondary mb-1`}>人设信息</div>
                <div className="flex items-center gap-2">
                  <span className={`${MANAGEMENT_TITLE_TEXT} font-semibold leading-tight text-foreground`}>
                    已完善
                  </span>
                  <span className={`${MANAGEMENT_META_TEXT} text-secondary group-hover:text-primary transition-colors`}>
                    修改
                  </span>
                </div>
              </div>
            </div>

            {/* 待确认认知区：有数据时才展示 */}
            {!itemsLoading && items.length > 0 && (
              <div className="space-y-3">
                <div>
                  <h2 className={`${MANAGEMENT_TITLE_TEXT} font-semibold text-foreground`}>待确认认知</h2>
                  <p className={`${MANAGEMENT_BODY_TEXT} text-secondary mt-0.5`}>
                    从你的资料和对话中发现了新的认知，请确认后加入你的第二大脑
                  </p>
                </div>

                <div className="space-y-3">
                  {items.map((item) => {
                    const hasChange = Boolean(item.replaces && item.replaces.length > 0);
                    return (
                      <div
                        key={item.node_id}
                        className="rounded-xl border border-border bg-surface p-4 shadow-subtle transition hover:shadow-card space-y-3"
                      >
                    {/* 顶部：标签 + 操作按钮 */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary">
                          {LAYER_LABEL[item.layer] ?? `层级${item.layer}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={actioningIds.has(item.node_id)}
                          onClick={() => handleAdopt(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                          <span>
                            {actioningIds.has(item.node_id)
                              ? '处理中…'
                              : hasChange
                              ? '采纳更新'
                              : '采纳'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={actioningIds.has(item.node_id)}
                          onClick={() => handleReject(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-raised transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <XMarkIcon className="h-3.5 w-3.5" />
                          <span>
                            {actioningIds.has(item.node_id)
                              ? '处理中…'
                              : hasChange
                              ? '保留原有'
                              : '驳回'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* 认知摘要与正文（编辑态 / 展示态） */}
                    {editingNodeId === item.node_id ? (
                      <div className="flex items-start gap-3">
                        <div className="flex-1 space-y-2">
                          <div>
                            <label className="block text-[11px] font-medium text-secondary mb-1">
                              认知摘要
                            </label>
                            <input
                              type="text"
                              autoFocus
                              value={editingPropText}
                              onChange={(e) => setEditingPropText(e.target.value)}
                              placeholder="请输入认知摘要"
                              className="w-full rounded-lg border border-primary bg-background px-3 py-1.5 text-sm font-semibold text-foreground outline-none shadow-xs focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-secondary mb-1">
                              认知正文
                            </label>
                            <textarea
                              rows={3}
                              value={editingElabText}
                              onChange={(e) => setEditingElabText(e.target.value)}
                              placeholder="请输入认知正文详情"
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none shadow-xs focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none leading-relaxed"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0 pt-5">
                          <button
                            type="button"
                            onClick={() => saveEditing(item.node_id)}
                            className="rounded-lg border border-primary bg-transparent px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-raised transition-colors whitespace-nowrap"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => startEditing(item)}
                        className="group relative cursor-pointer rounded-lg p-2 -m-2 space-y-1.5 transition-colors hover:bg-surface-raised/60 border border-transparent hover:border-border/40"
                        title="点击编辑认知"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground leading-relaxed flex-1">
                            {editedPropositions[item.node_id] ?? item.proposition}
                          </p>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary flex items-center gap-1 shrink-0 mt-0.5 font-normal">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            <span>点击编辑</span>
                          </span>
                        </div>
                        {(editedElaborations[item.node_id] ?? item.elaboration) && (
                          <p className="text-xs text-secondary leading-relaxed">
                            {editedElaborations[item.node_id] ?? item.elaboration}
                          </p>
                        )}
                      </div>
                    )}

                    {/* 认知变化提示 */}
                    {hasChange && item.replaces && (
                      <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span>认知变化</span>
                        </div>
                        {item.replaces.map((r, idx) => (
                          <div key={idx} className="text-xs text-secondary space-y-0.5">
                            <div>原有命题：{r.proposition}</div>
                            {r.elaboration && (
                              <div className="text-secondary/70">原有阐述：{r.elaboration}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 底部元数据 */}
                    <div className="flex items-center justify-between text-[11px] text-secondary/60">
                      <div className="flex items-center gap-3">
                        {Boolean(item.confidence && item.confidence > 0) && (
                          <span>置信度：{item.confidence}</span>
                        )}
                        {item.source_type === 1 && (
                          <span>来至文档{item.source_name ? `：${item.source_name}` : ''}</span>
                        )}
                        {item.source_type === 2 && (
                          <span>来至对话{item.source_name ? `：${item.source_name}` : ''}</span>
                        )}
                        {item.source_type === 3 && (
                          <span>来至{item.source_name ? ` ${item.source_name}` : '归纳'}</span>
                        )}
                      </div>
                      <span>{formatTimestamp(item.create_time)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 分页 */}
            {itemsLastPage > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  type="button"
                  disabled={itemsPage <= 1}
                  onClick={() => setItemsPage((p) => p - 1)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                <span className="text-xs text-secondary">
                  {itemsPage} / {itemsLastPage}
                </span>
                <button
                  type="button"
                  disabled={itemsPage >= itemsLastPage}
                  onClick={() => setItemsPage((p) => p + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}

          {/* 学习资料区 */}
          <div className="space-y-4">
            {/* 隐藏的文件上传 input */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".docx,.md,.txt"
              multiple
              onChange={handleFileChange}
            />

            <div>
              <h2 className={`${MANAGEMENT_TITLE_TEXT} font-semibold text-foreground`}>学习资料</h2>
            </div>

              {/* 第二行：分类 Tab（下划线风格） + 上传文档按钮 */}
              <div className="flex items-center justify-between gap-3 border-b border-border">
                <div className="flex items-center">
                  {MATERIAL_TABS.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setMaterialTab(tab)}
                      className={`relative px-3 pb-2.5 pt-0.5 ${MANAGEMENT_TITLE_TEXT} font-semibold transition-colors ${
                        materialTab === tab
                          ? 'text-foreground'
                          : 'text-secondary hover:text-foreground'
                      }`}
                    >
                      {tab}
                      <div
                        className={`absolute bottom-[-1px] left-0 right-0 h-0.5 rounded-full transition-colors ${
                          materialTab === tab ? 'bg-primary' : 'bg-transparent'
                        }`}
                      />
                    </button>
                  ))}
                </div>

                {/* 上传文档按钮 + hover tooltip */}
                <div className="relative group pb-2">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={handleUploadClick}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {uploading ? '上传中…' : '上传文档'}
                  </button>
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-10 whitespace-nowrap rounded-xl bg-black/90 dark:bg-black px-3.5 py-2 text-xs font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200">
                    支持 .docx / .md / .txt
                  </div>
                </div>
              </div>

              {/* 加载中 */}
              {docsLoading && (
                <div className="rounded-xl border border-border bg-surface flex items-center justify-center py-10 shadow-subtle">
                  <span className="text-xs text-secondary/60">加载中…</span>
                </div>
              )}

              {/* 空状态 */}
              {!docsLoading && docs.length === 0 && (
                <div className="rounded-xl border border-border bg-surface flex flex-col items-center justify-center py-12 px-6 text-center shadow-subtle">
                  <div className="h-12 w-12 rounded-full bg-surface-raised border border-border flex items-center justify-center mb-4">
                    <svg className="h-6 w-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className={`${MANAGEMENT_TITLE_TEXT} font-medium text-foreground mb-2`}>暂无资料</p>
                  <p className={`${MANAGEMENT_BODY_TEXT} text-secondary`}>
                    上传个人笔记、项目总结、思考记录等第一手资料，系统将自动萃取你的决策原则、行事标准
                  </p>
                  <p className={`${MANAGEMENT_META_TEXT} text-secondary/60 mt-2`}>
                    第三方课程笔记、行业报告等，萃取出的认知可能不完全代表本人，请注意甄别。
                  </p>
                </div>
              )}

              {/* 资料列表 */}
              {!docsLoading && docs.length > 0 && (
                <div className="space-y-2">
                  {docs.map((doc) => (
                    <div
                      key={`${doc.type}-${doc.id}`}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-subtle transition hover:border-primary/40 hover:shadow-card"
                    >
                  {/* 类型图标 */}
                  <div className="h-9 w-9 shrink-0 rounded-lg border border-border bg-surface-raised flex items-center justify-center">
                    {doc.type === 'document' ? (
                      <svg className="h-4 w-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
                      </svg>
                    )}
                  </div>

                  {/* 主信息 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px]">
                      <span className="text-secondary/60">{formatDate(doc.create_time)}</span>
                      <span className="text-secondary/60">·</span>
                      {/* extract_status 显示 */}
                      {doc.extract_status === DOCUMENT_STATUS.Pending && (
                        <span className="text-secondary/70">待萃取</span>
                      )}
                      {doc.extract_status === DOCUMENT_STATUS.Processing && (
                        <span className="text-primary font-medium">萃取中</span>
                      )}
                      {doc.extract_status === DOCUMENT_STATUS.Done && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">已萃取 {doc.extract_count} 条认知</span>
                      )}
                      {doc.extract_status === DOCUMENT_STATUS.Failed && (
                        <span className="text-destructive font-medium">萃取失败</span>
                      )}
                    </div>
                  </div>

                  {/* 右侧操作栏（Hover 时可见，或展开更多菜单时可见） */}
                  <div
                    className={`flex items-center gap-2 shrink-0 transition-opacity ${
                      moreMenuDocId === doc.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {doc.type === 'document' && (
                      <div className="relative group/re">
                        <button
                          type="button"
                          disabled={reExtractingId === doc.id}
                          onClick={() => handleReExtract(doc.id)}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors disabled:opacity-50"
                        >
                          {reExtractingId === doc.id ? '萃取中…' : '重新萃取'}
                        </button>
                        {/* Tooltip */}
                        <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-20 whitespace-nowrap rounded-xl bg-black/90 dark:bg-black px-3 py-1.5 text-xs font-medium text-white shadow-lg opacity-0 group-hover/re:opacity-100 transition-all duration-200">
                          将同步删除已萃取的认知
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
                          className={`h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border text-xs text-secondary hover:bg-surface-raised hover:text-foreground transition-colors ${
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
                              className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised transition-colors disabled:opacity-50"
                            >
                              {downloadingId === doc.id ? '获取中…' : '下载'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMoreMenuDocId(null);
                                setDeletingDoc(doc);
                              }}
                              className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 transition-colors"
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
                        className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-secondary hover:bg-surface-raised hover:text-destructive transition-colors"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

            {/* 分页 */}
            {!docsLoading && docsLastPage > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  type="button"
                  disabled={docsPage <= 1}
                  onClick={() => setDocsPage((p) => p - 1)}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs text-secondary hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                <span className="text-xs text-secondary">
                  {docsPage} / {docsLastPage}
                </span>
                <button
                  type="button"
                  disabled={docsPage >= docsLastPage}
                  onClick={() => setDocsPage((p) => p + 1)}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs text-secondary hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )}

      {/* 删除确认 Modal 弹窗 */}
      {deletingDoc &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg space-y-4">
              <div className="space-y-1">
                <h3 className={`${MANAGEMENT_TITLE_TEXT} font-semibold text-foreground`}>确认删除</h3>
                <p className={`${MANAGEMENT_BODY_TEXT} text-secondary leading-relaxed`}>
                  确定要删除{deletingDoc.type === 'chat' ? '对话' : '资料'} <span className="font-medium text-foreground">“{deletingDoc.name}”</span> 吗？此操作无法撤销。
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeletingDoc(null)}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-raised transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDelete}
                  className="rounded-xl bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {deleting ? '删除中…' : '确认删除'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* 人设编辑 Modal 弹窗 */}
      {showPersonaModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <h3 className={`${MANAGEMENT_TITLE_TEXT} font-semibold text-foreground`}>编辑人设信息</h3>
                <button
                  type="button"
                  onClick={() => setShowPersonaModal(false)}
                  className="rounded-lg p-1 text-secondary hover:bg-surface-raised transition-colors"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">称呼 <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={personaForm.name}
                    onChange={(e) => setPersonaForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="例如：王老板"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">所属行业</label>
                  <input
                    type="text"
                    value={personaForm.industry}
                    onChange={(e) => setPersonaForm((prev) => ({ ...prev, industry: e.target.value }))}
                    placeholder="例如：制造业"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">主要业务 <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={personaForm.business}
                    onChange={(e) => setPersonaForm((prev) => ({ ...prev, business: e.target.value }))}
                    placeholder="例如：跨境电商，主营东南亚服装零售"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">定位描述</label>
                  <textarea
                    rows={3}
                    value={personaForm.positioning}
                    onChange={(e) => setPersonaForm((prev) => ({ ...prev, positioning: e.target.value }))}
                    placeholder="你希望对外传递的核心定位，将以此为基础理解你的专业视角进行认知萃取"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
                <button
                  type="button"
                  disabled={savingPersona}
                  onClick={() => setShowPersonaModal(false)}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-raised transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!personaForm.name.trim() || !personaForm.business.trim() || savingPersona}
                  onClick={() => handleSavePersona(false)}
                  className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors disabled:opacity-50 shadow-xs"
                >
                  {savingPersona ? '更新中…' : '更新'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default SecondBrainView;
