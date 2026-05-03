'use client';

import type {
  AutoRenewalOption,
  ChargeSignUpFeeOption,
  ContractLength,
  MembershipStatus,
  MembershipType,
  PaymentFrequency,
} from '@/hooks/useAddMembershipWizard';
import type { MembershipPlanData } from '@/hooks/useMembershipPlansCache';
import { useOrganization } from '@clerk/nextjs';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DeleteMembershipAlertDialog } from '@/features/memberships/details/DeleteMembershipAlertDialog';
import { EditAssociatedProgramModal } from '@/features/memberships/details/EditAssociatedProgramModal';
import { EditContractTermsModal } from '@/features/memberships/details/EditContractTermsModal';
import { EditMembershipBasicsModal } from '@/features/memberships/details/EditMembershipBasicsModal';
import { EditPaymentDetailsModal } from '@/features/memberships/details/EditPaymentDetailsModal';
import { MembershipAssociatedProgramCard } from '@/features/memberships/details/MembershipAssociatedProgramCard';
import { MembershipBasicsCard } from '@/features/memberships/details/MembershipBasicsCard';
import { MembershipContractTermsCard } from '@/features/memberships/details/MembershipContractTermsCard';
import { MembershipPaymentDetailsCard } from '@/features/memberships/details/MembershipPaymentDetailsCard';
import { MembershipStatsCard } from '@/features/memberships/details/MembershipStatsCard';
import { transformDetailDataToDb } from '@/features/memberships/membershipPlanTransformers';
import { useHasRole } from '@/hooks/useHasRole';
import { invalidateMembershipPlansCache, useMembershipPlansCache } from '@/hooks/useMembershipPlansCache';
import { client } from '@/libs/Orpc';
import { ORG_ROLE } from '@/types/Auth';

// Membership data type matching the wizard data structure
export type MembershipDetailData = {
  id: string;
  // Basics
  membershipName: string;
  status: MembershipStatus;
  membershipType: MembershipType;
  description: string;
  category: string;
  // Associated Program
  associatedProgramId: string | null;
  associatedProgramName: string | null;
  // Associated Waiver
  associatedWaiverId: string | null;
  associatedWaiverName: string | null;
  // Payment Details
  signUpFee: number | null;
  chargeSignUpFee: ChargeSignUpFeeOption;
  monthlyFee: number | null;
  paymentFrequency: PaymentFrequency;
  proRateFirstPayment: boolean;
  // Contract Terms
  contractLength: ContractLength;
  autoRenewal: AutoRenewalOption;
  cancellationFee: number | null;
  holdLimitPerYear: number | null;
  // Stats (read-only)
  activeCount: number;
  revenue: string;
};

function mapFrequency(frequency: string): PaymentFrequency {
  switch (frequency.toLowerCase()) {
    case 'monthly':
      return 'monthly';
    case 'weekly':
      return 'weekly';
    case 'annual':
    case 'annually':
      return 'annually';
    default:
      return 'monthly';
  }
}

function mapContractLength(contractLength: string): ContractLength {
  switch (contractLength.toLowerCase()) {
    case '12 months':
      return '12-months';
    case '6 months':
      return '6-months';
    case '3 months':
      return '3-months';
    case 'month-to-month':
      return 'month-to-month';
    default:
      return 'month-to-month';
  }
}

function mapMembershipType(plan: MembershipPlanData): MembershipType {
  if (plan.isTrial) {
    return 'trial';
  }
  if (plan.frequency === 'None' && !plan.isTrial) {
    return 'punchcard';
  }
  return 'standard';
}

function transformPlanToDetailData(plan: MembershipPlanData): MembershipDetailData {
  return {
    id: plan.id,
    membershipName: plan.name,
    status: plan.isActive ? 'active' : 'inactive',
    membershipType: mapMembershipType(plan),
    description: plan.description ?? '',
    category: plan.category,
    associatedProgramId: null,
    associatedProgramName: plan.category,
    associatedWaiverId: null,
    associatedWaiverName: null,
    signUpFee: plan.signupFee === 0 ? null : plan.signupFee,
    chargeSignUpFee: 'at-registration',
    monthlyFee: plan.price === 0 ? null : plan.price,
    paymentFrequency: mapFrequency(plan.frequency),
    proRateFirstPayment: false,
    contractLength: mapContractLength(plan.contractLength),
    autoRenewal: 'none',
    cancellationFee: null,
    holdLimitPerYear: null,
    activeCount: 0,
    revenue: '$0/mo revenue',
  };
}

type PageParams = {
  membershipId: string;
};

