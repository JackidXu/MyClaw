import React, { useEffect, useState } from 'react';

import { i18nService } from '../../services/i18n';
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
  const [savedWatchDir, setSavedWatchDir] = useState('');
  const [draftWatchDir, setDraftWatchDir] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void secondBrainAutoUploadService.getConfigAndStatus().then((res) => {
        if (res?.config) {
          const current = res.config.watchDir || '';
          setSavedWatchDir(current);
          setDraftWatchDir(current);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /** 选择或更改目录（暂存至组件 state，点击完成正式生效） */
  const handleSelectDirectory = async () => {
    const selected = await secondBrainAutoUploadService.selectWatchDir();
    if (selected) {
      setDraftWatchDir(selected);
    }
  };

  /** 清除已配置的目录（暂存） */
  const handleClearDirectory = () => {
    setDraftWatchDir('');
  };

  /** 点击完成：若有修改自动保存生效并关闭弹窗 */
  const handleComplete = async () => {
    if (draftWatchDir !== savedWatchDir) {
      setSaveLoading(true);
      try {
        const res = await secondBrainAutoUploadService.setConfig({
          watchDir: draftWatchDir,
        });
        if (res?.config) {
          setSavedWatchDir(res.config.watchDir || '');
          setDraftWatchDir(res.config.watchDir || '');
          window.dispatchEvent(
            new CustomEvent('app:showToast', {
              detail: draftWatchDir
                ? i18nService.t('secondBrainAutoSyncSavedToast')
                : i18nService.t('secondBrainAutoSyncClearedToast'),
            }),
          );
        }
      } catch {
        window.dispatchEvent(
          new CustomEvent('app:showToast', {
            detail: i18nService.t('secondBrainAutoSyncSaveFailToast'),
          }),
        );
      } finally {
        setSaveLoading(false);
      }
    }
    onClose();
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
            <h2 className="text-sm font-bold text-foreground">
              {i18nService.t('secondBrainAutoSyncModalTitle')}
            </h2>
            <p className="text-[11px] text-secondary">
              {i18nService.t('secondBrainAutoSyncModalDesc')}
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
              <span className="text-xs font-bold text-foreground">
                {i18nService.t('secondBrainAutoSyncLocalDir')}
              </span>
              {savedWatchDir && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                  {i18nService.t('secondBrainAutoSyncScanInterval')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {draftWatchDir ? (
                <>
                  <button
                    type="button"
                    disabled={saveLoading}
                    onClick={handleSelectDirectory}
                    className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {i18nService.t('secondBrainAutoSyncChangeDir')}
                  </button>
                  <span className="text-border">|</span>
                  <button
                    type="button"
                    disabled={saveLoading}
                    onClick={handleClearDirectory}
                    className="text-xs font-semibold text-destructive/80 hover:text-destructive transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {i18nService.t('secondBrainAutoSyncClearDir')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={saveLoading}
                  onClick={handleSelectDirectory}
                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {i18nService.t('secondBrainAutoSyncSelectDir')}
                </button>
              )}
            </div>
          </div>

          <div
            className={`p-2.5 rounded-lg border text-xs font-mono break-all select-all ${
              draftWatchDir
                ? 'bg-surface border-border text-foreground'
                : 'bg-surface/50 border-dashed border-border text-secondary/70 italic'
            }`}
          >
            {draftWatchDir || i18nService.t('secondBrainAutoSyncPlaceholder')}
          </div>

          <div className="text-[11px] text-secondary">
            {i18nService.t('secondBrainAutoSyncCardTip')}
          </div>
        </div>

        {/* 规则说明卡片 */}
        <div className="p-3.5 rounded-xl border border-border/60 bg-surface text-[11px] text-secondary space-y-1">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <span>💡</span>
            <span>{i18nService.t('secondBrainAutoSyncRulesTitle')}</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 pl-0.5 text-[10.5px]">
            <li>{i18nService.t('secondBrainAutoSyncRuleFormats')}</li>
            <li>{i18nService.t('secondBrainAutoSyncRuleLimits')}</li>
          </ul>
        </div>
      </div>

      {/* 弹窗底部操作栏 */}
      <div className="flex items-center justify-end px-6 py-3.5 border-t border-border/70 bg-surface-raised/20">
        <button
          type="button"
          disabled={saveLoading}
          onClick={handleComplete}
          className="px-5 py-1.5 text-xs font-bold rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors cursor-pointer disabled:opacity-50"
        >
          {saveLoading ? i18nService.t('saving') : i18nService.t('complete')}
        </button>
      </div>
    </Modal>
  );
};
