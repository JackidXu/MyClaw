import { XMarkIcon } from '@heroicons/react/24/outline';
import React from 'react';

import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';
import { type ScheduledTaskTemplate } from './taskTemplates';

interface ScheduledTaskTemplatePickerModalProps {
  templates: readonly ScheduledTaskTemplate[];
  onClose: () => void;
  onNew: () => void;
  onSelect: (template: ScheduledTaskTemplate) => void;
}

const ScheduledTaskTemplatePickerModal: React.FC<ScheduledTaskTemplatePickerModalProps> = ({
  templates,
  onClose,
  onNew,
  onSelect,
}) => {
  return (
    <Modal
      isOpen
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[60] flex items-center justify-center bg-black/10 dark:bg-black/50"
      className="w-[calc(100vw-56px)] max-w-[860px] max-h-[86vh] rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.16)] overflow-hidden flex flex-col"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">
            {i18nService.t('scheduledTasksTemplateTitle')}
          </h2>
          <p className="mt-0.5 truncate text-xs text-secondary">
            {i18nService.t('scheduledTasksTemplateSubtitle')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onNew}
            className="h-8 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:bg-surface-raised transition-colors"
          >
            {i18nService.t('scheduledTasksTemplateNew')}
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-surface-raised transition-colors">
            <XMarkIcon className="h-5 w-5 text-secondary" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {templates.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-secondary">
            {i18nService.t('scheduledTasksTemplateEmpty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => {
              return (
                <div
                  key={template.id}
                  onClick={() => onSelect(template)}
                  className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-left shadow-subtle transition hover:border-primary/50 hover:bg-surface-raised hover:shadow-card cursor-pointer"
                >
                  <div className="text-sm font-bold text-foreground">
                    {i18nService.t(template.titleKey)}
                  </div>
                  <div>
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {i18nService.t(template.scheduleBadgeKey)}
                    </span>
                  </div>
                  <div className="text-xs leading-relaxed text-secondary line-clamp-2">
                    {i18nService.t(template.teamKey)}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(template);
                    }}
                    className="mt-auto w-full rounded-lg border border-border bg-surface py-1.5 text-xs font-semibold text-foreground shadow-sm transition hover:border-primary hover:bg-primary hover:text-white"
                  >
                    {i18nService.t('scheduledTasksTemplateAdoptBtn')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ScheduledTaskTemplatePickerModal;
