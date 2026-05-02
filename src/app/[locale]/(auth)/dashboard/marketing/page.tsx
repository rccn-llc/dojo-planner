'use client';

import type { Coupon, CouponFilters, CouponFormData } from '@/features/marketing';
import { useOrganization } from '@clerk/nextjs';
import { ArrowDownAZ, ArrowUpZA, Edit, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination/Pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { AddEditCouponModal, CouponCard, CouponFilterBar, DeleteCouponAlertDialog, transformCouponsToUi, transformUiCouponFormToDb } from '@/features/marketing';
import { invalidateCouponsCache, useCouponsCache } from '@/hooks/useCouponsCache';
import { client } from '@/libs/Orpc';
import { StatsCards } from '@/templates/StatsCards';

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'Active':
      return 'outline';
    case 'Expired':
      return 'destructive';
    case 'Inactive':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getUsagePercentage(usage: string): number {
  const parts = usage.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return 0;
  }

  const used = Number.parseFloat(parts[0]);
  const limit = parts[1];

  if (limit === '\u221E') {
    return 100;
  }

  const limitNum = Number.parseFloat(limit);
  if (Number.isNaN(used) || Number.isNaN(limitNum) || limitNum === 0) {
    return 0;
  }

  return Math.min((used / limitNum) * 100, 100);
}

function formatDateTime(dateTime: string): string {
  if (!dateTime) {
    return 'No Expiry';
  }

  try {
    // Return in format YYYY-MM-DD hh:mm:ss
    const date = new Date(dateTime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return dateTime;
  }
}

function getTypeAbbreviation(type: string): string {
  switch (type) {
    case 'Percentage':
      return 'PCT';
    case 'Fixed Amount':
      return 'FXD';
    case 'Free Trial':
      return 'TRY';
    default:
      return type;
  }
}

function canDeleteCoupon(usage: string): boolean {
  const parts = usage.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return true;
  }

  const used = Number.parseFloat(parts[0]);
  const limit = parts[1];

  // Allow delete if usage is 0
  if (used === 0) {
    return true;
  }

  // Allow delete if unlimited usage (infinity symbol)
  if (limit === '\u221E') {
    return false;
  }

  const limitNum = Number.parseFloat(limit);
  if (Number.isNaN(used) || Number.isNaN(limitNum) || limitNum === 0) {
    return true;
  }

  // Allow delete if usage is at 100%
  const percentage = (used / limitNum) * 100;
  return percentage >= 100;
}

type SortField = 'code' | 'type' | 'amount' | 'applyTo' | 'usage' | 'endDateTime' | 'status';
type SortDirection = 'asc' | 'desc';

