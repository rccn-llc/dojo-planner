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

export type StaffFilters = {
  search: string;
  role: string;
};

type StaffFilterBarProps = {
  onFiltersChangeAction: (filters: StaffFilters) => void;
  availableRoles: string[];
};

export function StaffFilterBar({
  onFiltersChangeAction,
  availableRoles,
}: StaffFilterBarProps) {
  const t = useTranslations('Staff');
  const [filters, setFilters] = useState<StaffFilters>({
    search: '',
    role: 'all',
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...filters, search: e.target.value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const handleRoleChange = (value: string) => {
    const newFilters = { ...filters, role: value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  // Map role values to display labels
  const getRoleLabel = (role: string): string => {
    // Remove the org: prefix for display and format nicely
    const roleKey = role.replace('org:', '');
    return roleKey
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Build role options dynamically from available data
  const roleOptions = [
    { value: 'all', label: t('all_roles_filter') },
    ...availableRoles.map(role => ({
      value: role,
      label: getRoleLabel(role),
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
          data-testid="staff-search-input"
        />
      </div>

      {/* Role Filter */}
      <Select value={filters.role} onValueChange={handleRoleChange}>
        <SelectTrigger className="w-full sm:w-48" data-testid="staff-role-filter">
          <SelectValue placeholder={t('all_roles_filter')} />
        </SelectTrigger>
        <SelectContent>
          {roleOptions.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
