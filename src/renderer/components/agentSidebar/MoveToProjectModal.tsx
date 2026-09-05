import { FolderIcon, PlusIcon } from '@heroicons/react/24/outline';
import React, { useState } from 'react';
import { useSelector } from 'react-redux';

import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import { RootState } from '../../store';
import Modal from '../common/Modal';

interface MoveToProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionIds: string[];
  currentProjectId?: string | null;
  onSuccess?: () => void;
}

export const MoveToProjectModal: React.FC<MoveToProjectModalProps> = ({
  isOpen,
  onClose,
  sessionIds,
  currentProjectId,
  onSuccess,
}) => {
  const projects = useSelector((state: RootState) => state.cowork.projects);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSelectProject = async (projectId: string | null) => {
    setLoading(true);
    try {
      if (sessionIds.length === 1) {
        await coworkService.moveSessionToProject(sessionIds[0], projectId);
      } else if (sessionIds.length > 1) {
        await coworkService.moveSessionsToProject(sessionIds, projectId);
      }
      onSuccess?.();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAndMove = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const newProj = await coworkService.createProject({ name: trimmed });
      if (newProj) {
        if (sessionIds.length === 1) {
          await coworkService.moveSessionToProject(sessionIds[0], newProj.id);
        } else if (sessionIds.length > 1) {
          await coworkService.moveSessionsToProject(sessionIds, newProj.id);
        }
        onSuccess?.();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[9999] flex items-center justify-center modal-backdrop px-4"
      className="modal-content w-full max-w-sm rounded-2xl border border-border bg-surface shadow-modal overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          {i18nService.t('moveToProjectTitle')}
        </h2>
        <button
          type="button"
          onClick={() => setIsCreating(!isCreating)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-opacity"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          {i18nService.t('createProject')}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {isCreating && (
          <form onSubmit={handleCreateAndMove} className="space-y-2 mb-3 p-3 rounded-xl bg-surface-raised border border-border">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder={i18nService.t('projectNamePlaceholder')}
              autoFocus
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewProjectName('');
                }}
                className="px-2.5 py-1 text-xs rounded text-secondary hover:bg-surface transition-colors"
              >
                {i18nService.t('cancel')}
              </button>
              <button
                type="submit"
                disabled={!newProjectName.trim() || loading}
                className="px-2.5 py-1 text-xs rounded bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {i18nService.t('confirm')}
              </button>
            </div>
          </form>
        )}

        {currentProjectId && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleSelectProject(null)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <span className="w-4 h-4 flex items-center justify-center">✕</span>
            <span>{i18nService.t('removeFromProject')}</span>
          </button>
        )}

        <div className="max-h-60 overflow-y-auto space-y-1">
          {projects.length === 0 ? (
            <div className="py-6 text-center text-xs text-secondary">
              {i18nService.t('noProjectsYet')}
            </div>
          ) : (
            projects.map((proj) => {
              const isSelected = proj.id === currentProjectId;
              return (
                <button
                  key={proj.id}
                  type="button"
                  disabled={loading}
                  onClick={() => void handleSelectProject(proj.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground hover:bg-surface-raised'
                  }`}
                >
                  <FolderIcon className="w-4 h-4 shrink-0 opacity-70" />
                  <span className="truncate flex-1">{proj.name}</span>
                  {isSelected && (
                    <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                      ✓
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
export default MoveToProjectModal;
