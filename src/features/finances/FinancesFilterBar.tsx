'use client';

import type { TransactionStatus } from './FinancesTable';
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

export type FinancesFilters = {
  search: string;
  origin: string;
  status: string;
};

type FinancesFilterBarProps = {
  onFiltersChangeAction: (filters: FinancesFilters) => void;
  availableOrigins: string[];
  availableStatuses: TransactionStatus[];
};

const STATUS_OPTIONS: Array<{ value: string; labelKey: TransactionStatus }> = [
  { value: 'paid', labelKey: 'paid' },
  { value: 'pending', labelKey: 'pending' },
  { value: 'declined', labelKey: 'declined' },
  { value: 'refunded', labelKey: 'refunded' },
  { value: 'processing', labelKey: 'processing' },
];

export function FinancesFilterBar({
  onFiltersChangeAction,
  availableOrigins,
  availableStatuses,
}: FinancesFilterBarProps) {
  const t = useTranslations('TransactionsPage');
  const [filters, setFilters] = useState<FinancesFilters>({
    search: '',
    origin: 'all',
    status: 'all',
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...filters, search: e.target.value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const handleOriginChange = (value: string) => {
    const newFilters = { ...filters, origin: value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const handleStatusChange = (value: string) => {
    const newFilters = { ...filters, status: value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const originOptions = [
    { value: 'all', label: t('all_origins_filter') },
    ...availableOrigins.map(origin => ({
      value: origin,
      label: origin,
    })),
  ];

  const statusOptions = [
    { value: 'all', label: t('all_statuses_filter') },
    ...STATUS_OPTIONS
      .filter(option => availableStatuses.includes(option.labelKey))
      .map(option => ({
        value: option.value,
        label: t(`status_${option.labelKey}`),
      })),
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
          data-testid="finances-search-input"
        />
      </div>

      {/* Status Filter */}
      <Select value={filters.status} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-full sm:w-40" data-testid="finances-status-filter">
          <SelectValue placeholder={t('all_statuses_filter')} />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Origin Filter */}
      <Select value={filters.origin} onValueChange={handleOriginChange}>
        <SelectTrigger className="w-full sm:w-48" data-testid="finances-origin-filter">
          <SelectValue placeholder={t('all_origins_filter')} />
        </SelectTrigger>
        <SelectContent>
          {originOptions.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
