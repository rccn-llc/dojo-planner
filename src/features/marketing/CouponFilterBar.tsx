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

export type CouponFilters = {
  search: string;
  status: string;
  type: string;
};

type CouponFilterBarProps = {
  onFiltersChangeAction: (filters: CouponFilters) => void;
  availableStatuses: string[];
  availableTypes: string[];
};

export function CouponFilterBar({
  onFiltersChangeAction,
  availableStatuses,
  availableTypes,
}: CouponFilterBarProps) {
  const t = useTranslations('MarketingPage');
  const [filters, setFilters] = useState<CouponFilters>({
    search: '',
    status: 'all',
    type: 'all',
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

  const handleTypeChange = (value: string) => {
    const newFilters = { ...filters, type: value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  // Build status options dynamically from available data
  const statusOptions = [
    { value: 'all', label: t('status_filter') },
    ...availableStatuses.map(status => ({
      value: status,
      label: status,
    })),
  ];

  // Build type options dynamically from available data
  const typeOptions = [
    { value: 'all', label: t('type_filter') },
    ...availableTypes.map(type => ({
      value: type,
      label: type,
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
          data-testid="coupon-search-input"
        />
      </div>

      {/* Status Filter */}
      <Select value={filters.status} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-full sm:w-40" data-testid="coupon-status-filter">
          <SelectValue placeholder={t('status_filter')} />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Type Filter */}
      <Select value={filters.type} onValueChange={handleTypeChange}>
        <SelectTrigger className="w-full sm:w-44" data-testid="coupon-type-filter">
          <SelectValue placeholder={t('type_filter')} />
        </SelectTrigger>
        <SelectContent>
          {typeOptions.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
