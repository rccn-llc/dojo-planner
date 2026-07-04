'use client';

import type { AvailableTag, MembershipFilters } from '@/features/memberships/MembershipFilterBar';
import type { MembershipPlanData } from '@/hooks/useMembershipPlansCache';
import type { MembershipCardProps, MembershipStatus } from '@/templates/MembershipCard';
import { useOrganization } from '@clerk/nextjs';
import { Plus, Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MembershipFilterBar } from '@/features/memberships/MembershipFilterBar';
import { MembershipTagsManagement } from '@/features/memberships/MembershipTagsManagement';
import { AddMembershipModal } from '@/features/memberships/wizard/AddMembershipModal';
import { useHasRole } from '@/hooks/useHasRole';
import { invalidateMembershipPlansCache, useMembershipPlansCache } from '@/hooks/useMembershipPlansCache';
import { MembershipCard } from '@/templates/MembershipCard';
import { StatsCards } from '@/templates/StatsCards';
import { ORG_ROLE } from '@/types/Auth';

type Membership = {
  id: string;
  name: string;
  category: string;
  program: string;
  status: MembershipStatus;
  isTrial?: boolean;
  isMonthly?: boolean;
  isPunchcard?: boolean;
  price: string;
  signupFee: string;
  frequency: string;
  contract: string;
  access: string;
  activeCount: number;
  revenue: string;
};

function formatPrice(plan: MembershipPlanData): string {
  if (plan.isTrial || plan.price === 0) {
    return 'Free';
  }
  const formatted = `$${plan.price.toFixed(2)}`;
  switch (plan.frequency) {
    case 'Monthly':
      return `${formatted}/mo`;
    case 'Weekly':
      return `${formatted}/wk`;
    case 'Semi-Annual':
      return `${formatted}/6mo`;
    case 'Annual':
    case 'Annually':
      return `${formatted}/yr`;
    default:
      // null (new convention) and legacy 'None' both render as a flat price.
      return formatted;
  }
}

function formatSignupFee(plan: MembershipPlanData): string {
  if (plan.signupFee === 0) {
    const isOneTime = plan.frequency == null || plan.frequency === 'None';
    return isOneTime ? 'One-time purchase' : 'No signup fee';
  }
  return `$${plan.signupFee.toFixed(0)} signup fee`;
}

function transformPlanToMembership(plan: MembershipPlanData): Membership {
  const isOneTime = plan.frequency == null || plan.frequency === 'None';
  const isPunchcard = isOneTime && !plan.isTrial;
  const isMonthly = plan.frequency === 'Monthly'
    || plan.frequency === 'Weekly'
    || plan.frequency === 'Semi-Annual'
    || plan.frequency === 'Annual'
    || plan.frequency === 'Annually';

  return {
    id: plan.id,
    name: plan.name,
    category: plan.category,
    program: plan.program,
    status: plan.isActive ? 'Active' : 'Inactive',
    isTrial: plan.isTrial ?? false,
    isMonthly: isMonthly && !plan.isTrial,
    isPunchcard,
    price: formatPrice(plan),
    signupFee: formatSignupFee(plan),
    frequency: plan.frequency ?? 'One-time',
    contract: plan.contractLength,
    access: plan.accessLevel,
    activeCount: 0,
    revenue: '$0/mo revenue',
  };
}

