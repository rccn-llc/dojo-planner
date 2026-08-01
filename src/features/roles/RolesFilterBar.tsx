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

export type RolesFilters = {
  search: string;
  permission: string;
};

type RolesFilterBarProps = {
  onFiltersChangeAction: (filters: RolesFilters) => void;
  availablePermissions: string[];
};

export function RolesFilterBar({
  onFiltersChangeAction,
  availablePermissions,
}: RolesFilterBarProps) {
  const t = useTranslations('Roles');
  const [filters, setFilters] = useState<RolesFilters>({
    search: '',
    permission: 'all',
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...filters, search: e.target.value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const handlePermissionChange = (value: string) => {
    const newFilters = { ...filters, permission: value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const permissionOptions = [
    { value: 'all', label: t('all_permissions_filter') },
    ...availablePermissions.map(permission => ({
      value: permission,
      label: permission,
    })),
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      {/* Search Input */}
      <div className="relative flex-1 sm:max-w-xs sm:flex-initial">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('search_roles_placeholder')}
          value={filters.search}
          onChange={handleSearchChange}
          className="pl-9"
        />
      </div>

      {/* Permission Filter */}
      <Select value={filters.permission} onValueChange={handlePermissionChange}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={t('all_permissions_filter')} />
        </SelectTrigger>
        <SelectContent>
          {permissionOptions.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
