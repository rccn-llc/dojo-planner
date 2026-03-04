'use client';

import { useOrganization } from '@clerk/nextjs';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { transformCouponsToUi } from '@/features/marketing';
import { useCouponsCache } from '@/hooks/useCouponsCache';
import { invalidateMembersCache, useMembersCache } from '@/hooks/useMembersCache';
import { MembersTable } from './MembersTable';
import { AddMemberModal } from './wizard/AddMemberModal';

export function CustomMembersPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const t = useTranslations('Members');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization } = useOrganization();

  // Read initial page from URL search params
  const initialPage = useMemo(() => {
    const pageParam = searchParams.get('page');
    const parsed = pageParam ? Number.parseInt(pageParam, 10) : 0;
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }, [searchParams]);

  // Use intelligent caching hooks with organization ID for proper cache invalidation
  const { members, loading } = useMembersCache(organization?.id);
  const { coupons: rawCoupons } = useCouponsCache(organization?.id);

  // Transform coupons to UI format
  const coupons = useMemo(() => transformCouponsToUi(rawCoupons), [rawCoupons]);

  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);

  const handlePageChange = useCallback((page: number) => {
    const newParams = new URLSearchParams(searchParams.toString());
    if (page === 0) {
      newParams.delete('page');
    } else {
      newParams.set('page', String(page));
    }
    const qs = newParams.toString();
    router.replace(`/${locale}/dashboard/members${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [locale, router, searchParams]);

  const handleRowClick = useCallback((memberId: string) => {
    router.push(`/${locale}/dashboard/members/${memberId}/edit`);
  }, [locale, router]);

  const handleAddMemberModalClose = useCallback(async () => {
    setIsAddMemberModalOpen(false);
    // Invalidate cache when modal closes (member was likely added)
    await invalidateMembersCache();
  }, []);

  // Render the table with intelligent caching
  // Shows loading state while data is being fetched from cache
  return (
    <>
      <MembersTable
        members={members}
        onRowClickAction={handleRowClick}
        loading={loading}
        initialPage={initialPage}
        onPageChangeAction={handlePageChange}
        headerActions={(
          <Button onClick={() => setIsAddMemberModalOpen(true)}>
            <Plus className="mr-0.5 h-4 w-4" />
            {t('add_member_button')}
          </Button>
        )}
      />

      <AddMemberModal
        isOpen={isAddMemberModalOpen}
        onCloseAction={handleAddMemberModalClose}
        availableCoupons={coupons}
      />
    </>
  );
}
