'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Input } from '@/components/ui/input/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select';

export type ProgramFilters = {
  search: string;
  status: string;
};

type ProgramFilterBarProps = {
  onFiltersChangeAction: (filters: ProgramFilters) => void;
};

export function ProgramFilterBar({ onFiltersChangeAction }: ProgramFilterBarProps) {
  const t = useTranslations('ProgramsPage');
  const [filters, setFilters] = useState<ProgramFilters>({
    search: '',
    status: 'all',
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...filters, search: e.target.value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const handleStatusChange = (value: string) => {
    const newFilters = { ...filters, status: value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const statuses = [
    { value: 'all', label: t('all_statuses_filter') },
    { value: 'Active', label: t('status_active') },
    { value: 'Inactive', label: t('status_inactive') },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      {/* Search Input */}
      <div className="relative flex-1 sm:max-w-xs sm:flex-initial">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('search_placeholder')}
          value={filters.search}
          onChange={handleSearchChange}
          className="pl-9"
        />
      </div>

      {/* Status Dropdown */}
      <Select value={filters.status} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder={t('all_statuses_filter')} />
        </SelectTrigger>
        <SelectContent>
          {statuses.map(status => (
            <SelectItem key={status.value} value={status.value}>
              {status.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
