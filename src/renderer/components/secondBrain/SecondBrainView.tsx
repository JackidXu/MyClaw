import React, { useEffect, useRef, useState } from 'react';

import {
  adoptCognitionItem,
  CATEGORY_LABEL,
  type CognitionItem,
  type CognitionStats,
  createDocument,
  deleteDocument,
  DOCUMENT_STATUS,
  type DocumentItem,
  downloadDocument,
  fetchCognitionItemList,
  fetchCognitionStats,
  fetchDocumentList,
  fetchUploadPresignedUrl,
  MATERIAL_TAB_TYPE,
  rejectCognitionItem,
  uploadFileToTos,
} from '../../services/secondBrainApi';
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
function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 秒级时间戳转日期（MM-DD HH:mm） */
function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
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
  /** 正在操作中的 itemId（防止重复点击） */
  const [actioningIds, setActioningIds] = useState<Set<number>>(new Set());

  const ITEMS_PER_PAGE = 10;
  const itemsLastPage = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const paginatedItems = items.slice((itemsPage - 1) * ITEMS_PER_PAGE, itemsPage * ITEMS_PER_PAGE);

  /** 当条目变少导致当前页超出最后一页时，自动纠错重置 */
  useEffect(() => {
    if (itemsPage > itemsLastPage) {
      setItemsPage(itemsLastPage);
    }
  }, [itemsPage, itemsLastPage]);


  /** 资料列表相关 */
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsPage, setDocsPage] = useState(1);
  const [docsLastPage, setDocsLastPage] = useState(1);

  /** 上传/删除/下载状态 */
  const [uploading, setUploading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const loadItems = () => {
    setItemsLoading(true);
    fetchCognitionItemList()
      .then((data) => { setItems(data); })
      .catch((err) => { console.warn('[SecondBrainView] 认知列表接口失败:', err); })
      .finally(() => { setItemsLoading(false); });
  };

  /** 采纳 */
  const handleAdopt = async (item: CognitionItem) => {
    if (actioningIds.has(item.item_id)) return;
    setActioning(item.item_id, true);
    try {
      await adoptCognitionItem({ itemId: item.item_id, content: item.content, summary: item.summary });
      loadItems();
      loadStats();
      showToast('success', '认知已成功采纳并存入认知大脑');
    } catch (err: any) {
      console.warn('[SecondBrainView] 采纳失败:', err);
      showToast('error', `采纳失败: ${err?.message || '未知错误'}`);
    } finally {
      setActioning(item.item_id, false);
    }
  };

  /** 驳回 */
  const handleReject = async (item: CognitionItem) => {
    if (actioningIds.has(item.item_id)) return;
    setActioning(item.item_id, true);
    try {
      await rejectCognitionItem(item.item_id);
      loadItems();
      loadStats();
      showToast('success', '认知已驳回');
    } catch (err: any) {
      console.warn('[SecondBrainView] 驳回失败:', err);
      showToast('error', `驳回失败: ${err?.message || '未知错误'}`);
    } finally {
      setActioning(item.item_id, false);
    }
  };

  /** 初始拉取统计 */
  useEffect(() => {
    loadStats();
  }, []);

  /** 挂载时拉取认知列表 */
  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** 文件选择回调：预签名 -> TOS 上传 -> 创建记录 -> 刷新列表 */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const { upload_url, tos_url, key } = await fetchUploadPresignedUrl();
      await uploadFileToTos(upload_url, file);
      await createDocument({
        name: file.name,
        tosUrl: tos_url,
        tosKey: key,
      });
      loadDocs(materialTab, 1);
      loadStats();
      showToast('success', `资料 "${file.name}" 上传成功，系统正自动萃取中`);
    } catch (err: any) {
      console.warn('[SecondBrainView] 资料上传失败:', err);
      showToast('error', `资料 "${file.name}" 上传失败：${err?.message || '网络问题或解析异常'}`);
    } finally {
      setUploading(false);
    }
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

  /** 确认删除 */
  const handleConfirmDelete = async () => {
    if (!deletingDoc || deleting) return;
    setDeleting(true);
    const docName = deletingDoc.name;
    try {
      await deleteDocument(deletingDoc.id);
      setDeletingDoc(null);
      loadDocs(materialTab, docsPage);
      loadStats();
      showToast('success', `资料 "${docName}" 已成功删除`);
    } catch (err: any) {
      console.warn('[SecondBrainView] 删除资料失败:', err);
      showToast('error', `删除失败: ${err?.message || '未知错误'}`);
    } finally {
      setDeleting(false);
    }
  };

  /** 统计卡片配置 */
  const statCards = stats
    ? [
        { label: '持续学习', value: String(stats.learning_days), unit: '天', pending: false },
        { label: '已形成认知', value: String(stats.adopted_count), unit: '条', pending: false },
        { label: '待确认认知', value: String(stats.pending_count), unit: '条', pending: stats.pending_count > 0 },
        { label: '学习资料', value: String(stats.material_count), unit: '个', pending: false },
      ]
    : [
        { label: '持续学习', value: '--', unit: '天', pending: false },
        { label: '已形成认知', value: '--', unit: '条', pending: false },
        { label: '待确认认知', value: '--', unit: '条', pending: false },
        { label: '学习资料', value: '--', unit: '个', pending: false },
      ];

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Toast 反馈提示 */}
      {toast && (
        <div className="fixed top-4 right-6 z-50 flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 shadow-lg transition-all animate-in fade-in slide-in-from-top-2">
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
          <span className="non-draggable text-[13.5px] font-semibold select-none text-foreground">
            认知大脑
          </span>
        </div>
      </div>

      {/* 页面内容区（可滚动） */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
        {/* 页面副标题 */}
        <p className="text-sm text-secondary">
          持续学习你的经验、思考与决策方式，让 AI 在长期使用中越来越懂你
        </p>

        {/* 统计卡片区 */}
        <div className="grid grid-cols-4 gap-3">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-background px-4 py-3"
            >
              <div className="text-xs text-secondary mb-1">{stat.label}</div>
              <div className={`text-xl font-semibold leading-tight ${statsLoading ? 'text-secondary/40' : 'text-foreground'}`}>
                {/* 待确认认知：只有 > 0 时才显示橙色高亮 */}
                <span className={stat.pending ? 'text-amber-500 dark:text-amber-400' : ''}>
                  {stat.value}
                </span>
                <span className="text-sm font-normal text-secondary ml-1">{stat.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 待确认认知区：有数据时才展示 */}
        {!itemsLoading && items.length > 0 && (
          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">待确认认知</h2>
              <p className="text-xs text-secondary mt-0.5">
                从你的资料和对话中发现了新的认知，请确认后加入你的认知大脑
              </p>
            </div>

            <div className="space-y-3">
              {paginatedItems.map((item) => {
                const hasChange = Boolean(item.replace_summary);
                return (
                  <div
                    key={item.item_id}
                    className="rounded-xl border border-border bg-background p-4 space-y-3"
                  >
                    {/* 顶部：标签 + 操作按钮 */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary">
                          {CATEGORY_LABEL[item.category] ?? `类型${item.category}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={actioningIds.has(item.item_id)}
                          onClick={() => handleAdopt(item)}
                          className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actioningIds.has(item.item_id)
                            ? '处理中…'
                            : hasChange
                            ? '采纳更新'
                            : '采纳'}
                        </button>
                        <button
                          type="button"
                          disabled={actioningIds.has(item.item_id)}
                          onClick={() => handleReject(item)}
                          className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-raised transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actioningIds.has(item.item_id)
                            ? '处理中…'
                            : hasChange
                            ? '保留原有'
                            : '驳回'}
                        </button>
                      </div>
                    </div>

                    {/* 认知标题（使用 summary 字段） */}
                    <p className="text-sm font-medium text-foreground leading-relaxed">
                      {item.summary || item.content}
                    </p>

                    {/* 认知变化提示 */}
                    {hasChange && (
                      <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span>认知变化</span>
                        </div>
                        <div className="text-xs text-secondary">
                          原有认知：{item.replace_summary}
                        </div>
                      </div>
                    )}

                    {/* 底部元数据 */}
                    <div className="flex items-center justify-between text-[11px] text-secondary/60">
                      <div className="flex items-center gap-3">
                        <span>置信度：{item.confidence}</span>
                        {item.source_type === 1 && (
                          <span>来至文档：{item.source_name}</span>
                        )}
                        {item.source_type === 2 && (
                          <span>来至对话：{item.source_name}</span>
                        )}
                        {item.source_type === 3 && (
                          <span>来至 {item.source_name}</span>
                        )}
                      </div>
                      <span>{formatTimestamp(item.create_time)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 前端分页 */}
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
        <div>
          {/* 隐藏的文件上传 input */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".docx,.md,.txt"
            onChange={handleFileChange}
          />

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">学习资料</h2>
            {/* 上传资料按钮 + hover tooltip */}
            <div className="relative group">
              <button
                type="button"
                disabled={uploading}
                onClick={handleUploadClick}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {uploading ? '上传中…' : '上传资料'}
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute right-0 bottom-full mb-2 z-10 whitespace-nowrap rounded-xl bg-black/90 dark:bg-black px-3.5 py-2 text-xs font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200">
                支持 .docx / .md / .txt
              </div>
            </div>
          </div>

          {/* Tab 切换 */}
          <div className="flex items-center gap-1 mb-3">
            {MATERIAL_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMaterialTab(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  materialTab === tab
                    ? 'bg-primary/10 text-primary'
                    : 'text-secondary hover:bg-surface-raised hover:text-foreground'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 加载中 */}
          {docsLoading && (
            <div className="rounded-xl border border-border bg-background flex items-center justify-center py-10">
              <span className="text-xs text-secondary/60">加载中…</span>
            </div>
          )}

          {/* 空状态 */}
          {!docsLoading && docs.length === 0 && (
            <div className="rounded-xl border border-border bg-background flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="h-12 w-12 rounded-full bg-surface-raised border border-border flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-foreground mb-2">暂无资料</p>
              <p className="text-xs text-secondary">
                上传个人笔记、项目总结、思考记录等第一手资料，系统将自动萃取你的决策原则、行事标准
              </p>
              <p className="text-[11px] text-secondary/60 mt-2">
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
                  className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3"
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
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">已萃取 {doc.cognition_count} 条认知</span>
                      )}
                      {doc.extract_status === DOCUMENT_STATUS.Failed && (
                        <span className="text-destructive font-medium">萃取失败</span>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮（仅文档展示下载与删除） */}
                  {doc.type === 'document' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={downloadingId === doc.id}
                        onClick={() => handleDownload(doc.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-secondary hover:bg-surface-raised transition-colors disabled:opacity-50"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {downloadingId === doc.id ? '获取中…' : '下载'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingDoc(doc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-secondary hover:bg-surface-raised hover:text-destructive transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        删除
                      </button>
                    </div>
                  )}
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
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          )}
        </div>

        {/* 删除确认 Modal 弹窗 */}
        {deletingDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">确认删除</h3>
                <p className="text-xs text-secondary leading-relaxed">
                  确定要删除资料 <span className="font-medium text-foreground">“{deletingDoc.name}”</span> 吗？此操作无法撤销。
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeletingDoc(null)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-raised transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDelete}
                  className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {deleting ? '删除中…' : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecondBrainView;
