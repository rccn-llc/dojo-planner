'use client';

import type { AttendanceRecord, PunchcardInfo } from '@/features/members/details/MemberDetailAttendance';
import type { MemberNote } from '@/features/members/details/MemberDetailNotes';
import type { ConversionType } from '@/hooks/useConvertMemberWizard';
import type { Member } from '@/hooks/useMembersCache';
import type { MemberPaymentMethodData } from '@/services/MembersService';
import type { SignedWaiverWithTemplateName } from '@/services/WaiversService';
import { useOrganization } from '@clerk/nextjs';
import { ArrowRightLeft, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MemberBreadcrumb } from '@/components/ui/breadcrumb/MemberBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { transformCouponsToUi } from '@/features/marketing';
import { ConvertMemberModal } from '@/features/members/conversion/ConvertMemberModal';
import { ChangeMembershipModal } from '@/features/members/details/ChangeMembershipModal';
import { EditContactInfoModal } from '@/features/members/details/EditContactInfoModal';
import { EditMemberPhotoModal } from '@/features/members/details/EditMemberPhotoModal';
import { MemberDetailAttendance } from '@/features/members/details/MemberDetailAttendance';
import { MemberDetailNotes } from '@/features/members/details/MemberDetailNotes';
import { AddFamilyMembersModal } from '@/features/members/wizard/AddFamilyMembersModal';
import { useCouponsCache } from '@/hooks/useCouponsCache';
import { invalidateMembersCache, useMembersCache } from '@/hooks/useMembersCache';
import { client } from '@/libs/Orpc';
import { generateAndDownloadWaiverPdf, generatePdfFilename } from '@/services/WaiverPdfService';
import {
  formatCurrency,
  formatTransactionType,
  getInitials,
  getPaymentTypeIcon,
  getPaymentTypeLabel,
  getStatusColor,
  getStatusLabel,
  resolveTabFromUrl,
} from './utils';

type Tab = 'overview' | 'attendance' | 'notes';

type ContactInfo = {
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
};

type SubscriptionDetails = {
  membershipType: string;
  status: 'active' | 'on-hold' | 'cancelled';
  amount: number;
  pastDuePayments: number;
  lastPayment?: string;
};

type FamilyMember = {
  id: string;
  name: string;
  relationship: string;
  photoUrl?: string;
  /** Currently-active membership plan name, or null if none. */
  planName: string | null;
  /** Plan price in cents, or null if no active membership. */
  planPrice: number | null;
  /** Plan billing frequency (e.g. 'monthly'), or null. */
  planFrequency: string | null;
  status: 'active' | 'on-hold' | 'cancelled';
};

type MembershipDetailsData = {
  status: 'active' | 'on-hold' | 'cancelled';
  program: string;
  membershipType: string;
  membershipFee: number;
  paymentFrequency: string;
  registrationDate: string;
  startDate: string;
  nextPaymentDate: string;
  nextPaymentAmount: number;
};

type BillingHistoryItem = {
  id: string;
  date: string;
  member: string;
  amount: number;
  purpose: string;
  method: string;
  groupType?: 'family' | 'individual';
  children?: BillingHistoryItem[];
};

type MemberData = {
  memberName: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  billingContactRole: string;
  membershipBadge: string;
  amountOverdue: string;
  contactInfo: ContactInfo;
  subscriptionDetails: SubscriptionDetails;
  familyMembers: FamilyMember[];
  membershipDetails: MembershipDetailsData;
};

// Mock punchcard info for demonstration (used when member has punchcard membership)
const MOCK_PUNCHCARD_INFO: PunchcardInfo = {
  totalClasses: 10,
  classesUsed: 4,
  classesRemaining: 6,
};

// Build MemberData from API member data - use Member type from cache

function getMembershipBadgeText(membershipType?: string, planName?: string | null): string {
  // If we have an actual plan name, use it
  if (planName) {
    return planName;
  }
  // Fallback to legacy membership type mapping
  switch (membershipType) {
    case 'free':
      return 'Free Member';
    case 'free-trial':
      return 'Free Trial';
    case 'annual':
      return 'Annual Member';
    case 'monthly':
      return 'Monthly Member';
    default:
      return 'No Membership';
  }
}

function getSubscriptionMembershipType(membershipType?: string, planName?: string | null): string {
  // If we have an actual plan name, use it
  if (planName) {
    return planName;
  }
  // Fallback to legacy membership type mapping
  switch (membershipType) {
    case 'free':
      return 'Free Membership';
    case 'free-trial':
      return 'Free Trial Membership';
    case 'annual':
      return 'Annual Membership';
    case 'monthly':
      return 'Monthly Membership';
    default:
      return 'No Membership';
  }
}

function getSubscriptionAmount(membershipType?: string, planPrice?: number | null): number {
  // If we have an actual plan price, use it
  if (planPrice !== undefined && planPrice !== null) {
    return planPrice;
  }
  // Fallback to legacy membership type pricing
  if (membershipType === 'free' || membershipType === 'free-trial') {
    return 0;
  }
  // Default monthly amount
  return 160;
}

function getMemberStatus(status?: string): 'active' | 'on-hold' | 'cancelled' {
  switch (status?.toLowerCase()) {
    case 'on-hold':
      return 'on-hold';
    case 'cancelled':
      return 'cancelled';
    case 'active':
    default:
      return 'active';
  }
}

type MembershipPlanInfo = {
  name?: string;
  price?: number;
  frequency?: string;
  contractLength?: string;
  isTrial?: boolean | null;
};

type MembershipDates = {
  startDate?: Date;
  createdAt?: Date;
  nextPaymentDate?: Date | null;
};

