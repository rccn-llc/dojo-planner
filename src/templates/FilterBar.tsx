'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select';

export type FilterDropdownOption = {
  value: string;
  label: string;
};

export type FilterDropdown = {
  /**
   * Unique identifier for the dropdown
   */
  id: string;

  /**
   * Current selected value
   */
  value: string;

  /**
   * Callback when value changes
   */
  onChange: (value: string) => void;

  /**
   * Available options for the dropdown
   */
  options: FilterDropdownOption[];

  /**
   * Placeholder text for the dropdown
   */
  placeholder: string;

  /**
   * Optional width class for the dropdown
   * @default "w-full sm:w-40"
   */
  width?: string;
};

export type SearchConfig = {
  /**
   * Placeholder text for the search input
   */
  placeholder: string;

  /**
   * Current search value
   */
  value: string;

  /**
   * Callback when search value changes
   */
  onChange: (value: string) => void;
};

export type FilterBarProps = {
  /**
   * Configuration for the search input
   */
  searchConfig: SearchConfig;

  /**
   * Optional dropdown filters
   */
  dropdowns?: FilterDropdown[];

  /**
   * Actions that appear on the right side (e.g., "Add New" buttons)
   */
  filterActions?: React.ReactNode;

  /**
   * Optional CSS classes for the container
   */
  className?: string;
};

const DEFAULT_DROPDOWNS: FilterDropdown[] = [];

export function FilterBar({
  searchConfig,
  dropdowns = DEFAULT_DROPDOWNS,
  filterActions,
  className = '',
}: FilterBarProps) {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    searchConfig.onChange(e.target.value);
  };

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${className}`.trim()}>
      {/* Search and Dropdowns */}
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Search Input */}
        <div className="relative flex-1 sm:max-w-xs sm:flex-initial">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchConfig.placeholder}
            value={searchConfig.value}
            onChange={handleSearchChange}
            className="pl-9"
            aria-label={searchConfig.placeholder}
          />
        </div>

        {/* Dropdowns */}
        {dropdowns.map(dropdown => (
          <Select
            key={dropdown.id}
            value={dropdown.value}
            onValueChange={dropdown.onChange}
          >
            <SelectTrigger
              className={dropdown.width || 'w-full sm:w-40'}
              aria-label={dropdown.placeholder}
            >
              <SelectValue placeholder={dropdown.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {dropdown.options.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {/* Filter Actions */}
      {filterActions && (
        <div className="flex items-center gap-2">
          {filterActions}
        </div>
      )}
    </div>
  );
}