export default function MembershipsPage() {
  const t = useTranslations('MembershipsPage');
  const canEdit = useHasRole(ORG_ROLE.ACADEMY_OWNER);
  const router = useRouter();
  const { organization } = useOrganization();
  const { plans, loading } = useMembershipPlansCache(organization?.id);
  const [isTagsSheetOpen, setIsTagsSheetOpen] = useState(false);
  const [isAddMembershipModalOpen, setIsAddMembershipModalOpen] = useState(false);

  const memberships = useMemo(() => plans.map(transformPlanToMembership), [plans]);

  const [filters, setFilters] = useState<MembershipFilters>({
    search: '',
    tag: 'all',
    program: 'all',
  });

  const handleEditMembership = useCallback((id: string) => {
    router.push(`/dashboard/memberships/${id}`);
  }, [router]);

  const handleMembershipCreated = useCallback((_newMembership: MembershipCardProps) => {
    // Once the wizard persists to DB, invalidate the cache to refetch
    invalidateMembershipPlansCache();
  }, []);

  // Get unique programs from memberships
  const allPrograms = Array.from(
    new Set(memberships.map(m => m.program)),
  );

  const stats = useMemo(() => ({
    totalMemberships: memberships.length,
    active: memberships.filter(m => m.status === 'Active' && !m.isTrial).length,
    trialOptions: memberships.filter(m => m.isTrial).length,
    totalMembers: memberships.reduce((sum, m) => sum + m.activeCount, 0),
  }), [memberships]);

  // Helper function to get all tags for a membership
  const getMembershipTags = (membership: Membership): AvailableTag[] => {
    const tags: AvailableTag[] = [];
    if (membership.isTrial) {
      tags.push('Trial');
    }
    if (membership.status === 'Inactive') {
      tags.push('Inactive');
    }
    if (membership.status === 'Active' && !membership.isTrial) {
      tags.push('Active');
    }
    if (membership.isMonthly) {
      tags.push('Monthly');
    }
    if (membership.isPunchcard) {
      tags.push('Punchcard');
    }
    return tags;
  };

  // Helper function to check if membership matches tag filter
  const matchesTagFilter = (membership: Membership, tag: string): boolean => {
    if (tag === 'all') {
      return true;
    }
    if (tag === 'Trial') {
      return !!membership.isTrial;
    }
    if (tag === 'Active') {
      return membership.status === 'Active' && !membership.isTrial;
    }
    if (tag === 'Inactive') {
      return membership.status === 'Inactive';
    }
    if (tag === 'Monthly') {
      return !!membership.isMonthly;
    }
    if (tag === 'Punchcard') {
      return !!membership.isPunchcard;
    }
    return true;
  };

  // Helper function to check if membership matches search filter
  const matchesSearchFilter = (membership: Membership, search: string): boolean => {
    if (!search) {
      return true;
    }
    const searchLower = search.toLowerCase();
    return membership.name.toLowerCase().includes(searchLower)
      || membership.category.toLowerCase().includes(searchLower);
  };

  // Helper function to check if membership matches program filter
  const matchesProgramFilter = (membership: Membership, program: string): boolean => {
    return program === 'all' || membership.program === program;
  };

  const filteredMemberships = useMemo(() => {
    return memberships.filter((membership) => {
      const matchesSearch = matchesSearchFilter(membership, filters.search);
      const matchesTag = matchesTagFilter(membership, filters.tag);
      const matchesProgram = matchesProgramFilter(membership, filters.program);
      return matchesSearch && matchesTag && matchesProgram;
    });
  }, [filters, memberships]);

  // Compute available tags based on memberships that match current search and program filters
  const availableTags = useMemo((): AvailableTag[] => {
    const membershipsMatchingOtherFilters = memberships.filter((membership) => {
      const matchesSearch = matchesSearchFilter(membership, filters.search);
      const matchesProgram = matchesProgramFilter(membership, filters.program);
      return matchesSearch && matchesProgram;
    });

    const tagsInResults = new Set<AvailableTag>();
    membershipsMatchingOtherFilters.forEach((membership) => {
      getMembershipTags(membership).forEach(tag => tagsInResults.add(tag));
    });

    return Array.from(tagsInResults);
  }, [filters.search, filters.program, memberships]);

  // Compute available programs based on memberships that match current search and tag filters
  const availablePrograms = useMemo((): string[] => {
    const membershipsMatchingOtherFilters = memberships.filter((membership) => {
      const matchesSearch = matchesSearchFilter(membership, filters.search);
      const matchesTag = matchesTagFilter(membership, filters.tag);
      return matchesSearch && matchesTag;
    });

    const programsInResults = new Set<string>();
    membershipsMatchingOtherFilters.forEach((membership) => {
      programsInResults.add(membership.program);
    });

    return Array.from(programsInResults);
  }, [filters.search, filters.tag, memberships]);

  const statsData = useMemo(() => [
    { id: 'memberships', label: t('total_memberships_label'), value: stats.totalMemberships },
    { id: 'active', label: t('active_label'), value: stats.active },
    { id: 'trials', label: t('trial_options_label'), value: stats.trialOptions },
    { id: 'members', label: t('total_members_label'), value: stats.totalMembers },
  ], [stats, t]);

  // Only show the full-page skeleton on the INITIAL load (no data yet). On a
  // background revalidation (e.g. after creating a plan, which invalidates the
  // cache), keep the page — and any open modal — mounted so the Add Membership
  // wizard's success step isn't unmounted mid-flow and remounted at step 1.
  if (loading && plans.length === 0) {
    return (
      <div className="w-full space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
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
        {canEdit && (
          <Button variant="outline" onClick={() => setIsTagsSheetOpen(true)}>
            <Tags className="mr-1 size-4" />
            {t('manage_tags_button')}
          </Button>
        )}
      </div>

      {/* Filter Bar and Add Button */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {/* Filter Bar */}
          <div className="flex-1">
            <MembershipFilterBar
              onFiltersChangeAction={setFilters}
              programs={allPrograms}
              availableTags={availableTags}
              availablePrograms={availablePrograms}
            />
          </div>

          {/* Add New Membership Button */}
          {canEdit && (
            <Button onClick={() => setIsAddMembershipModalOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">{t('add_new_membership_button')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Memberships Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {filteredMemberships.length === 0
          ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">
                No memberships found
              </div>
            )
          : (
              filteredMemberships.map((membership) => {
                const cardProps: MembershipCardProps = {
                  id: membership.id,
                  name: membership.name,
                  category: membership.category,
                  status: membership.status,
                  isTrial: membership.isTrial,
                  isMonthly: membership.isMonthly,
                  isPunchcard: membership.isPunchcard,
                  price: membership.price,
                  signupFee: membership.signupFee,
                  frequency: membership.frequency,
                  contract: membership.contract,
                  access: membership.access,
                  activeCount: membership.activeCount,
                  revenue: membership.revenue,
                  onEdit: handleEditMembership,
                };

                return <MembershipCard key={membership.id} {...cardProps} />;
              })
            )}
      </div>

      {/* Membership Tags Management Sheet */}
      <MembershipTagsManagement
        open={isTagsSheetOpen}
        onOpenChange={setIsTagsSheetOpen}
      />

      {/* Add Membership Modal */}
      <AddMembershipModal
        isOpen={isAddMembershipModalOpen}
        onCloseAction={() => setIsAddMembershipModalOpen(false)}
        onMembershipCreated={handleMembershipCreated}
      />
    </div>
  );
}
