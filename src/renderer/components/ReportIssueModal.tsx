import { ArrowPathIcon, CheckIcon, PaperClipIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { httpClient } from '../services/httpClient';
import Modal from './common/Modal';

interface ReportIssueModalProps {
  onClose: () => void;
}

type IssueType = 'bug' | 'ai' | 'billing' | 'suggestion' | 'other';

interface IssueTypeOption {
  key: IssueType;
  label: string;
  icon: string;
}

const ISSUE_TYPES: IssueTypeOption[] = [
  { key: 'bug', label: '功能故障 / 报错', icon: '🐞' },
  { key: 'ai', label: 'AI 生成异常', icon: '🤖' },
  { key: 'billing', label: '账号与算力', icon: '💳' },
  { key: 'suggestion', label: '体验优化建议', icon: '💡' },
  { key: 'other', label: '其他问题', icon: '📝' },
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
    throw new Error(resp.data?.error || `上传失败 [HTTP ${resp.status}]`);
  };

  // 处理文件添加
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    if (attachments.length + fileArr.length > 5) {
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: '最多上传 5 个附件' }));
      return;
    }

    setUploading(true);
    try {
      for (const file of fileArr) {
        if (file.size > 50 * 1024 * 1024) {
          window.dispatchEvent(new CustomEvent('app:showToast', { detail: `文件 ${file.name} 超过 50MB 限制` }));
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
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: `附件上传失败: ${err?.message || err}` }));
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
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: '请填写问题描述' }));
      return;
    }

    setSubmitting(true);
    try {
      const userId = localStorage.getItem('heyclaw_user_id') || '';
      const nickname = localStorage.getItem('heyclaw_user_name') || '';

      const payload = {
        userId,
        nickname,
        type: issueType,
        content: content.trim(),
        contact: contact.trim(),
        attachments: attachments.map((a) => a.url),
        diagnostics: includeDiagnostics ? diagnosticsData : {},
      };

      const res = await httpClient.admin.post<{ success: boolean; id?: number; message?: string; error?: string }>(
        '/api/feedback',
        payload,
      );

      if (res.ok && res.data?.success) {
        window.dispatchEvent(
          new CustomEvent('app:showToast', { detail: '反馈已提交，感谢您的反馈！' }),
        );
        onClose();
      } else {
        throw new Error(res.data?.error || '提交失败，请重试');
      }
    } catch (err: any) {
      console.error('[ReportIssueModal] Submit feedback error:', err);
      window.dispatchEvent(
        new CustomEvent('app:showToast', {
          detail: `提交失败: ${err?.message || '网络连接超时'}`,
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
            <h2 className="text-base font-bold text-foreground">报告问题与产品建议</h2>
            <p className="text-xs text-secondary mt-0.5">您的反馈将直接送达研发团队，我们会第一时间跟进与优化</p>
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
          <label className="block text-xs font-semibold text-foreground/80 mb-2">问题类型</label>
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
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 问题描述 */}
        <div>
          <label className="block text-xs font-semibold text-foreground/80 mb-1.5">
            问题描述 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={handlePaste}
              rows={4}
              placeholder="请详细描述您遇到的问题现象、复现步骤或优化建议（支持直接截图后 Cmd+V 粘贴到此处）..."
              className="w-full text-xs sm:text-sm p-3 rounded-xl bg-surface border border-border/80 text-foreground placeholder:text-secondary/60 focus:outline-none focus:border-primary transition-all resize-none"
            />
          </div>
        </div>

        {/* 附件上传 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
              <span>图片 / 视频截图</span>
              <span className="text-secondary text-[11px] font-normal">(最多 5 个，支持 MP4/WebM/PNG/JPG)</span>
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || attachments.length >= 5}
              className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 disabled:opacity-50"
            >
              <PaperClipIcon className="w-3.5 h-3.5" />
              <span>添加附件</span>
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
                    title="删除"
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
              <p className="text-xs text-secondary">点击或将截图 / 录屏文件拖拽至此处上传</p>
            </div>
          )}

          {uploading && (
            <div className="flex items-center gap-2 mt-2 text-xs text-primary font-medium">
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              <span>正在上传附件到云端...</span>
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
              自动附带运行诊断信息与日志摘要 <span className="text-[11px] text-emerald-600 font-normal">（推荐）</span>
            </span>
          </label>
          <div className="text-[11px] text-secondary pl-6 leading-relaxed flex items-center justify-between">
            <span>包含客户端版本、系统架构以及近期运行日志切片（已自动脱敏）</span>
            {includeDiagnostics && diagnosticsData && (
              <button
                type="button"
                onClick={() => setShowDiagnosticsDetail(!showDiagnosticsDetail)}
                className="text-primary hover:underline ml-2 shrink-0"
              >
                {showDiagnosticsDetail ? '收起详情' : '查看数据'}
              </button>
            )}
          </div>

          {showDiagnosticsDetail && diagnosticsData && (
            <div className="mt-2 pl-6 pt-2 border-t border-border/40 text-[11px] text-secondary/90 font-mono space-y-1 bg-black/5 dark:bg-white/5 p-2 rounded-lg max-h-32 overflow-y-auto">
              <div>客户端版本: {diagnosticsData.appVersion || '未知'}</div>
              <div>系统环境: {diagnosticsData.platform} ({diagnosticsData.arch})</div>
              <div>Node/Electron: {diagnosticsData.nodeVersion} / {diagnosticsData.electronVersion}</div>
              <div>日志切片行数: {diagnosticsData.recentLogSnippet ? diagnosticsData.recentLogSnippet.split('\n').length : 0} 行</div>
            </div>
          )}
        </div>

        {/* 联系方式 */}
        <div>
          <label className="block text-xs font-semibold text-foreground/80 mb-1.5">
            联系方式 <span className="text-secondary text-[11px] font-normal">(选填，便于研发人员向您回访与确认)</span>
          </label>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="微信号 / 手机号 / 邮箱"
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
          取消
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
              <span>提交中...</span>
            </>
          ) : (
            <>
              <CheckIcon className="w-4 h-4" />
              <span>提交反馈</span>
            </>
          )}
        </button>
      </div>
    </Modal>
  );
};

export default ReportIssueModal;
