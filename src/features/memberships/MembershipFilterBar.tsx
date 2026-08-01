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

export type MembershipFilters = {
  search: string;
  tag: string;
  program: string;
};

export type AvailableTag = 'Active' | 'Trial' | 'Inactive' | 'Monthly' | 'Punchcard';

type MembershipFilterBarProps = {
  onFiltersChangeAction: (filters: MembershipFilters) => void;
  programs: string[];
  availableTags?: AvailableTag[];
  availablePrograms?: string[];
};

export function MembershipFilterBar({
  onFiltersChangeAction,
  programs,
  availableTags,
  availablePrograms,
}: MembershipFilterBarProps) {
  const t = useTranslations('MembershipsPage');
  const [filters, setFilters] = useState<MembershipFilters>({
    search: '',
    tag: 'all',
    program: 'all',
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...filters, search: e.target.value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const handleTagChange = (value: string) => {
    const newFilters = { ...filters, tag: value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const handleProgramChange = (value: string) => {
    const newFilters = { ...filters, program: value };
    setFilters(newFilters);
    onFiltersChangeAction(newFilters);
  };

  const allTags: Array<{ value: string; label: string }> = [
    { value: 'all', label: t('all_tags_filter') },
    { value: 'Active', label: t('tag_active') },
    { value: 'Trial', label: t('tag_trial') },
    { value: 'Inactive', label: t('tag_inactive') },
    { value: 'Monthly', label: t('tag_monthly') },
    { value: 'Punchcard', label: t('tag_punchcard') },
  ];

  // Filter tags based on availableTags prop (if provided)
  const tags = availableTags
    ? allTags.filter(tag => tag.value === 'all' || availableTags.includes(tag.value as AvailableTag))
    : allTags;

  const programLabels: Record<string, string> = {
    Adult: t('program_adult'),
    Kids: t('program_kids'),
    Women: t('program_women'),
    Competition: t('program_competition'),
  };

  // Filter programs based on availablePrograms prop (if provided)
  const filteredPrograms = availablePrograms || programs;

  const programOptions = [
    { value: 'all', label: t('all_programs_filter') },
    ...filteredPrograms.map(program => ({
      value: program,
      label: programLabels[program] || program,
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

      {/* Tags Dropdown */}
      <Select value={filters.tag} onValueChange={handleTagChange}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder={t('all_tags_filter')} />
        </SelectTrigger>
        <SelectContent>
          {tags.map(tag => (
            <SelectItem key={tag.value} value={tag.value}>
              {tag.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Programs Dropdown */}
      <Select value={filters.program} onValueChange={handleProgramChange}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder={t('all_programs_filter')} />
        </SelectTrigger>
        <SelectContent>
          {programOptions.map(program => (
            <SelectItem key={program.value} value={program.value}>
              {program.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
