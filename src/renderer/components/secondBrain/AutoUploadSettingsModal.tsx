import React, { useEffect, useState } from 'react';

import { secondBrainAutoUploadService } from '../../services/secondBrainAutoUpload';
import Modal from '../common/Modal';

interface AutoUploadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AutoUploadSettingsModal: React.FC<AutoUploadSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [watchDir, setWatchDir] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void secondBrainAutoUploadService.getConfigAndStatus().then((res) => {
        if (res?.config) {
          setWatchDir(res.config.watchDir || '');
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /** 选择或更改目录 */
  const handleSelectDirectory = async () => {
    const selected = await secondBrainAutoUploadService.selectWatchDir();
    if (selected) {
      setWatchDir(selected);
      setSaveLoading(true);
      try {
        await secondBrainAutoUploadService.setConfig({
          watchDir: selected,
        });
      } finally {
        setSaveLoading(false);
      }
    }
  };

  /** 清除已配置的目录 */
  const handleClearDirectory = async () => {
    setWatchDir('');
    setSaveLoading(true);
    try {
      await secondBrainAutoUploadService.setConfig({
        watchDir: '',
      });
    } finally {
      setSaveLoading(false);
    }
  };

  /** 手动立即触发同步 */
  const handleTriggerManualSync = async () => {
    if (!watchDir) {
      await handleSelectDirectory();
      return;
    }
    setIsSyncing(true);
    try {
      const result = await secondBrainAutoUploadService.triggerSync();
      if (result.success) {
        if (result.count === 0) {
          window.dispatchEvent(new CustomEvent('app:showToast', { detail: '已是最新，暂无可同步文档' }));
        } else {
          window.dispatchEvent(new CustomEvent('app:showToast', { detail: `已成功同步并提交萃取 ${result.count} 篇文档` }));
        }
      } else {
        window.dispatchEvent(new CustomEvent('app:showToast', { detail: '同步扫描失败，请检查目录是否有效' }));
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="w-full max-w-[500px] mx-4 bg-surface border border-border rounded-2xl shadow-modal overflow-hidden text-foreground animate-in fade-in zoom-in-95 duration-150"
    >
      {/* 弹窗头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FF6B35]/10 text-[#FF6B35] flex items-center justify-center text-base shrink-0 font-semibold">
            📁
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">文档自动同步设置</h2>
            <p className="text-[11px] text-secondary">
              选定本地目录后，系统将自动扫描并将新文档排队上传至第二大脑进行萃取
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-secondary hover:text-foreground p-1.5 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* 弹窗主体 */}
      <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto [scrollbar-gutter:stable]">
        {/* 监听目录设置卡片 */}
        <div className="p-4 rounded-xl border border-border bg-surface-raised/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">本地目录</span>
              {watchDir && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                  每 5 分钟自动扫描
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {watchDir ? (
                <>
                  <button
                    type="button"
                    disabled={saveLoading}
                    onClick={handleSelectDirectory}
                    className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    更换目录
                  </button>
                  <span className="text-border">|</span>
                  <button
                    type="button"
                    disabled={saveLoading}
                    onClick={handleClearDirectory}
                    className="text-xs font-semibold text-destructive/80 hover:text-destructive transition-colors cursor-pointer disabled:opacity-50"
                  >
                    清除
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={saveLoading}
                  onClick={handleSelectDirectory}
                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer disabled:opacity-50"
                >
                  选择目录
                </button>
              )}
            </div>
          </div>

          <div
            className={`p-2.5 rounded-lg border text-xs font-mono break-all select-all ${
              watchDir
                ? 'bg-surface border-border text-foreground'
                : 'bg-surface/50 border-dashed border-border text-secondary/70 italic'
            }`}
          >
            {watchDir || '尚未设置同步目录，请点击上方按钮选择电脑上的文件夹'}
          </div>

          <div className="text-[11px] text-secondary">
            设置目录后，系统将持续在后台每 5 分钟自动巡检，发现新文档即刻排队上传。
          </div>
        </div>

        {/* 规则说明卡片 */}
        <div className="p-3.5 rounded-xl border border-border/60 bg-surface text-[11px] text-secondary space-y-1">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <span>💡</span>
            <span>同步规则说明</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 pl-0.5 text-[10.5px]">
            <li>仅支持 <strong className="text-foreground">.docx</strong>、<strong className="text-foreground">.md</strong>、<strong className="text-foreground">.txt</strong> 格式文档</li>
            <li>单文件大小不超过 <strong className="text-foreground">2MB</strong>，单批最多批量处理 10 份</li>
          </ul>
        </div>
      </div>

      {/* 弹窗底部操作栏 */}
      <div className="flex items-center justify-between px-6 py-3.5 border-t border-border/70 bg-surface-raised/20">
        <button
          type="button"
          disabled={!watchDir || isSyncing}
          onClick={handleTriggerManualSync}
          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border bg-surface hover:bg-surface-raised text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
        >
          <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
          <span>{isSyncing ? '正在同步…' : '立即同步'}</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="px-5 py-1.5 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors cursor-pointer"
        >
          完成
        </button>
      </div>
    </Modal>
  );
};
