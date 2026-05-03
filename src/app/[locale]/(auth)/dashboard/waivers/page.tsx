'use client';

import type { WaiverTemplateWithStats } from '@/services/WaiversService';
import type { WaiverCardProps, WaiverStatus } from '@/templates/WaiverCard';
import { format } from 'date-fns';
import { Braces, Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AddWaiverModal } from '@/features/waivers/AddWaiverModal';
import { MergeFieldsManagement } from '@/features/waivers/MergeFieldsManagement';
import { client } from '@/libs/Orpc';
import { StatsCards } from '@/templates/StatsCards';
import { WaiverCard } from '@/templates/WaiverCard';

export default function WaiversPage() {
  const t = useTranslations('WaiversPage');
  const router = useRouter();
  const [waivers, setWaivers] = useState<WaiverTemplateWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isMergeFieldsSheetOpen, setIsMergeFieldsSheetOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<{ signedThisMonth: number; membershipsUsing: number }>({
    signedThisMonth: 0,
    membershipsUsing: 0,
  });

  useEffect(() => {
    const fetchWaivers = async () => {
      try {
        setIsLoading(true);
        const result = await client.waivers.listTemplates();
        setWaivers(result.templates);
      } catch (err) {
        console.error('Failed to fetch waivers:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWaivers();
  }, []);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const result = await client.waivers.getDashboardStats();
        setDashboardStats({
          signedThisMonth: result.signedThisMonth,
          membershipsUsing: result.membershipsUsing,
        });
      } catch (err) {
        // Stats are non-critical — leave defaults of 0 if the call fails.
        console.warn('[WaiversPage] Failed to fetch dashboard stats:', err);
      }
    };

    fetchDashboardStats();
  }, []);

  const handleEditWaiver = useCallback((id: string) => {
    router.push(`/dashboard/waivers/${id}`);
  }, [router]);

  const handleAddWaiver = useCallback(() => {
    setIsAddModalOpen(true);
  }, []);

  const handleSaveNewWaiver = useCallback(async (data: {
    name: string;
    content: string;
    description: string | null;
    isActive: boolean;
    isDefault: boolean;
    requiresGuardian: boolean;
    guardianAgeThreshold: number;
  }) => {
    const result = await client.waivers.createTemplate({
      name: data.name,
      content: data.content,
      description: data.description ?? undefined,
      isActive: data.isActive,
      isDefault: data.isDefault,
      requiresGuardian: data.requiresGuardian,
      guardianAgeThreshold: data.guardianAgeThreshold,
    });
    setWaivers(prev => [{ ...result.template, signedCount: 0, membershipCount: 0 }, ...prev]);
    setIsAddModalOpen(false);
  }, []);

  // Compute stats. signedThisMonth + membershipsUsing come from the
  // server-side dashboard-stats endpoint; the totals + active counts are
  // derived from the in-memory list.
  const stats = useMemo(() => ({
    totalWaivers: waivers.length,
    active: waivers.filter(w => w.isActive).length,
    signedThisMonth: dashboardStats.signedThisMonth,
    membershipsUsing: dashboardStats.membershipsUsing,
  }), [waivers, dashboardStats]);

  const hasActiveWaivers = stats.active > 0;
  const hasInactiveWaivers = stats.totalWaivers - stats.active > 0;
  // Only render the filter when both statuses are present — otherwise the
  // dropdown would be a no-op (one status + 'all' both show the same list).
  const showStatusFilter = hasActiveWaivers && hasInactiveWaivers;

  // If the selected filter is no longer applicable to the current waiver set
  // (e.g. user picked 'inactive' then deleted the only inactive waiver), treat
  // the filter as 'all' for filtering purposes without resetting state.
  const effectiveStatusFilter: 'all' | 'active' | 'inactive'
    = (statusFilter === 'active' && !hasActiveWaivers)
      || (statusFilter === 'inactive' && !hasInactiveWaivers)
      ? 'all'
      : statusFilter;

  // Filter waivers by search query and active/inactive status. Both filters
  // AND together; an empty search and 'all' status returns the whole list.
  const filteredWaivers = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return waivers.filter((waiver) => {
      if (effectiveStatusFilter === 'active' && !waiver.isActive) {
        return false;
      }
      if (effectiveStatusFilter === 'inactive' && waiver.isActive) {
        return false;
      }
      if (!searchLower) {
        return true;
      }
      return (
        waiver.name.toLowerCase().includes(searchLower)
        || (waiver.description?.toLowerCase().includes(searchLower) ?? false)
      );
    });
  }, [waivers, search, effectiveStatusFilter]);

  const hasActiveFilters = search.trim().length > 0 || effectiveStatusFilter !== 'all';

  const statsData = useMemo(() => [
    { id: 'total', label: t('total_waivers_label'), value: stats.totalWaivers },
    { id: 'active', label: t('active_label'), value: stats.active },
    { id: 'signed', label: t('signed_this_month_label'), value: stats.signedThisMonth },
    { id: 'memberships', label: t('memberships_using_label'), value: stats.membershipsUsing },
  ], [stats, t]);

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={`stat-${String(i)}`} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-10 w-48" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={`card-${String(i)}`} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Summary Cards */}
      <StatsCards stats={statsData} columns={4} />

      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        <Button variant="outline" onClick={() => setIsMergeFieldsSheetOpen(true)}>
          <Braces className="mr-1 size-4" />
          {t('manage_fields_button')}
        </Button>
      </div>

      {/* Search Bar, Status Filter, and Add Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-50 flex-1 sm:max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('search_placeholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {showStatusFilter && (
            <Select
              value={statusFilter}
              onValueChange={value => setStatusFilter(value as 'all' | 'active' | 'inactive')}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label={t('filter_status_label')}>
                <SelectValue placeholder={t('filter_status_label')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filter_status_all')}</SelectItem>
                <SelectItem value="active">{t('filter_status_active')}</SelectItem>
                <SelectItem value="inactive">{t('filter_status_inactive')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Add New Waiver Button */}
        <Button onClick={handleAddWaiver}>
          <Plus className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">{t('add_new_waiver_button')}</span>
        </Button>
      </div>

      {/* Waivers Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {filteredWaivers.length === 0
          ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">
                {hasActiveFilters
                  ? t('no_results_found')
                  : t('no_waivers_found')}
              </div>
            )
          : (
              filteredWaivers.map((waiver) => {
                const status: WaiverStatus = waiver.isActive ? 'Active' : 'Inactive';
                const cardProps: WaiverCardProps = {
                  id: waiver.id,
                  name: waiver.name,
                  description: waiver.description,
                  status,
                  version: waiver.version,
                  isDefault: waiver.isDefault ?? false,
                  requiresGuardian: waiver.requiresGuardian ?? true,
                  guardianAgeThreshold: waiver.guardianAgeThreshold ?? 16,
                  signedCount: waiver.signedCount,
                  membershipCount: waiver.membershipCount,
                  lastUpdated: format(waiver.updatedAt, 'MMM d, yyyy'),
                  onEdit: handleEditWaiver,
                };

                return <WaiverCard key={waiver.id} {...cardProps} />;
              })
            )}
      </div>

      {/* Add Waiver Modal */}
      <AddWaiverModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveNewWaiver}
      />

      {/* Merge Fields Management Sheet */}
      <MergeFieldsManagement
        open={isMergeFieldsSheetOpen}
        onOpenChange={setIsMergeFieldsSheetOpen}
      />
    </div>
  );
}
