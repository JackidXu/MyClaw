import { FunnelIcon } from '@heroicons/react/24/outline';
import React from 'react';

import type { LibraryCategory } from '../../../shared/library/constants';
import { i18nService } from '../../services/i18n';
import LibraryFilterDropdown from './LibraryFilterDropdown';

interface LibraryCategoryDropdownProps {
  value: LibraryCategory;
  options: readonly LibraryCategory[];
  onChange: (value: LibraryCategory) => void;
}

const LibraryCategoryDropdown: React.FC<LibraryCategoryDropdownProps> = ({
  value,
  options,
  onChange,
}) => {
  return (
    <LibraryFilterDropdown
      value={value}
      options={options.map(option => ({
        value: option,
        label: i18nService.t(`libraryCategory_${option}`),
      }))}
      ariaLabel={i18nService.t('libraryCategoryFilter')}
      onChange={onChange}
      triggerLeading={<FunnelIcon className="h-4 w-4 shrink-0 text-secondary" />}
    />
  );
};

export default LibraryCategoryDropdown;
