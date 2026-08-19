import React from 'react';

import {
  LibraryCloudAvailabilityFilter,
  type LibraryCloudAvailabilityFilter as LibraryCloudAvailabilityFilterValue,
} from '../../../shared/library/constants';
import { i18nService } from '../../services/i18n';
import LibraryFilterDropdown, {
  type LibraryFilterDropdownOption,
} from './LibraryFilterDropdown';

interface LibraryAvailabilityDropdownProps {
  value: LibraryCloudAvailabilityFilterValue;
  options: readonly LibraryCloudAvailabilityFilterValue[];
  onChange: (value: LibraryCloudAvailabilityFilterValue) => void;
}

const STATUS_DOT_CLASSNAME: Record<LibraryCloudAvailabilityFilterValue, string> = {
  [LibraryCloudAvailabilityFilter.All]: 'bg-tertiary/50',
  [LibraryCloudAvailabilityFilter.Available]: 'bg-emerald-500',
  [LibraryCloudAvailabilityFilter.Unavailable]: 'bg-tertiary',
};

const LibraryAvailabilityDropdown: React.FC<LibraryAvailabilityDropdownProps> = ({
  value,
  options,
  onChange,
}) => {
  const dropdownOptions: LibraryFilterDropdownOption<LibraryCloudAvailabilityFilterValue>[] = (
    options.map(option => ({
      value: option,
      label: i18nService.t(`libraryCloudAvailability_${option}`),
      leading: (
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSNAME[option]}`}
        />
      ),
    }))
  );

  return (
    <LibraryFilterDropdown
      value={value}
      options={dropdownOptions}
      ariaLabel={i18nService.t('libraryCloudAvailabilityFilter')}
      onChange={onChange}
      triggerClassName="min-w-[116px]"
      menuClassName="w-40"
    />
  );
};

export default LibraryAvailabilityDropdown;
