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

export type MemberFilters = {
  search: string;
  status: string;
  membershipType: string;
};

type MemberFilterBarProps = {
  onFiltersChangeAction: (filters: MemberFilters) => void;
  availableStatuses: string[];
  availableMembershipTypes: string[];
};

export function MemberFilterBar({
  onFiltersChangeAction,
  availableStatuses,
  availableMembershipTypes,
}: MemberFilterBarProps) {
  const t = useTranslations('Members');
  const [filters, setFilters] = useState<MemberFilters>({
    search: '',
    status: 'all',
    membershipType: 'all',
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

  const handleMembershipTypeChange = (value: string) => {
    const newFilters = { ...filters, membershipType: value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  // Map status values to i18n labels
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'active':
        return t('status_active');
      case 'hold':
        return t('status_hold');
      case 'trial':
        return t('status_trial');
      case 'cancelled':
        return t('status_cancelled');
      case 'past_due':
        return t('status_past_due');
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  // Map member type values to i18n labels
  const getMembershipTypeLabel = (memberType: string): string => {
    switch (memberType) {
      case 'individual':
        return t('member_type_individual');
      case 'head-of-household':
        return t('member_type_head_of_household');
      case 'family-member':
        return t('member_type_family_member');
      default:
        return memberType.charAt(0).toUpperCase() + memberType.slice(1).replace(/[-_]/g, ' ');
    }
  };

  // Build status options dynamically from available data
  const statusOptions = [
    { value: 'all', label: t('all_statuses_filter') },
    ...availableStatuses.map(status => ({
      value: status,
      label: getStatusLabel(status),
    })),
  ];

  // Build membership type options dynamically from available data
  const membershipTypeOptions = [
    { value: 'all', label: t('all_membership_types_filter') },
    ...availableMembershipTypes.map(type => ({
      value: type,
      label: getMembershipTypeLabel(type),
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
        />
      </div>

      {/* Status Filter */}
      <Select value={filters.status} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-full sm:w-40">
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

      {/* Membership Type Filter */}
      <Select value={filters.membershipType} onValueChange={handleMembershipTypeChange}>
        <SelectTrigger className="w-full sm:w-52">
          <SelectValue placeholder={t('all_membership_types_filter')} />
        </SelectTrigger>
        <SelectContent>
          {membershipTypeOptions.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
