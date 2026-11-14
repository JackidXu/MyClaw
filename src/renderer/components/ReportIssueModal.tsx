import { ArrowPathIcon, CheckIcon, PaperClipIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { AUTH_STORAGE_KEYS } from '../services/authStorage';
import { httpClient } from '../services/httpClient';
import { i18nService } from '../services/i18n';
import Modal from './common/Modal';

interface ReportIssueModalProps {
  onClose: () => void;
}

type IssueType = 'bug' | 'ai' | 'billing' | 'suggestion' | 'other';

interface IssueTypeOption {
  key: IssueType;
  labelKey: string;
  icon: string;
}

const ISSUE_TYPES: IssueTypeOption[] = [
  { key: 'bug', labelKey: 'reportTypeBug', icon: '🐞' },
  { key: 'ai', labelKey: 'reportTypeAi', icon: '🤖' },
  { key: 'billing', labelKey: 'reportTypeBilling', icon: '💳' },
  { key: 'suggestion', labelKey: 'reportTypeSuggestion', icon: '💡' },
  { key: 'other', labelKey: 'reportTypeOther', icon: '📝' },
];

interface UploadedAttachment {
  url: string;
  name: string;
  size?: number;
  type: 'image' | 'video' | 'file';
}

const ReportIssueModal: React.FC<ReportIssueModalProps> = ({ onClose }) => {
  const [issueType, setIssueType] = useState<IssueType>('bug');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [showDiagnosticsDetail, setShowDiagnosticsDetail] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化获取系统诊断环境信息
  useEffect(() => {
    if (window.electron?.appInfo?.getDiagnosticInfo) {
      window.electron.appInfo
        .getDiagnosticInfo()
        .then((res) => {
          if (res?.success) {
            setDiagnosticsData(res);
          }
        })
        .catch(() => {});
    }
  }, []);

  // 上传文件至 OSS
  const uploadFile = async (file: File): Promise<string | null> => {
    const targetPath = `/api/upload?folder=feedback&filename=${encodeURIComponent(file.name)}`;
    const resp = await httpClient.uploadFile<{ success: boolean; url?: string; error?: string }>(targetPath, file);
    if (resp.ok && resp.data && resp.data.success && resp.data.url) {
      return resp.data.url;
    }
    throw new Error(resp.data?.error || `${i18nService.t('reportUploadFailed')} [HTTP ${resp.status}]`);
  };

  // 处理文件添加
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    if (attachments.length + fileArr.length > 5) {
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('reportMaxAttachmentsToast') }));
      return;
    }

    setUploading(true);
    try {
      for (const file of fileArr) {
        if (file.size > 50 * 1024 * 1024) {
          window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('reportFileSizeLimitToast', { fileName: file.name }) }));
          continue;
        }

        const url = await uploadFile(file);
        if (url) {
          const isImg = file.type.startsWith('image/');
          const isVideo = file.type.startsWith('video/');
          setAttachments((prev) => [
            ...prev,
            {
              url,
              name: file.name,
              size: file.size,
              type: isImg ? 'image' : isVideo ? 'video' : 'file',
            },
          ]);
        }
      }
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('reportAttachmentUploadFailed', { error: err?.message || err }) }));
    } finally {
      setUploading(false);
    }
  }, [attachments.length]);

  // 处理输入框粘贴截图 (Cmd+V / Ctrl+V)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const filesToUpload: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const ext = file.type.split('/')[1] || 'png';
          const namedFile = new File([file], `screenshot-${Date.now()}.${ext}`, { type: file.type });
          filesToUpload.push(namedFile);
        }
      }
    }

    if (filesToUpload.length > 0) {
      void handleFiles(filesToUpload);
    }
  }, [handleFiles]);

  // 删除单个附件
  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // 提交反馈
  const handleSubmit = async () => {
    if (!content.trim()) {
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('reportDescriptionRequiredToast') }));
      return;
    }

    setSubmitting(true);
    try {
      let userId = '';
      try {
        const creds = await window.electron.auth.getAuthCredentials();
        userId = creds?.userId || '';
      } catch {
        // 容错
      }
      const nickname = localStorage.getItem(AUTH_STORAGE_KEYS.UserName) || '';

      let cleanDiagnostics: Record<string, any> = {};
      if (includeDiagnostics && diagnosticsData) {
        cleanDiagnostics = {
          appVersion: diagnosticsData.appVersion,
          platform: diagnosticsData.platform,
          arch: diagnosticsData.arch,
          locale: diagnosticsData.locale,
          nodeVersion: diagnosticsData.nodeVersion,
          electronVersion: diagnosticsData.electronVersion,
          timestamp: diagnosticsData.timestamp,
        };

        // 如果包含诊断日志切片，先直传云端 OSS 获取 log_url，避免 POST 请求体携带超大文本
        if (diagnosticsData.recentLogSnippet) {
          try {
            const logBlob = new Blob([diagnosticsData.recentLogSnippet], { type: 'text/plain;charset=utf-8' });
            const logFile = new File([logBlob], `diagnostic-log-${Date.now()}.log`, { type: 'text/plain' });
            const logUrl = await uploadFile(logFile);
            if (logUrl) {
              cleanDiagnostics.log_url = logUrl;
            }
          } catch (uploadLogErr) {
            console.warn('[ReportIssueModal] Upload log to OSS failed, will fallback to server auto-offload:', uploadLogErr);
          }
        }
      }

      const payload = {
        userId,
        nickname,
        type: issueType,
        content: content.trim(),
        contact: contact.trim(),
        attachments: attachments.map((a) => a.url),
        diagnostics: cleanDiagnostics,
      };

      const res = await httpClient.admin.post<{ success: boolean; id?: number; message?: string; error?: string }>(
        '/api/feedback',
        payload,
      );

      if (res.ok && res.data?.success) {
        window.dispatchEvent(
          new CustomEvent('app:showToast', { detail: i18nService.t('reportSubmitSuccessToast') }),
        );
        onClose();
      } else {
        throw new Error(res.data?.error || i18nService.t('reportSubmitFailedToast'));
      }
    } catch (err: any) {
      console.error('[ReportIssueModal] Submit feedback error:', err);
      window.dispatchEvent(
        new CustomEvent('app:showToast', {
          detail: i18nService.t('reportSubmitFailedWithReason', { error: err?.message || i18nService.t('reportNetworkTimeout') }),
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-xl mx-4 bg-surface rounded-2xl shadow-2xl overflow-hidden border border-border">
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛠️</span>
          <div>
            <h2 className="text-base font-bold text-foreground">{i18nService.t('reportModalTitle')}</h2>
            <p className="text-xs text-secondary mt-0.5">{i18nService.t('reportModalSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-secondary hover:text-foreground p-1 rounded-lg hover:bg-surface-raised transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* 主体表单 */}
      <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto [scrollbar-gutter:stable]">
        {/* 问题分类 */}
        <div>
          <label className="block text-xs font-semibold text-foreground/80 mb-2">{i18nService.t('reportIssueType')}</label>
          <div className="flex flex-wrap gap-2">
            {ISSUE_TYPES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setIssueType(item.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
                  issueType === item.key
                    ? 'bg-primary/10 border-primary text-primary font-semibold shadow-xs'
                    : 'bg-surface border-border/70 text-secondary hover:border-border hover:text-foreground'
                }`}
              >
                <span>{item.icon}</span>
                <span>{i18nService.t(item.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 问题描述 */}
        <div>
          <label className="block text-xs font-semibold text-foreground/80 mb-1.5">
            {i18nService.t('reportDescriptionLabel')} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={handlePaste}
              rows={4}
              placeholder={i18nService.t('reportDescriptionPlaceholder')}
              className="w-full text-xs sm:text-sm p-3 rounded-xl bg-surface border border-border/80 text-foreground placeholder:text-secondary/60 focus:outline-none focus:border-primary transition-all resize-none"
            />
          </div>
        </div>

        {/* 附件上传 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
              <span>{i18nService.t('reportMediaScreenshotLabel')}</span>
              <span className="text-secondary text-[11px] font-normal">{i18nService.t('reportMediaScreenshotTip')}</span>
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || attachments.length >= 5}
              className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 disabled:opacity-50"
            >
              <PaperClipIcon className="w-3.5 h-3.5" />
              <span>{i18nService.t('reportAddAttachment')}</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {/* 附件列表展示 */}
          {attachments.length > 0 ? (
            <div className="grid grid-cols-3 gap-2.5">
              {attachments.map((att, idx) => (
                <div key={idx} className="relative group rounded-xl overflow-hidden border border-border bg-surface-raised p-1.5 flex flex-col items-center">
                  {att.type === 'image' ? (
                    <img src={att.url} alt={att.name} className="w-full h-20 object-cover rounded-lg" />
                  ) : (
                    <div className="w-full h-20 bg-black/10 dark:bg-white/5 rounded-lg flex flex-col items-center justify-center text-xs text-secondary gap-1">
                      <span className="text-lg">🎬</span>
                      <span className="truncate max-w-[90%] text-[10px]">{att.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="absolute top-2.5 right-2.5 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title={i18nService.t('delete')}
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files);
              }}
              className="border border-dashed border-border/80 hover:border-primary/60 rounded-xl p-3.5 text-center cursor-pointer transition-colors bg-surface/40 hover:bg-surface-raised/40"
            >
              <p className="text-xs text-secondary">{i18nService.t('reportDragUploadTip')}</p>
            </div>
          )}

          {uploading && (
            <div className="flex items-center gap-2 mt-2 text-xs text-primary font-medium">
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              <span>{i18nService.t('reportUploadingAttachment')}</span>
            </div>
          )}
        </div>

        {/* 自动附带诊断日志 */}
        <div className="rounded-xl p-3 bg-surface-raised/50 border border-border/50 space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeDiagnostics}
              onChange={(e) => setIncludeDiagnostics(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 accent-primary"
            />
            <span className="text-xs font-semibold text-foreground/90">
              {i18nService.t('reportAutoAttachDiagnostics')} <span className="text-[11px] text-emerald-600 font-normal">{i18nService.t('reportRecommendedBadge')}</span>
            </span>
          </label>
          <div className="text-[11px] text-secondary pl-6 leading-relaxed flex items-center justify-between">
            <span>{i18nService.t('reportDiagnosticsHelp')}</span>
            {includeDiagnostics && diagnosticsData && (
              <button
                type="button"
                onClick={() => setShowDiagnosticsDetail(!showDiagnosticsDetail)}
                className="text-primary hover:underline ml-2 shrink-0"
              >
                {showDiagnosticsDetail ? i18nService.t('reportHideDetails') : i18nService.t('reportViewData')}
              </button>
            )}
          </div>

          {showDiagnosticsDetail && diagnosticsData && (
            <div className="mt-2 pl-6 pt-2 border-t border-border/40 text-[11px] text-secondary/90 font-mono space-y-1 bg-black/5 dark:bg-white/5 p-2 rounded-lg max-h-32 overflow-y-auto">
              <div>{i18nService.t('reportAppVersion', { version: diagnosticsData.appVersion || 'unknown' })}</div>
              <div>{i18nService.t('reportPlatformEnv', { platform: diagnosticsData.platform, arch: diagnosticsData.arch })}</div>
              <div>Node/Electron: {diagnosticsData.nodeVersion} / {diagnosticsData.electronVersion}</div>
              <div>{i18nService.t('reportLogSnippetLines', { count: diagnosticsData.recentLogSnippet ? diagnosticsData.recentLogSnippet.split('\n').length : 0 })}</div>
            </div>
          )}
        </div>

        {/* 联系方式 */}
        <div>
          <label className="block text-xs font-semibold text-foreground/80 mb-1.5">
            {i18nService.t('reportContactLabel')} <span className="text-secondary text-[11px] font-normal">{i18nService.t('reportContactTip')}</span>
          </label>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={i18nService.t('reportContactPlaceholder')}
            className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl bg-surface border border-border/80 text-foreground placeholder:text-secondary/60 focus:outline-none focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-surface-raised/40">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs sm:text-sm font-medium rounded-xl text-secondary hover:bg-surface hover:text-foreground transition-colors border border-transparent hover:border-border"
        >
          {i18nService.t('cancel')}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || uploading}
          className="px-5 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-white hover:opacity-90 active:scale-95 transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              <span>{i18nService.t('reportSubmitting')}</span>
            </>
          ) : (
            <>
              <CheckIcon className="w-4 h-4" />
              <span>{i18nService.t('reportSubmit')}</span>
            </>
          )}
        </button>
      </div>
    </Modal>
  );
};

export default ReportIssueModal;
