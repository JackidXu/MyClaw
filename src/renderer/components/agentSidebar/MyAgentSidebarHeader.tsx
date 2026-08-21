import { MagnifyingGlassIcon,PlusIcon } from '@heroicons/react/24/outline';
import React from 'react';

import { i18nService } from '../../services/i18n';
import Tooltip, { TooltipAlign, TooltipPosition } from '../ui/Tooltip';

interface MyAgentSidebarHeaderProps {
  onCreateAgent: () => void;
  onSearchTasks?: () => void;
}

const MyAgentSidebarHeader: React.FC<MyAgentSidebarHeaderProps> = ({
  onCreateAgent,
  onSearchTasks,
}) => {
  return (
    <div className="group sticky top-0 z-30 -ml-[6px] flex h-9 w-[calc(100%+12px)] items-center justify-between bg-surface-raised pl-3 pr-1">
      <h2 className="min-w-0 truncate text-[12px] font-medium text-secondary/75 tracking-wide">
        {i18nService.t('myAgents')}
      </h2>
      <div className="flex items-center gap-0.5">
        {onSearchTasks && (
          <button
            type="button"
            onClick={onSearchTasks}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-secondary/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            aria-label="搜索任务"
          >
            <MagnifyingGlassIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <Tooltip
          content={i18nService.t('createNewAgent')}
          position={TooltipPosition.Bottom}
          align={TooltipAlign.End}
          delay={300}
          className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <button
            type="button"
            onClick={onCreateAgent}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-secondary/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            aria-label={i18nService.t('createNewAgent')}
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default MyAgentSidebarHeader;
