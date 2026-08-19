import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import React, { useId } from 'react';

import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';

interface LibraryShareConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const LibraryShareConfirmDialog: React.FC<LibraryShareConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const cancel = (): void => {
    if (!busy) onCancel();
  };

  return (
    <Modal
      onClose={cancel}
      onEscape={cancel}
      overlayClassName="fixed inset-0 z-[9999] flex items-center justify-center modal-backdrop px-4"
      className="modal-content w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-modal"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="flex items-start gap-3 px-5 py-4">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised ${
            destructive ? 'text-destructive' : 'text-warning'
          }`}>
            <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1.5 text-sm leading-5 text-secondary">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={cancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            {i18nService.t('cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
              destructive
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-white'
            }`}
          >
            {busy ? i18nService.t('saving') : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default LibraryShareConfirmDialog;