export default function MarketingPage() {
  const t = useTranslations('MarketingPage');
  const { organization } = useOrganization();
  const { coupons: rawCoupons, loading } = useCouponsCache(organization?.id);

  // Transform database coupons to UI format
  const coupons = useMemo(() => transformCouponsToUi(rawCoupons), [rawCoupons]);

  const [currentPage, setCurrentPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<CouponFilters>({
    search: '',
    status: 'all',
    type: 'all',
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<{ id: string; code: string } | null>(null);
  const ROWS_PER_PAGE = 10;

  const handleFiltersChange = (newFilters: CouponFilters) => {
    setFilters(newFilters);
    setCurrentPage(0);
  };

  // Compute available values from actual coupon data
  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>();
    coupons.forEach((coupon) => {
      if (coupon.status) {
        statuses.add(coupon.status);
      }
    });
    return Array.from(statuses).sort();
  }, [coupons]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    coupons.forEach((coupon) => {
      if (coupon.type) {
        types.add(coupon.type);
      }
    });
    return Array.from(types).sort();
  }, [coupons]);

  // Filter coupons
  const filteredCoupons = useMemo(() => coupons.filter((coupon) => {
    const searchLower = filters.search.toLowerCase();
    const matchesSearch = filters.search === ''
      || coupon.code.toLowerCase().includes(searchLower)
      || coupon.description.toLowerCase().includes(searchLower);

    const matchesStatus = filters.status === 'all' || coupon.status === filters.status;
    const matchesType = filters.type === 'all' || coupon.type === filters.type;

    return matchesSearch && matchesStatus && matchesType;
  }), [coupons, filters]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(0);
  };

  const sortedCoupons = [...filteredCoupons].sort((a, b) => {
    let aValue: string | number;
    let bValue: string | number;

    switch (sortField) {
      case 'code':
        aValue = a.code.toLowerCase();
        bValue = b.code.toLowerCase();
        break;
      case 'type':
        aValue = a.type.toLowerCase();
        bValue = b.type.toLowerCase();
        break;
      case 'amount':
        aValue = a.amount.toLowerCase();
        bValue = b.amount.toLowerCase();
        break;
      case 'applyTo':
        aValue = a.applyTo.toLowerCase();
        bValue = b.applyTo.toLowerCase();
        break;
      case 'usage':
        aValue = a.usage.toLowerCase();
        bValue = b.usage.toLowerCase();
        break;
      case 'endDateTime':
        aValue = a.endDateTime.toLowerCase();
        bValue = b.endDateTime.toLowerCase();
        break;
      case 'status':
        aValue = a.status.toLowerCase();
        bValue = b.status.toLowerCase();
        break;
      default:
        aValue = '';
        bValue = '';
    }

    if (aValue < bValue) {
      return sortDirection === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortDirection === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const totalPages = Math.ceil(sortedCoupons.length / ROWS_PER_PAGE);
  const paginatedCoupons = sortedCoupons.slice(
    currentPage * ROWS_PER_PAGE,
    (currentPage + 1) * ROWS_PER_PAGE,
  );

  // Calculate total usage from all coupons
  const totalUsage = useMemo(() => {
    let total = 0;
    coupons.forEach((coupon) => {
      const parts = coupon.usage.split('/');
      if (parts.length === 2 && parts[0]) {
        const used = Number.parseFloat(parts[0]);
        if (!Number.isNaN(used)) {
          total += used;
        }
      }
    });
    return total;
  }, [coupons]);

  // Stats data
  const stats = useMemo(() => ({
    totalCoupons: coupons.length,
    activeCoupons: coupons.filter(c => c.status === 'Active').length,
    totalSavings: 'N/A', // Would need transaction data to calculate
    timesUsed: totalUsage,
  }), [coupons, totalUsage]);

  const statsData = useMemo(() => [
    { id: 'total', label: t('total_coupons_label'), value: stats.totalCoupons },
    { id: 'active', label: t('active_label'), value: stats.activeCoupons },
    { id: 'savings', label: t('total_savings_label'), value: stats.totalSavings },
    { id: 'used', label: t('times_used_label'), value: stats.timesUsed },
  ], [stats, t]);

  const handleOpenAddModal = () => {
    setEditingCoupon(null);
    setIsModalOpen(true);
  };

  const handleEditCoupon = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setIsModalOpen(true);
  };

  const handleDeleteCoupon = useCallback((couponId: string) => {
    const coupon = coupons.find(c => c.id === couponId);
    if (coupon) {
      setDeletingCoupon({ id: coupon.id, code: coupon.code });
    }
  }, [coupons]);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeletingCoupon(null);
    setDeleteError(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingCoupon) {
      return;
    }
    setDeleteError(null);
    try {
      await client.coupons.remove({ id: deletingCoupon.id });
      await invalidateCouponsCache();
      setDeletingCoupon(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete coupon.';
      setDeleteError(message);
    }
  }, [deletingCoupon]);

  const handleSaveCoupon = useCallback(async (couponData: CouponFormData, isEdit: boolean): Promise<void> => {
    const payload = transformUiCouponFormToDb(couponData);
    if (isEdit && editingCoupon?.id) {
      await client.coupons.update({ id: editingCoupon.id, ...payload });
    } else {
      await client.coupons.create(payload);
    }
    await invalidateCouponsCache();
  }, [editingCoupon]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCoupon(null);
  };

  // Loading state
  if (loading) {
    return (
      <div className="w-full space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Summary Cards */}
      <StatsCards stats={statsData} columns={4} />

      {/* Header */}
      <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>

      {/* Search, Filter Bar, and Add Button */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex-1">
            <CouponFilterBar
              onFiltersChangeAction={handleFiltersChange}
              availableStatuses={availableStatuses}
              availableTypes={availableTypes}
            />
          </div>
          <Button onClick={handleOpenAddModal}>
            <Plus className="mr-2 h-4 w-4" />
            {t('add_new_coupon_button')}
          </Button>
        </div>

        {/* Coupons Table - Desktop View */}
        <div className="hidden rounded-lg border border-border bg-background lg:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    <button
                      type="button"
                      onClick={() => handleSort('code')}
                      className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                    >
                      {t('table_code')}
                      {sortField === 'code' && (
                        sortDirection === 'asc'
                          ? <ArrowDownAZ className="h-4 w-4" />
                          : <ArrowUpZA className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    <button
                      type="button"
                      onClick={() => handleSort('type')}
                      className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                    >
                      {t('table_type')}
                      {sortField === 'type' && (
                        sortDirection === 'asc'
                          ? <ArrowDownAZ className="h-4 w-4" />
                          : <ArrowUpZA className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    <button
                      type="button"
                      onClick={() => handleSort('amount')}
                      className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                    >
                      {t('table_amount')}
                      {sortField === 'amount' && (
                        sortDirection === 'asc'
                          ? <ArrowDownAZ className="h-4 w-4" />
                          : <ArrowUpZA className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    <button
                      type="button"
                      onClick={() => handleSort('applyTo')}
                      className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                    >
                      {t('table_apply_to')}
                      {sortField === 'applyTo' && (
                        sortDirection === 'asc'
                          ? <ArrowDownAZ className="h-4 w-4" />
                          : <ArrowUpZA className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    <button
                      type="button"
                      onClick={() => handleSort('usage')}
                      className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                    >
                      {t('table_usage_limit')}
                      {sortField === 'usage' && (
                        sortDirection === 'asc'
                          ? <ArrowDownAZ className="h-4 w-4" />
                          : <ArrowUpZA className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    <button
                      type="button"
                      onClick={() => handleSort('endDateTime')}
                      className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                    >
                      {t('table_effective')}
                      {sortField === 'endDateTime' && (
                        sortDirection === 'asc'
                          ? <ArrowDownAZ className="h-4 w-4" />
                          : <ArrowUpZA className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                    <button
                      type="button"
                      onClick={() => handleSort('status')}
                      className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                    >
                      {t('table_status')}
                      {sortField === 'status' && (
                        sortDirection === 'asc'
                          ? <ArrowDownAZ className="h-4 w-4" />
                          : <ArrowUpZA className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t('table_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCoupons.map(coupon => (
                  <tr key={coupon.id} className="border-b border-border hover:bg-secondary/30">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{coupon.code}</p>
                        <p className="text-xs text-muted-foreground">{coupon.description}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">{getTypeAbbreviation(coupon.type)}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{coupon.amount}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{coupon.applyTo}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground">{coupon.usage}</span>
                        <div className="relative h-1 w-16 rounded-full bg-muted">
                          <div
                            className="h-1 rounded-full bg-blue-500"
                            style={{ width: `${getUsagePercentage(coupon.usage)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-foreground">{formatDateTime(coupon.startDateTime)}</span>
                        <span className="text-sm text-muted-foreground">{formatDateTime(coupon.endDateTime)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        getStatusVariant(coupon.status) === 'outline'
                          ? 'border border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                          : getStatusVariant(coupon.status) === 'destructive'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-secondary text-secondary-foreground'
                      }`}
                      >
                        {coupon.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditCoupon(coupon)}
                          aria-label={`Edit ${coupon.code}`}
                          title={`Edit ${coupon.code}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {canDeleteCoupon(coupon.usage) && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteCoupon(coupon.id)}
                            aria-label={`Delete ${coupon.code}`}
                            title={`Delete ${coupon.code}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coupons Cards - Mobile View */}
        <div className="space-y-4 lg:hidden">
          {paginatedCoupons.map(coupon => (
            <CouponCard
              key={coupon.id}
              coupon={coupon}
              onEdit={handleEditCoupon}
              onDelete={handleDeleteCoupon}
            />
          ))}
        </div>

        {/* Pagination */}
        {sortedCoupons.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedCoupons.length}
            itemsPerPage={ROWS_PER_PAGE}
            onPageChangeAction={setCurrentPage}
          />
        )}
      </div>

      {/* Add/Edit Modal */}
      <AddEditCouponModal
        isOpen={isModalOpen}
        onCloseAction={handleCloseModal}
        coupon={editingCoupon}
        onSaveAction={handleSaveCoupon}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteCouponAlertDialog
        isOpen={!!deletingCoupon}
        couponCode={deletingCoupon?.code ?? ''}
        onCloseAction={handleCloseDeleteDialog}
        onConfirmAction={handleConfirmDelete}
        errorMessage={deleteError}
      />
    </div>
  );
}
