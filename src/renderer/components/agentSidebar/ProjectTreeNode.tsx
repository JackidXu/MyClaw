import React, { useCallback, useEffect, useRef, useState } from 'react';

import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import ComposeIcon from '../icons/ComposeIcon';
import EditIcon from '../icons/EditIcon';
import EllipsisHorizontalIcon from '../icons/EllipsisHorizontalIcon';
import FolderIcon from '../icons/FolderIcon';
import TrashIcon from '../icons/TrashIcon';
import AgentTaskRow from './AgentTaskRow';
import { createSessionBatchKey } from './batchSelection';
import type { AgentSidebarProjectNode, AgentSidebarTaskNode } from './types';

interface ProjectTreeNodeProps {
  project: AgentSidebarProjectNode;
  isBatchMode: boolean;
  batchAgentId: string | null;
  selectedKeys: Set<string>;
  onToggleExpanded: (projectId: string) => void;
  onCreateTask?: (project: AgentSidebarProjectNode) => void;
  onSelectTask: (task: AgentSidebarTaskNode) => void;
  onDeleteTask: (task: AgentSidebarTaskNode) => Promise<void>;
  onShareTask: (task: AgentSidebarTaskNode) => Promise<void>;
  onToggleTaskPin: (task: AgentSidebarTaskNode, pinned: boolean) => Promise<void>;
  onRenameTask: (task: AgentSidebarTaskNode, title: string) => Promise<void>;
  onToggleSelection: (selectionKey: string, agentId: string) => void;
  onEnterBatchMode: (task: AgentSidebarTaskNode) => void;
  onSidebarAction?: (actionType: string, params?: Record<string, unknown>) => void;
  getTaskActionParams?: (task: AgentSidebarTaskNode) => {
    agentType: 'main' | 'custom';
    hasActiveSubagent?: boolean;
    isCurrentSession: boolean;
    isPinned: boolean;
    taskStatus: string;
  };
}

const ACTION_MENU_VIEWPORT_PADDING = 8;
const ACTION_MENU_VERTICAL_GAP = 4;
const ACTION_MENU_HEIGHT = 110;