export default function MembershipDetailPage({ params }: { params: Promise<PageParams> }) {
  const resolvedParams = use(params);
  const t = useTranslations('MembershipDetailPage');
  const canEdit = useHasRole(ORG_ROLE.ACADEMY_OWNER);
  const router = useRouter();
  const { organization } = useOrganization();
  const { plans, loading } = useMembershipPlansCache(organization?.id);

  // Modal states
  const [isEditBasicsOpen, setIsEditBasicsOpen] = useState(false);
  const [isEditAssociatedProgramOpen, setIsEditAssociatedProgramOpen] = useState(false);
  const [isEditPaymentOpen, setIsEditPaymentOpen] = useState(false);
  const [isEditContractOpen, setIsEditContractOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Find plan from cache and transform
  const initialMembershipData = useMemo(() => {
    const raw = plans.find(p => p.id === resolvedParams.membershipId);
    return raw ? transformPlanToDetailData(raw) : null;
  }, [plans, resolvedParams.membershipId]);

  // Local overrides (from edit modals)
  const [localOverrides, setLocalOverrides] = useState<Partial<MembershipDetailData>>({});

  // Waiver data fetched from DB
  const [waiverData, setWaiverData] = useState<{ id: string; name: string } | null>(null);

  // Fetch waiver associations from DB
  const planId = initialMembershipData?.id;
  useEffect(() => {
    if (!planId) {
      return;
    }

    let cancelled = false;
    const fetchWaivers = async () => {
      try {
        const result = await client.waivers.getWaiversForMembership({ membershipPlanId: planId });
        const waivers = result.waivers || [];
        if (!cancelled && waivers.length > 0) {
          const waiver = waivers[0] as { id: string; name: string; version: number };
          setWaiverData({ id: waiver.id, name: `${waiver.name} (v${waiver.version})` });
        }
      } catch {
        // Waiver fetch failed silently — card will show "No waiver"
      }
    };

    fetchWaivers();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // Compose final membership data from cache + waiver fetch + local overrides
  const membershipData = useMemo(() => {
    if (!initialMembershipData) {
      return null;
    }
    return {
      ...initialMembershipData,
      associatedWaiverId: waiverData?.id ?? null,
      associatedWaiverName: waiverData?.name ?? null,
      ...localOverrides,
    };
  }, [initialMembershipData, waiverData, localOverrides]);

  const isTrial = membershipData?.membershipType === 'trial';

  // Check if deletion is allowed (must be inactive with zero members)
  const canDelete = membershipData?.status === 'inactive' && membershipData?.activeCount === 0;

  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Handler for updating membership data — persists via the API, then
  // invalidates the cache so the page re-renders with fresh data. We still
  // optimistically apply localOverrides so the modal closes with up-to-date
  // values while the cache refetch is in flight.
  const handleUpdateMembership = async (updates: Partial<MembershipDetailData>) => {
    if (!membershipData) {
      return;
    }
    setSaveError(null);
    setLocalOverrides(prev => ({ ...prev, ...updates }));

    const merged = { ...membershipData, ...updates };
    const rawPlan = plans.find(p => p.id === resolvedParams.membershipId);
    const fallbackContractLength = rawPlan?.contractLength ?? 'Month-to-Month';
    const fallbackAccessLevel = rawPlan?.accessLevel ?? 'Unlimited';
    const payload = transformDetailDataToDb(merged, fallbackContractLength, fallbackAccessLevel);

    try {
      await client.membershipPlans.update({ id: membershipData.id, ...payload });
      await invalidateMembershipPlansCache();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update membership.';
      setSaveError(message);
      // Roll back the optimistic update so UI matches reality.
      setLocalOverrides({});
    }
  };

  // Handler for deleting membership
  const handleDeleteMembership = async () => {
    if (!membershipData) {
      return;
    }
    setDeleteError(null);
    try {
      await client.membershipPlans.remove({ id: membershipData.id });
      await invalidateMembershipPlansCache();
      router.push('/dashboard/memberships');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete membership.';
      setDeleteError(message);
    }
  };

  // Format price for display
  const formattedPrice = useMemo(() => {
    if (!membershipData) {
      return '';
    }
    if (membershipData.monthlyFee === null || membershipData.monthlyFee === 0) {
      return t('price_free');
    }
    const frequencySuffix = {
      monthly: '/mo',
      weekly: '/wk',
      annually: '/yr',
    }[membershipData.paymentFrequency];
    return `$${membershipData.monthlyFee.toFixed(2)}${frequencySuffix}`;
  }, [membershipData, t]);

  if (loading) {
    return (
      <div className="w-full space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!membershipData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">{t('not_found')}</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Back Navigation */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/memberships">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('back_to_memberships')}
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-foreground">{membershipData.membershipName}</h1>
        <p className="text-lg text-muted-foreground">{membershipData.category}</p>
      </div>

      {saveError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="membership-save-error">
          {saveError}
        </div>
      )}

      {/* Stats Card */}
      <MembershipStatsCard
        activeCount={membershipData.activeCount}
        revenue={membershipData.revenue}
        isTrial={isTrial}
        price={formattedPrice}
      />

      {/* Detail Cards Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Membership Basics Card */}
        <MembershipBasicsCard
          membershipName={membershipData.membershipName}
          status={membershipData.status}
          membershipType={membershipData.membershipType}
          description={membershipData.description}
          onEdit={canEdit ? () => setIsEditBasicsOpen(true) : undefined}
        />

        {/* Associated Program/Waiver Card */}
        <MembershipAssociatedProgramCard
          associatedProgramId={membershipData.associatedProgramId}
          associatedProgramName={membershipData.associatedProgramName}
          associatedWaiverId={membershipData.associatedWaiverId}
          associatedWaiverName={membershipData.associatedWaiverName}
          onEdit={canEdit ? () => setIsEditAssociatedProgramOpen(true) : undefined}
        />

        {/* Payment Details Card */}
        <MembershipPaymentDetailsCard
          signUpFee={membershipData.signUpFee}
          chargeSignUpFee={membershipData.chargeSignUpFee}
          monthlyFee={membershipData.monthlyFee}
          paymentFrequency={membershipData.paymentFrequency}
          proRateFirstPayment={membershipData.proRateFirstPayment}
          isTrial={isTrial}
          onEdit={canEdit ? () => setIsEditPaymentOpen(true) : undefined}
        />

        {/* Contract Terms Card */}
        <MembershipContractTermsCard
          contractLength={membershipData.contractLength}
          autoRenewal={membershipData.autoRenewal}
          cancellationFee={membershipData.cancellationFee}
          holdLimitPerYear={membershipData.holdLimitPerYear}
          onEdit={canEdit ? () => setIsEditContractOpen(true) : undefined}
        />
      </div>

      {/* Edit Modals */}
      <EditMembershipBasicsModal
        isOpen={isEditBasicsOpen}
        onClose={() => setIsEditBasicsOpen(false)}
        membershipName={membershipData.membershipName}
        status={membershipData.status}
        membershipType={membershipData.membershipType}
        description={membershipData.description}
        onSave={(data) => {
          handleUpdateMembership(data);
          setIsEditBasicsOpen(false);
        }}
      />

      <EditAssociatedProgramModal
        isOpen={isEditAssociatedProgramOpen}
        onClose={() => setIsEditAssociatedProgramOpen(false)}
        associatedProgramId={membershipData.associatedProgramId}
        associatedWaiverId={membershipData.associatedWaiverId}
        membershipPlanId={membershipData.id}
        onSave={(data) => {
          handleUpdateMembership(data);
          setIsEditAssociatedProgramOpen(false);
        }}
      />

      <EditPaymentDetailsModal
        isOpen={isEditPaymentOpen}
        onClose={() => setIsEditPaymentOpen(false)}
        signUpFee={membershipData.signUpFee}
        chargeSignUpFee={membershipData.chargeSignUpFee}
        monthlyFee={membershipData.monthlyFee}
        paymentFrequency={membershipData.paymentFrequency}
        proRateFirstPayment={membershipData.proRateFirstPayment}
        isTrial={isTrial}
        onSave={(data) => {
          handleUpdateMembership(data);
          setIsEditPaymentOpen(false);
        }}
      />

      <EditContractTermsModal
        isOpen={isEditContractOpen}
        onClose={() => setIsEditContractOpen(false)}
        contractLength={membershipData.contractLength}
        autoRenewal={membershipData.autoRenewal}
        cancellationFee={membershipData.cancellationFee}
        holdLimitPerYear={membershipData.holdLimitPerYear}
        onSave={(data) => {
          handleUpdateMembership(data);
          setIsEditContractOpen(false);
        }}
      />

      {/* Delete Button - only shown if inactive, no members, and user can edit */}
      {canEdit && canDelete && (
        <div className="flex justify-end">
          <Button
            variant="destructive"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('delete_button')}
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteMembershipAlertDialog
        isOpen={isDeleteDialogOpen}
        membershipName={membershipData.membershipName}
        onCloseAction={() => {
          setIsDeleteDialogOpen(false);
          setDeleteError(null);
        }}
        onConfirmAction={handleDeleteMembership}
        errorMessage={deleteError}
      />
    </div>
  );
}