function formatMembershipDate(date?: Date | null): string {
  if (!date) {
    return 'N/A';
  }
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function buildMembershipDetails(
  membershipType?: string,
  status?: string,
  program?: string,
  plan?: MembershipPlanInfo | null,
  dates?: MembershipDates,
): MembershipDetailsData {
  const memberStatus = getMemberStatus(status);
  const isFreeOrTrial = plan?.isTrial || membershipType === 'free' || membershipType === 'free-trial' || plan?.price === 0;

  // Use actual program from member data, or N/A if not set
  const displayProgram = program || 'N/A';
  // Use actual dates from membership record
  const registrationDate = formatMembershipDate(dates?.createdAt);
  const startDate = formatMembershipDate(dates?.startDate);

  // Base membership details
  const baseDetails = {
    status: memberStatus,
    program: displayProgram,
    registrationDate,
    startDate,
  };

  // If we have actual plan data, use it
  if (plan?.name) {
    const isPaid = plan.price && plan.price > 0;
    // Punchcard / one-time memberships (frequency = 'None', not trial) have no future payments
    const isOneTime = plan.frequency === 'None' && !plan.isTrial;
    return {
      ...baseDetails,
      membershipType: plan.name,
      membershipFee: plan.price || 0,
      paymentFrequency: plan.frequency || 'N/A',
      nextPaymentDate: (isPaid && !isOneTime) ? formatMembershipDate(dates?.nextPaymentDate) : 'N/A',
      nextPaymentAmount: isOneTime ? 0 : (plan.price || 0),
    };
  }

  // For free and free trial, no membership fee or payment information
  if (isFreeOrTrial) {
    return {
      ...baseDetails,
      membershipType: getSubscriptionMembershipType(membershipType),
      membershipFee: 0,
      paymentFrequency: 'N/A',
      nextPaymentDate: 'N/A',
      nextPaymentAmount: 0,
    };
  }

  // If no membership type set, show N/A values
  if (!membershipType) {
    return {
      ...baseDetails,
      membershipType: 'N/A',
      membershipFee: 0,
      paymentFrequency: 'N/A',
      nextPaymentDate: 'N/A',
      nextPaymentAmount: 0,
    };
  }

  // Fallback for legacy paid memberships
  return {
    ...baseDetails,
    membershipType: membershipType === 'annual' ? 'Annual' : 'Month-to-Month',
    membershipFee: membershipType === 'annual' ? 1800 : 300,
    paymentFrequency: membershipType === 'annual' ? 'Annual' : 'Monthly',
    nextPaymentDate: formatMembershipDate(dates?.nextPaymentDate),
    nextPaymentAmount: membershipType === 'annual' ? 1800 : 300,
  };
}

function buildMemberDataFromAPI(apiMember: Member & { membershipType?: string; program?: string }): MemberData {
  const memberName = `${apiMember.firstName || ''} ${apiMember.lastName || ''}`.trim() || 'Member';
  const memberStatus = getMemberStatus(apiMember.status);
  const membershipTypeStr = apiMember.membershipType || '';

  // Get membership plan details from currentMembership if available
  const currentPlan = apiMember.currentMembership?.membershipPlan;
  const planName = currentPlan?.name || null;
  const planPrice = currentPlan?.price ?? null;
  const planProgram = currentPlan?.program || apiMember.program;
  const planIsTrial = currentPlan?.isTrial;

  // Check if it's a free/trial membership
  const isFreeOrTrial = planIsTrial || membershipTypeStr === 'free' || membershipTypeStr === 'free-trial' || planPrice === 0;

  return {
    memberName,
    firstName: apiMember.firstName || '',
    lastName: apiMember.lastName || '',
    photoUrl: apiMember.photoUrl || undefined,
    billingContactRole: 'Billing Contact',
    membershipBadge: getMembershipBadgeText(membershipTypeStr, planName),
    amountOverdue: '$0',
    contactInfo: {
      phone: apiMember.phone || '',
      email: apiMember.email || '',
      dateOfBirth: apiMember.dateOfBirth
        ? new Date(apiMember.dateOfBirth).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : undefined,
      street: apiMember.address?.street || '',
      city: apiMember.address?.city || '',
      state: apiMember.address?.state || '',
      zipCode: apiMember.address?.zipCode || '',
      country: apiMember.address?.country || 'US',
    },
    subscriptionDetails: {
      membershipType: getSubscriptionMembershipType(membershipTypeStr, planName),
      status: memberStatus,
      amount: getSubscriptionAmount(membershipTypeStr, planPrice),
      pastDuePayments: 0,
      lastPayment: isFreeOrTrial ? undefined : 'Last payment: N/A',
    },
    familyMembers: [],
    membershipDetails: buildMembershipDetails(membershipTypeStr, apiMember.status, planProgram, currentPlan, {
      startDate: apiMember.currentMembership?.startDate,
      createdAt: apiMember.currentMembership?.createdAt,
      nextPaymentDate: apiMember.currentMembership?.nextPaymentDate,
    }),
  };
}

type PageState = {
  originalData: MemberData | null;
  currentData: MemberData | null;
  error: string | null;
  isLoading: boolean;
  activeTab: Tab;
  isLoadingMember: boolean;
  subscriptionType: string | null;
};

type PageAction
  = { type: 'SET_ACTIVE_TAB'; payload: Tab }
    | { type: 'SET_SUBSCRIPTION_TYPE'; payload: string }
    | { type: 'SET_MEMBER_DATA'; payload: MemberData }
    | { type: 'SET_ERROR'; payload: string | null }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_LOADING_MEMBER'; payload: boolean }
    | { type: 'UPDATE_CONTACT_INFO'; payload: { field: keyof ContactInfo; value: string } }
    | { type: 'UPDATE_NAME'; payload: { firstName: string; lastName: string } }
    | { type: 'REMOVE_FAMILY_MEMBER'; payload: string };

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_SUBSCRIPTION_TYPE':
      return { ...state, subscriptionType: action.payload };
    case 'SET_MEMBER_DATA':
      return { ...state, originalData: action.payload, currentData: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_LOADING_MEMBER':
      return { ...state, isLoadingMember: action.payload };
    case 'UPDATE_CONTACT_INFO': {
      if (!state.currentData) {
        return state;
      }
      return {
        ...state,
        currentData: {
          ...state.currentData,
          contactInfo: {
            ...state.currentData.contactInfo,
            [action.payload.field]: action.payload.value,
          },
        },
        error: null,
      };
    }
    case 'UPDATE_NAME': {
      if (!state.currentData) {
        return state;
      }
      const { firstName, lastName } = action.payload;
      const memberName = `${firstName} ${lastName}`.trim() || 'Member';
      return {
        ...state,
        currentData: {
          ...state.currentData,
          firstName,
          lastName,
          memberName,
        },
        error: null,
      };
    }
    case 'REMOVE_FAMILY_MEMBER': {
      if (!state.currentData) {
        return state;
      }
      return {
        ...state,
        currentData: {
          ...state.currentData,
          familyMembers: state.currentData.familyMembers.filter(m => m.id !== action.payload),
        },
      };
    }
    default:
      return state;
  }
}