export const ProjectTreeNode: React.FC<ProjectTreeNodeProps> = ({
  project,
  isBatchMode,
  batchAgentId,
  selectedKeys,
  onToggleExpanded,
  onCreateTask,
  onSelectTask,
  onDeleteTask,
  onShareTask,
  onToggleTaskPin,
  onRenameTask,
  onToggleSelection,
  onEnterBatchMode,
  onSidebarAction,
  getTaskActionParams,
}) => {
  const [menuPosition, setMenuPosition] = useState<{ right: number; top: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState(project.name);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isMenuOpen = menuPosition !== null;
  const hasVisibleTasks = project.tasks.length > 0;

  const calculateMenuPosition = useCallback(() => {
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const right = Math.max(ACTION_MENU_VIEWPORT_PADDING, window.innerWidth - rect.right);
    const top = Math.max(
      ACTION_MENU_VIEWPORT_PADDING,
      Math.min(
        rect.bottom + ACTION_MENU_VERTICAL_GAP,
        window.innerHeight - ACTION_MENU_HEIGHT - ACTION_MENU_VIEWPORT_PADDING,
      ),
    );

    return { right, top };
  }, []);

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  const toggleMenu = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isMenuOpen) {
      closeMenu();
      return;
    }

    const position = calculateMenuPosition();
    if (position) {
      setMenuPosition(position);
    }
  };

  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      closeMenu();
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [closeMenu, isMenuOpen]);

  useEffect(() => {
    if (!isEditing) return;
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [isEditing]);

  const handleSaveRename = async () => {
    const trimmed = editingName.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== project.name) {
      await coworkService.updateProject({ id: project.id, name: trimmed });
    } else {
      setEditingName(project.name);
    }
  };

  const handleDeleteProject = async () => {
    setShowConfirmDelete(false);
    await coworkService.deleteProject(project.id);
  };

  return (
    <div className="relative">
      <div
        role="treeitem"
        tabIndex={0}
        aria-expanded={project.isExpanded}
        onClick={() => onToggleExpanded(project.id)}
        className="group relative -ml-[6px] flex h-8 w-[calc(100%+12px)] cursor-pointer items-center rounded-md pl-3 pr-2 transition-colors hover:bg-surface-raised"
      >
        <div className="mr-2 flex h-4 w-4 shrink-0 items-center justify-center text-primary">
          <FolderIcon className="h-4 w-4" />
        </div>

        {isEditing ? (
          <input
            ref={renameInputRef}
            type="text"
            value={editingName}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={handleSaveRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveRename();
              if (e.key === 'Escape') {
                setEditingName(project.name);
                setIsEditing(false);
              }
            }}
            className="flex-1 min-w-0 bg-surface border border-primary/50 rounded px-1 text-[13px] text-foreground focus:outline-none"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-foreground">
            {project.name}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <span className="text-[11px] text-secondary/60 tabular-nums">
            {project.tasks.length}
          </span>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={toggleMenu}
            className={`inline-flex h-5 w-5 items-center justify-center rounded text-foreground transition-opacity hover:opacity-[0.46] ${
              isMenuOpen ? 'opacity-[0.46]' : 'opacity-0 group-hover:opacity-[0.3]'
            }`}
          >
            <EllipsisHorizontalIcon className="h-4 w-4" />
          </button>
        </div>

        {menuPosition && (
          <div
            ref={menuRef}
            className="fixed z-[60] w-max min-w-[110px] overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
            style={{ top: menuPosition.top, right: menuPosition.right }}
            role="menu"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                onCreateTask?.(project);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-surface-raised transition-colors"
              role="menuitem"
            >
              <ComposeIcon className="h-3.5 w-3.5" />
              {i18nService.t('createProjectTask')}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                setIsEditing(true);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-surface-raised transition-colors"
              role="menuitem"
            >
              <EditIcon className="h-3.5 w-3.5" />
              {i18nService.t('editProject')}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                setShowConfirmDelete(true);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-destructive hover:bg-destructive/10 transition-colors"
              role="menuitem"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {i18nService.t('deleteProject')}
            </button>
          </div>
        )}
      </div>

      {project.isExpanded && (
        <div className="min-w-0 max-w-full space-y-0.5 mt-0.5">
          {!hasVisibleTasks ? (
            <div className="-ml-[6px] flex h-7 w-[calc(100%+12px)] items-center pl-[38px] pr-2.5 text-xs text-secondary/60">
              {i18nService.t('projectEmptyTasks')}
            </div>
          ) : (
            project.tasks.map((task) => (
              <AgentTaskRow
                key={task.id}
                task={task}
                isBatchMode={isBatchMode}
                isSelected={selectedKeys.has(createSessionBatchKey(task.id))}
                isSelectionDisabled={isBatchMode && batchAgentId !== null && batchAgentId !== task.agentId}
                showBatchOption={false}
                onSelect={() => onSelectTask(task)}
                onDelete={() => onDeleteTask(task)}
                onShare={() => onShareTask(task)}
                onTogglePin={(pinned) => onToggleTaskPin(task, pinned)}
                onRename={(title) => onRenameTask(task, title)}
                onToggleSelection={() => onToggleSelection(createSessionBatchKey(task.id), task.agentId)}
                onEnterBatchMode={() => onEnterBatchMode(task)}
                onSidebarAction={onSidebarAction}
                analyticsParams={getTaskActionParams?.(task)}
              />
            ))
          )}
        </div>
      )}

      {showConfirmDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-modal overflow-hidden p-5 space-y-4">
            <h3 className="text-base font-semibold text-foreground">
              {i18nService.t('deleteProject')}
            </h3>
            <p className="text-sm text-secondary leading-relaxed">
              {i18nService.t('deleteProjectConfirm').replace('{name}', project.name)}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                {i18nService.t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteProject()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-destructive text-white hover:opacity-90 transition-opacity"
              >
                {i18nService.t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ProjectTreeNode;