export default function EditMemberPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const memberId = params?.memberId as string;
  const locale = (params?.locale as string) || 'en';

  // Get organization
  const { organization } = useOrganization();

  // Fetch members from cache
  const { members } = useMembersCache(organization?.id);

  // Fetch coupons for family member modal
  const { coupons: rawCoupons } = useCouponsCache(organization?.id);
  const availableCoupons = useMemo(() => transformCouponsToUi(rawCoupons), [rawCoupons]);

  // State for member data
  const [state, dispatch] = useReducer(pageReducer, {
    originalData: null,
    currentData: null,
    error: null,
    isLoading: false,
    activeTab: 'overview' as Tab,
    isLoadingMember: true,
    subscriptionType: null,
  });

  // State for edit contact info modal
  const [isEditContactModalOpen, setIsEditContactModalOpen] = useState(false);

  // State for edit photo modal
  const [isEditPhotoModalOpen, setIsEditPhotoModalOpen] = useState(false);

  // State for change membership modal
  const [isChangeMembershipModalOpen, setIsChangeMembershipModalOpen] = useState(false);
  const [membershipModalMode, setMembershipModalMode] = useState<'add' | 'change'>('add');

  // State for signed waivers
  const [signedWaivers, setSignedWaivers] = useState<SignedWaiverWithTemplateName[]>([]);
  const [isLoadingWaivers, setIsLoadingWaivers] = useState(true);

  // State for payment methods
  const [paymentMethods, setPaymentMethods] = useState<MemberPaymentMethodData[]>([]);
  const [isLoadingPayment, setIsLoadingPayment] = useState(true);

  // State for billing history
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>([]);
  const [isLoadingBilling, setIsLoadingBilling] = useState(true);

  // State for family members (only for HOH members)
  const [familyMembersData, setFamilyMembersData] = useState<FamilyMember[]>([]);

  // State for notes
  const [notes, setNotes] = useState<MemberNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);

  // State for attendance
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(true);

  // State for add family members modal
  const [isAddFamilyModalOpen, setIsAddFamilyModalOpen] = useState(false);

  // State for convert member modal
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [conversionType, setConversionType] = useState<ConversionType | null>(null);

  // HOH data for family members (who is this family member's HOH?)
  const [currentHOH, setCurrentHOH] = useState<{ id: string; name: string } | null>(null);

  // Get the current member from cache for membership info
  const currentMember: Member | undefined = members?.find(m => m.id === memberId);
  const currentMembership = currentMember?.currentMembership;
  const hasActiveMembership = currentMembership?.status === 'active';

  // Build HOH data for family member modal
  const hohMemberData = useMemo(() => {
    if (!currentMember) {
      return null;
    }
    const memberName = `${currentMember.firstName || ''} ${currentMember.lastName || ''}`.trim();
    const primaryPayment = paymentMethods[0];
    return {
      id: currentMember.id,
      name: memberName,
      email: currentMember.email || '',
      hasPaymentMethod: paymentMethods.length > 0,
      paymentMethodLast4: primaryPayment?.last4 ?? undefined,
      paymentMethodType: primaryPayment?.type === 'card' ? 'card' as const : primaryPayment?.type === 'bank_transfer' ? 'ach' as const : undefined,
    };
  }, [currentMember, paymentMethods]);

  const handleOpenMembershipModal = (mode: 'add' | 'change') => {
    setMembershipModalMode(mode);
    setIsChangeMembershipModalOpen(true);
  };

  const handleOpenConvertModal = (type: ConversionType) => {
    setConversionType(type);
    setIsConvertModalOpen(true);
  };

  const handleConvertModalClose = async () => {
    setIsConvertModalOpen(false);
    setConversionType(null);
    await invalidateMembersCache();
  };

  // Handler to sync tab from URL
  const syncTabFromUrl = useCallback(() => {
    const tabParam = searchParams.get('tab');
    const resolvedTab = resolveTabFromUrl(tabParam);
    dispatch({ type: 'SET_ACTIVE_TAB', payload: resolvedTab });
  }, [searchParams]);

  // Sync tab from URL search params
  useEffect(() => {
    syncTabFromUrl();
  }, [syncTabFromUrl]);

  // Fetch organization subscription type (same as members landing page)
  useEffect(() => {
    const fetchSubscriptionType = async () => {
      if (!organization?.id) {
        return;
      }
      try {
        const response = await fetch(`/${locale}/api/organization/${organization.id}/subscription`);
        if (response.ok) {
          const data = await response.json();
          dispatch({ type: 'SET_SUBSCRIPTION_TYPE', payload: data.subscriptionType });
        }
      } catch (err) {
        console.warn('[Edit Member] Failed to fetch subscription type:', err);
      }
    };
    fetchSubscriptionType();
  }, [organization?.id, locale]);

  // Handler to load member data from cache
  const loadMemberData = useCallback(() => {
    try {
      if (members && members.length > 0) {
        const member = members.find(m => m.id === memberId);
        if (member) {
          // Use organization subscription type if available, otherwise use member's individual type
          const membershipTypeToUse = (state.subscriptionType || member.membershipType) as 'free' | 'free-trial' | 'monthly' | 'annual' | undefined;
          const memberWithType = { ...member, membershipType: membershipTypeToUse };
          const memberData = buildMemberDataFromAPI(memberWithType);
          dispatch({ type: 'SET_MEMBER_DATA', payload: memberData });
          console.info('[Edit Member] Member data loaded from cache:', {
            timestamp: new Date().toISOString(),
            memberId,
            memberName: memberData.memberName,
            membershipType: membershipTypeToUse,
          });
        } else {
          console.warn('[Edit Member] Member not found in cache:', { memberId });
          dispatch({ type: 'SET_ERROR', payload: 'Member not found' });
        }
      }
    } finally {
      dispatch({ type: 'SET_LOADING_MEMBER', payload: false });
    }
  }, [members, memberId, state.subscriptionType]);

  // Load member data from cache
  useEffect(() => {
    loadMemberData();
  }, [loadMemberData]);

  // Fetch signed waivers for this member
  useEffect(() => {
    const fetchSignedWaivers = async () => {
      if (!memberId) {
        return;
      }
      setIsLoadingWaivers(true);
      try {
        const result = await client.waivers.listMemberSignedWaivers({ memberId });
        setSignedWaivers(result.waivers);
      } catch (err) {
        console.warn('[Edit Member] Failed to fetch signed waivers:', err);
        setSignedWaivers([]);
      } finally {
        setIsLoadingWaivers(false);
      }
    };
    fetchSignedWaivers();
  }, [memberId]);

  // Fetch payment methods for this member
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      if (!memberId) {
        return;
      }
      setIsLoadingPayment(true);
      try {
        const result = await client.member.listPaymentMethods({ memberId });
        setPaymentMethods(result.paymentMethods);
      } catch (err) {
        console.warn('[Edit Member] Failed to fetch payment methods:', err);
        setPaymentMethods([]);
      } finally {
        setIsLoadingPayment(false);
      }
    };
    fetchPaymentMethods();
  }, [memberId]);

  // Fetch billing history for this member
  useEffect(() => {
    const fetchBillingHistory = async () => {
      if (!memberId) {
        return;
      }
      setIsLoadingBilling(true);
      try {
        const result = await client.member.listMemberTransactions({ memberId, limit: 50 });
        const items: BillingHistoryItem[] = result.transactions.map(tx => ({
          id: tx.id,
          date: new Date(tx.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
          member: `${tx.memberFirstName || ''} ${tx.memberLastName || ''}`.trim(),
          amount: tx.amount,
          purpose: formatTransactionType(tx.transactionType),
          method: tx.paymentMethod || 'N/A',
        }));
        setBillingHistory(items);
      } catch (err) {
        console.warn('[Edit Member] Failed to fetch billing history:', err);
        setBillingHistory([]);
      } finally {
        setIsLoadingBilling(false);
      }
    };
    fetchBillingHistory();
  }, [memberId]);

  // Fetch family members if this member is a head of household
  const isHOH = currentMember?.memberType === 'head-of-household';
  const fetchFamilyMembers = useCallback(async () => {
    if (!memberId || !isHOH) {
      return;
    }
    try {
      const result = await client.member.listFamilyMembers({ memberId });
      const mapped: FamilyMember[] = result.familyMembers.map(fm => ({
        id: fm.id,
        name: `${fm.firstName} ${fm.lastName}`,
        relationship: fm.relationship,
        photoUrl: fm.photoUrl || undefined,
        planName: fm.planName ?? null,
        planPrice: fm.planPrice ?? null,
        planFrequency: fm.planFrequency ?? null,
        status: (fm.status === 'on-hold' ? 'on-hold' : fm.status === 'cancelled' ? 'cancelled' : 'active') as 'active' | 'on-hold' | 'cancelled',
      }));
      setFamilyMembersData(mapped);
    } catch (err) {
      console.warn('[Edit Member] Failed to fetch family members:', err);
      setFamilyMembersData([]);
    }
  }, [memberId, isHOH]);

  useEffect(() => {
    fetchFamilyMembers();
  }, [fetchFamilyMembers]);

  const handleAddFamilyModalClose = useCallback(async () => {
    setIsAddFamilyModalOpen(false);
    await fetchFamilyMembers();
    await invalidateMembersCache();
  }, [fetchFamilyMembers]);

  // Fetch notes for this member
  const fetchNotes = useCallback(async () => {
    if (!memberId) {
      return;
    }
    setIsLoadingNotes(true);
    try {
      const result = await client.notes.list({ memberId });
      setNotes(result.notes.map(n => ({
        id: n.id,
        memberId: n.memberId,
        content: n.content,
        createdByName: n.createdByName,
        createdAt: new Date(n.createdAt),
        updatedAt: new Date(n.updatedAt),
      })));
    } catch (err) {
      console.warn('[Edit Member] Failed to fetch notes:', err);
      setNotes([]);
    } finally {
      setIsLoadingNotes(false);
    }
  }, [memberId]);
  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Fetch attendance for this member
  const fetchAttendance = useCallback(async () => {
    if (!memberId) {
      return;
    }
    setIsLoadingAttendance(true);
    try {
      const result = await client.attendance.list({ memberId });
      setAttendance(result.records);
    } catch (err) {
      console.warn('[Edit Member] Failed to fetch attendance:', err);
      setAttendance([]);
    } finally {
      setIsLoadingAttendance(false);
    }
  }, [memberId]);
  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const handleAddNote = useCallback(async (content: string) => {
    if (!memberId) {
      return;
    }
    await client.notes.create({ memberId, content });
    await fetchNotes();
  }, [memberId, fetchNotes]);

  const handleEditNote = useCallback(async (noteId: string, content: string) => {
    await client.notes.update({ id: noteId, content });
    await fetchNotes();
  }, [fetchNotes]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    await client.notes.remove({ id: noteId });
    await fetchNotes();
  }, [fetchNotes]);

  // Fetch HOH data for family members (to support conversion)
  const isFamilyMember = currentMember?.memberType === 'family-member';
  const fetchCurrentHOH = useCallback(async () => {
    if (!memberId || !isFamilyMember) {
      setCurrentHOH(null);
      return;
    }
    try {
      const result = await client.member.getHOHForMember({ memberId });
      if (result.hoh) {
        setCurrentHOH({ id: result.hoh.id, name: `${result.hoh.firstName} ${result.hoh.lastName}` });
      }
    } catch {
      setCurrentHOH(null);
    }
  }, [memberId, isFamilyMember]);
  useEffect(() => {
    fetchCurrentHOH();
  }, [fetchCurrentHOH]);

  // Derive applied coupon from signed waivers (most recent with coupon data)
  const appliedCoupon = useMemo(() => {
    const waiverWithCoupon = signedWaivers
      .filter(w => w.couponCode)
      .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())[0];

    if (!waiverWithCoupon?.couponCode) {
      return null;
    }

    return {
      code: waiverWithCoupon.couponCode,
      type: waiverWithCoupon.couponType || 'Percentage',
      amount: waiverWithCoupon.couponAmount || '',
      description: 'Applied at signup',
    };
  }, [signedWaivers]);

  const handleDownloadWaiver = useCallback((waiver: SignedWaiverWithTemplateName) => {
    if (!organization?.name) {
      return;
    }

    const signedAt = new Date(waiver.signedAt);
    generateAndDownloadWaiverPdf(
      {
        organizationName: organization.name,
        waiverName: waiver.waiverName,
        waiverVersion: waiver.waiverTemplateVersion,
        renderedContent: waiver.renderedContent,
        memberFirstName: waiver.memberFirstName,
        memberLastName: waiver.memberLastName,
        memberEmail: waiver.memberEmail,
        signatureDataUrl: waiver.signatureDataUrl,
        signedByName: waiver.signedByName,
        signedByRelationship: waiver.signedByRelationship,
        signedAt,
        ipAddress: waiver.ipAddress,
        membershipPlanName: waiver.membershipPlanName,
        membershipPlanPrice: waiver.membershipPlanPrice,
        membershipPlanFrequency: waiver.membershipPlanFrequency,
        membershipPlanContractLength: waiver.membershipPlanContractLength,
        membershipPlanSignupFee: waiver.membershipPlanSignupFee,
        membershipPlanIsTrial: waiver.membershipPlanIsTrial,
        couponCode: waiver.couponCode,
        couponType: waiver.couponType,
        couponAmount: waiver.couponAmount,
        couponDiscountedPrice: waiver.couponDiscountedPrice,
      },
      generatePdfFilename({
        memberFirstName: waiver.memberFirstName,
        memberLastName: waiver.memberLastName,
        signedAt,
      }),
    );
  }, [organization?.name]);

  const handleRemoveFamilyMember = useCallback(async (familyMemberId: string) => {
    if (!memberId) {
      return;
    }
    try {
      await client.member.unlinkFamilyMember({
        memberId: familyMemberId,
        hohMemberId: memberId,
      });
      dispatch({ type: 'REMOVE_FAMILY_MEMBER', payload: familyMemberId });
      setFamilyMembersData(prev => prev.filter(m => m.id !== familyMemberId));
    } catch (err) {
      console.warn('[Edit Member] Failed to unlink family member:', err);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to remove family member' });
    }
  }, [memberId]);

  const handleTabChange = useCallback((tab: Tab) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tab });
    // Update URL with tab parameter
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('tab', tab);
    router.push(newUrl.pathname + newUrl.search);
  }, [router]);

  const handleCancel = () => {
    router.back();
  };

  // Show loading state
  if (state.isLoadingMember || !state.currentData || !state.originalData) {
    return (
      <div className="space-y-6">
        <MemberBreadcrumb
          memberName="Loading..."
          onBackClick={handleCancel}
        />
        {state.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {state.error}
          </div>
        )}
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading member data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MemberBreadcrumb
        memberName={state.currentData.memberName}
        onBackClick={handleCancel}
      />

      {state.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* Member Header */}
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <Avatar className="h-16 w-16">
            {state.currentData.photoUrl && <AvatarImage src={state.currentData.photoUrl} alt={state.currentData.memberName} />}
            <AvatarFallback>{getInitials(state.currentData.memberName)}</AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => setIsEditPhotoModalOpen(true)}
            aria-label="Edit photo"
            className="absolute -right-1 -bottom-1 cursor-pointer rounded-full border border-border bg-background p-1 shadow-sm hover:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{state.currentData.memberName}</h1>
            <Badge variant="outline" className="text-sm">
              {currentMember?.memberType === 'head-of-household'
                ? 'Head of Household'
                : currentMember?.memberType === 'family-member'
                  ? 'Family Member'
                  : 'Individual'}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-sm">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Convert
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {currentMember?.memberType === 'head-of-household' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <DropdownMenuItem
                            disabled={familyMembersData.length > 0}
                            onClick={() => handleOpenConvertModal('hoh-to-individual')}
                          >
                            Convert to Individual
                          </DropdownMenuItem>
                        </span>
                      </TooltipTrigger>
                      {familyMembersData.length > 0 && (
                        <TooltipContent>
                          Remove all family members before converting to Individual
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
                {currentMember?.memberType === 'individual' && (
                  <DropdownMenuItem onClick={() => handleOpenConvertModal('individual-to-hoh')}>
                    Convert to Head of Household
                  </DropdownMenuItem>
                )}
                {currentMember?.memberType === 'family-member' && (
                  <DropdownMenuItem onClick={() => handleOpenConvertModal('family-to-individual')}>
                    Convert to Individual
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{state.currentData.billingContactRole}</Badge>
            {currentMember?.status && (
              <Badge variant={getStatusColor(currentMember.status as 'active' | 'on-hold' | 'cancelled')}>
                {getStatusLabel(currentMember.status as 'active' | 'on-hold' | 'cancelled')}
              </Badge>
            )}
            {hasActiveMembership && state.currentData.membershipBadge && (
              <Badge variant="default">{state.currentData.membershipBadge}</Badge>
            )}
            {state.currentData.subscriptionDetails.pastDuePayments > 0 && (
              <Badge variant="destructive">{state.currentData.amountOverdue}</Badge>
            )}
          </div>
          {isFamilyMember && currentHOH && (
            <p className="text-sm text-muted-foreground">
              {'Linked to '}
              <Link
                href={`/dashboard/members/${currentHOH.id}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {currentHOH.name}
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border">
        <div className="flex gap-8">
          <button
            type="button"
            onClick={() => handleTabChange('overview')}
            className={`cursor-pointer pb-3 text-sm font-semibold transition-colors ${
              state.activeTab === 'overview'
                ? 'border-b-2 border-foreground text-foreground'
                : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('attendance')}
            className={`cursor-pointer pb-3 text-sm font-semibold transition-colors ${
              state.activeTab === 'attendance'
                ? 'border-b-2 border-foreground text-foreground'
                : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Attendance
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('notes')}
            className={`cursor-pointer pb-3 text-sm font-semibold transition-colors ${
              state.activeTab === 'notes'
                ? 'border-b-2 border-foreground text-foreground'
                : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Notes
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {state.activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Contact Information - Read Only Display */}
            <Card className="flex flex-col p-6">
              <div>
                <h2 className="mb-6 text-lg font-semibold text-foreground">Contact Information</h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Address:</p>
                    <p className="text-sm text-foreground">
                      {state.currentData.contactInfo.street && `${state.currentData.contactInfo.street}, `}
                      {state.currentData.contactInfo.city && `${state.currentData.contactInfo.city} `}
                      {state.currentData.contactInfo.state && `${state.currentData.contactInfo.state} `}
                      {state.currentData.contactInfo.zipCode}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Phone:</p>
                    <p className="text-sm text-foreground">{state.currentData.contactInfo.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Email:</p>
                    <p className="text-sm text-foreground">{state.currentData.contactInfo.email || '—'}</p>
                  </div>
                  {state.currentData.contactInfo.dateOfBirth && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Date of Birth:</p>
                      <p className="text-sm text-foreground">{state.currentData.contactInfo.dateOfBirth}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-auto flex justify-end pt-6">
                <Button
                  className="w-fit bg-foreground text-background hover:bg-foreground/90"
                  onClick={() => setIsEditContactModalOpen(true)}
                >
                  Edit Details
                </Button>
              </div>
            </Card>

            {/* Edit Contact Info Modal */}
            <EditContactInfoModal
              isOpen={isEditContactModalOpen}
              onClose={() => setIsEditContactModalOpen(false)}
              memberId={memberId}
              initialEmail={state.currentData.contactInfo.email || ''}
              initialPhone={state.currentData.contactInfo.phone || ''}
              initialDateOfBirth={currentMember?.dateOfBirth ? new Date(currentMember.dateOfBirth) : undefined}
              initialAddress={
                state.currentData.contactInfo.street
                  ? {
                      street: state.currentData.contactInfo.street,
                      apartment: undefined,
                      city: state.currentData.contactInfo.city || '',
                      state: state.currentData.contactInfo.state || '',
                      zipCode: state.currentData.contactInfo.zipCode || '',
                      country: state.currentData.contactInfo.country || 'US',
                    }
                  : undefined
              }
            />

            {/* Edit Photo Modal — keyed on open state so internal state resets per-open */}
            <EditMemberPhotoModal
              key={isEditPhotoModalOpen ? 'open' : 'closed'}
              isOpen={isEditPhotoModalOpen}
              memberId={memberId}
              memberName={state.currentData.memberName}
              currentPhotoUrl={state.currentData.photoUrl ?? null}
              onCloseAction={() => setIsEditPhotoModalOpen(false)}
              onSavedAction={() => {
                // The modal already calls invalidateMembersCache(); useMembersCache
                // re-runs and the avatar refreshes without a full page reload.
              }}
            />

            {/* Membership Details - Comprehensive */}
            <Card className="flex flex-col p-6">
              <div>
                <h2 className="mb-6 text-lg font-semibold text-foreground">Membership Details</h2>
                {hasActiveMembership
                  ? (
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <p className="text-sm text-muted-foreground">Status</p>
                          <Badge variant={getStatusColor(state.currentData.membershipDetails.status)}>
                            {getStatusLabel(state.currentData.membershipDetails.status)}
                          </Badge>
                        </div>
                        <div className="flex items-start justify-between">
                          <p className="text-sm text-muted-foreground">Program</p>
                          <p className={`text-right text-sm ${state.currentData.membershipDetails.program === 'N/A' ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {state.currentData.membershipDetails.program}
                          </p>
                        </div>
                        <div className="flex items-start justify-between">
                          <p className="text-sm text-muted-foreground">Membership Type</p>
                          <p className={`text-right text-sm ${state.currentData.membershipDetails.membershipType === 'N/A' ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {state.currentData.membershipDetails.membershipType}
                          </p>
                        </div>
                        {state.currentData.membershipDetails.membershipFee > 0 && (
                          <div className="flex items-start justify-between">
                            <p className="text-sm text-muted-foreground">Membership Fee</p>
                            <p className="text-right text-sm font-semibold text-foreground">
                              {formatCurrency(state.currentData.membershipDetails.membershipFee)}
                            </p>
                          </div>
                        )}
                        {state.currentData.membershipDetails.paymentFrequency !== 'N/A' && (
                          <div className="flex items-start justify-between">
                            <p className="text-sm text-muted-foreground">Payment Frequency</p>
                            <p className="text-right text-sm text-foreground">{state.currentData.membershipDetails.paymentFrequency}</p>
                          </div>
                        )}
                        <div className="flex items-start justify-between border-t border-border pt-4">
                          <p className="text-sm text-muted-foreground">Registration Date</p>
                          <p className="text-right text-sm text-foreground">{state.currentData.membershipDetails.registrationDate}</p>
                        </div>
                        <div className="flex items-start justify-between">
                          <p className="text-sm text-muted-foreground">Start Date</p>
                          <p className="text-right text-sm text-foreground">{state.currentData.membershipDetails.startDate}</p>
                        </div>
                        {state.currentData.membershipDetails.nextPaymentDate !== 'N/A' && (
                          <div className="flex items-start justify-between">
                            <p className="text-sm text-muted-foreground">Next Payment Date</p>
                            <p className="text-right text-sm text-foreground">{state.currentData.membershipDetails.nextPaymentDate}</p>
                          </div>
                        )}
                        {state.currentData.membershipDetails.nextPaymentAmount > 0 && (
                          <div className="flex items-start justify-between">
                            <p className="text-sm text-muted-foreground">Next Payment Amount</p>
                            <p className="text-right text-sm font-semibold text-foreground">
                              {formatCurrency(state.currentData.membershipDetails.nextPaymentAmount)}
                            </p>
                          </div>
                        )}
                        {state.currentData.subscriptionDetails.pastDuePayments > 0 && (
                          <div className="flex items-start justify-between border-t border-border pt-4">
                            <div>
                              <p className="text-sm font-semibold text-destructive">Past Due Payments</p>
                              <p className="text-xs text-muted-foreground">{state.currentData.subscriptionDetails.lastPayment}</p>
                            </div>
                            <p className="text-lg font-bold text-destructive">
                              {formatCurrency(state.currentData.subscriptionDetails.pastDuePayments)}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  : (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <p className="text-muted-foreground">No membership assigned</p>
                        <p className="mt-1 text-sm text-muted-foreground">Add a membership plan for this member</p>
                      </div>
                    )}
              </div>
              <div className="mt-auto flex flex-wrap justify-end gap-3 pt-6">
                {hasActiveMembership
                  ? (
                      <>
                        <Button
                          className="w-fit bg-foreground text-background hover:bg-foreground/90"
                          onClick={() => handleOpenMembershipModal('change')}
                        >
                          Change Membership
                        </Button>
                        <Button variant="destructive" className="w-fit">
                          Hold
                        </Button>
                      </>
                    )
                  : (
                      <Button
                        className="w-fit bg-foreground text-background hover:bg-foreground/90"
                        onClick={() => handleOpenMembershipModal('add')}
                      >
                        Add Membership
                      </Button>
                    )}
              </div>
            </Card>

            {/* Change Membership Modal */}
            <ChangeMembershipModal
              isOpen={isChangeMembershipModalOpen}
              onClose={() => setIsChangeMembershipModalOpen(false)}
              memberId={memberId}
              currentMembershipPlanId={currentMembership?.membershipPlanId}
              mode={membershipModalMode}
            />
          </div>

          {/* Payment Method & Agreement Section */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Payment Method */}
            <Card className="flex flex-col p-6">
              <div>
                <h2 className="mb-6 text-lg font-semibold text-foreground">Payment Method</h2>
                {isLoadingPayment
                  ? (
                      <p className="text-sm text-muted-foreground">Loading payment methods...</p>
                    )
                  : paymentMethods.length === 0
                    ? (
                        <p className="text-sm text-muted-foreground">No payment method on file</p>
                      )
                    : (
                        <>
                          {(() => {
                            const pm = paymentMethods.find(p => p.isDefault) || paymentMethods[0]!;
                            return (
                              <div className="flex items-start gap-4">
                                <div className="rounded-lg bg-blue-600 p-3">
                                  <span className="text-2xl">{getPaymentTypeIcon(pm.type)}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-foreground">
                                    {getPaymentTypeLabel(pm.type).toUpperCase()}
                                    {pm.last4 && (
                                      <>
                                        {' '}
                                        ••••
                                        {' '}
                                        {pm.last4}
                                      </>
                                    )}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {pm.isDefault ? 'Default payment method' : ''}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}
                          {/* Applied Coupon Info */}
                          {appliedCoupon && (
                            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
                              <div className="flex items-center gap-2">
                                <span className="text-green-600 dark:text-green-400">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                    <line x1="7" y1="7" x2="7.01" y2="7" />
                                  </svg>
                                </span>
                                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                                  Coupon Applied:
                                  {' '}
                                  {appliedCoupon.code}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-green-700 dark:text-green-300">
                                {appliedCoupon.type === 'Free Trial'
                                  ? appliedCoupon.amount
                                  : `${appliedCoupon.amount} off`}
                                {' - '}
                                {appliedCoupon.description}
                              </p>
                            </div>
                          )}
                        </>
                      )}
              </div>
            </Card>

            {/* Agreement & Waiver */}
            <Card className={`flex flex-col p-6 ${signedWaivers.length > 0 ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950' : ''}`}>
              <h2 className="mb-2 text-lg font-semibold text-foreground">Agreement & Waiver</h2>
              {isLoadingWaivers
                ? (
                    <p className="text-sm text-muted-foreground">Loading waivers...</p>
                  )
                : signedWaivers.length === 0
                  ? (
                      <p className="text-sm text-muted-foreground">No waivers signed</p>
                    )
                  : (
                      <div className="space-y-3">
                        {signedWaivers.map(waiver => (
                          <div key={waiver.id} className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {waiver.waiverName}
                                {' '}
                                <span className="text-xs font-normal text-muted-foreground">
                                  (v
                                  {waiver.waiverTemplateVersion}
                                  )
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Signed on
                                {' '}
                                {new Date(waiver.signedAt).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleDownloadWaiver(waiver)}
                              className="w-fit gap-2 bg-foreground text-background hover:bg-foreground/90"
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
            </Card>
          </div>

          {/* Billing History */}
          <Card className="p-6">
            <h2 className="mb-6 text-lg font-semibold text-foreground">Billing History</h2>
            {isLoadingBilling
              ? (
                  <p className="text-sm text-muted-foreground">Loading billing history...</p>
                )
              : billingHistory.length === 0
                ? (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-muted-foreground">No billing history</p>
                    </div>
                  )
                : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Member</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Date</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Amount</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Purpose</th>
                            <th className="hidden px-4 py-3 text-left text-sm font-semibold text-foreground sm:table-cell">Method</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {billingHistory.map(item => (
                            <tr key={item.id} className="border-b border-border hover:bg-secondary/30">
                              <td className="px-4 py-4">
                                <span className="text-sm font-semibold text-foreground">{item.member}</span>
                              </td>
                              <td className="px-4 py-4 text-sm text-muted-foreground">{item.date}</td>
                              <td className="px-4 py-4 text-sm font-semibold text-primary">
                                {formatCurrency(item.amount)}
                              </td>
                              <td className="px-4 py-4 text-sm text-muted-foreground">{item.purpose}</td>
                              <td className="hidden px-4 py-4 text-sm text-muted-foreground sm:table-cell">{item.method}</td>
                              <td className="px-4 py-4">
                                <Button
                                  size="sm"
                                  onClick={() => console.info('Refund', item.id)}
                                  className="w-fit bg-foreground text-background hover:bg-foreground/90"
                                >
                                  Refund
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
          </Card>

          {/* Family Members Section - Only shown for HOH members */}
          {isHOH && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-foreground">Family Members</h2>

              {familyMembersData.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {familyMembersData.map((member: FamilyMember) => (
                    <Card key={member.id} className="relative p-6">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-4 right-4"
                        onClick={() => handleRemoveFamilyMember(member.id)}
                        aria-label={`Remove ${member.name}`}
                        title={`Remove ${member.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>

                      <div className="mb-4 flex flex-col gap-3 pr-10">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="h-10 w-10 shrink-0">
                            {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} />}
                            <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold text-foreground">{member.name}</h3>
                            <Badge variant="outline" className="mt-1 text-xs">{member.relationship}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3 border-t border-border pt-4">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            {member.planName ?? 'No active membership'}
                          </p>
                          <Badge variant={getStatusColor(member.status)} className="mt-2">
                            {getStatusLabel(member.status)}
                          </Badge>
                        </div>
                        <p className="text-2xl font-bold text-primary">
                          {formatCurrency(member.planPrice ?? 0)}
                          {member.planFrequency
                            ? <span className="ml-1 text-sm font-normal text-muted-foreground">{`/ ${member.planFrequency}`}</span>
                            : null}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {familyMembersData.length === 0 && (
                <p className="text-sm text-muted-foreground">No family members linked yet.</p>
              )}

              {/* Add Family Member Card */}
              <Card className="border-2 border-dashed p-6">
                <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                  <div className="rounded-lg bg-secondary p-3">
                    <Plus className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground">Add Family Member</h3>
                  <p className="text-sm text-muted-foreground">Create a new family membership</p>
                  <Button variant="outline" className="mt-2" disabled={isLoadingPayment} onClick={() => setIsAddFamilyModalOpen(true)}>
                    Add Family Member
                  </Button>
                </div>
              </Card>
            </div>
          )}

        </div>
      )}

      {state.activeTab === 'attendance' && (
        <MemberDetailAttendance
          memberId={memberId}
          memberName={state.currentData.memberName}
          attendanceRecords={attendance}
          isLoading={isLoadingAttendance}
          punchcardInfo={currentMembership?.membershipPlan?.category === 'punchcard' ? MOCK_PUNCHCARD_INFO : null}
        />
      )}

      {state.activeTab === 'notes' && (
        <MemberDetailNotes
          memberId={memberId}
          memberName={state.currentData.memberName}
          notes={notes}
          isLoading={isLoadingNotes}
          onAddNote={handleAddNote}
          onEditNote={handleEditNote}
          onDeleteNote={handleDeleteNote}
        />
      )}

      {isAddFamilyModalOpen && hohMemberData && (
        <AddFamilyMembersModal
          isOpen={isAddFamilyModalOpen}
          onCloseAction={handleAddFamilyModalClose}
          hohMember={hohMemberData}
          availableCoupons={availableCoupons}
        />
      )}

      {conversionType && currentMember && (
        <ConvertMemberModal
          isOpen={isConvertModalOpen}
          onCloseAction={handleConvertModalClose}
          memberId={currentMember.id}
          memberName={`${currentMember.firstName || ''} ${currentMember.lastName || ''}`.trim()}
          memberEmail={currentMember.email || ''}
          currentMemberType={(currentMember.memberType as 'individual' | 'family-member' | 'head-of-household') || 'individual'}
          memberDateOfBirth={currentMember.dateOfBirth ? new Date(currentMember.dateOfBirth) : undefined}
          conversionType={conversionType}
          hasMembership={hasActiveMembership}
          hasPaymentMethod={paymentMethods.length > 0}
          currentHOHId={currentHOH?.id}
          currentHOHName={currentHOH?.name}
          availableCoupons={availableCoupons}
        />
      )}
    </div>
  );
}
