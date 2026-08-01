'use client';

import type { AddMemberWizardData } from '@/hooks/useAddMemberWizard';
import { CreditCard, Landmark, Loader2, Search, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dedupeRequest } from '@/hooks/dedupeRequest';
import { client } from '@/libs/Orpc';
import { rankMembersByQuery } from '@/utils/MemberSearch';

type HOHMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  status: string | null;
};

type HOHSelectionStepProps = {
  data: AddMemberWizardData;
  onUpdate: (updates: Partial<AddMemberWizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  isLoading?: boolean;
};

export const HOHSelectionStep = ({
  data,
  onUpdate,
  onNext,
  onBack,
  onCancel,
  isLoading = false,
}: HOHSelectionStepProps) => {
  const t = useTranslations('AddMemberWizard.HOHSelectionStep');
  const [searchQuery, setSearchQuery] = useState('');
  const [hohMembers, setHohMembers] = useState<HOHMember[]>([]);
  const [loadingHOH, setLoadingHOH] = useState(true);
  const [loadingPayment, setLoadingPayment] = useState(false);

  // Fetch HOH members on mount
  useEffect(() => {
    dedupeRequest(`member.searchHOH:${JSON.stringify({})}`, async () => client.member.searchHOH({}))
      .then((result) => {
        setHohMembers(result.members as HOHMember[]);
      })
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[HOHSelectionStep] Failed to fetch HOH members:', err);
        }
        setHohMembers([]);
      })
      .finally(() => {
        setLoadingHOH(false);
      });
  }, []);

  // Filter + rank by search query (#244) — prefix-priority, alphabetical.
  const filteredMembers = useMemo(
    () => rankMembersByQuery(hohMembers, searchQuery),
    [hohMembers, searchQuery],
  );

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  };

  const handleSelectHOH = useCallback(async (member: HOHMember) => {
    // Set HOH selection immediately
    onUpdate({
      hohMemberId: member.id,
      hohMemberName: `${member.firstName} ${member.lastName}`,
      hohMemberEmail: member.email,
      hohHasPaymentMethod: undefined,
      hohPaymentMethodLast4: undefined,
      hohPaymentMethodType: undefined,
    });

    // Fetch HOH's payment methods
    setLoadingPayment(true);
    try {
      const result = await client.member.getHOHPaymentMethods({ hohMemberId: member.id });
      const paymentMethods = result.paymentMethods;

      if (paymentMethods && paymentMethods.length > 0) {
        const primary = paymentMethods[0]!;
        onUpdate({
          hohMemberId: member.id,
          hohMemberName: `${member.firstName} ${member.lastName}`,
          hohMemberEmail: member.email,
          hohHasPaymentMethod: true,
          hohPaymentMethodLast4: primary.last4 || undefined,
          hohPaymentMethodType: primary.type === 'bank_transfer' ? 'ach' : 'card',
        });
      } else {
        onUpdate({
          hohMemberId: member.id,
          hohMemberName: `${member.firstName} ${member.lastName}`,
          hohMemberEmail: member.email,
          hohHasPaymentMethod: false,
          hohPaymentMethodLast4: undefined,
          hohPaymentMethodType: undefined,
        });
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[HOHSelectionStep] Failed to fetch HOH payment methods:', err);
      }
      onUpdate({
        hohHasPaymentMethod: false,
        hohPaymentMethodLast4: undefined,
        hohPaymentMethodType: undefined,
      });
    } finally {
      setLoadingPayment(false);
    }
  }, [onUpdate]);

  const isSelected = !!data.hohMemberId;
  const canProceed = isSelected && !loadingPayment;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('search_placeholder')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10"
          disabled={isLoading || loadingHOH}
        />
      </div>

      {/* HOH List */}
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {loadingHOH && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loadingHOH && hohMembers.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">{t('no_hoh_found')}</p>
          </div>
        )}

        {!loadingHOH && hohMembers.length > 0 && filteredMembers.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">{t('no_search_results')}</p>
          </div>
        )}

        {filteredMembers.map(member => (
          <button
            key={member.id}
            type="button"
            onClick={() => handleSelectHOH(member)}
            disabled={isLoading || loadingPayment}
            className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${
              data.hohMemberId === member.id
                ? 'border-primary bg-primary/5'
                : 'border-border bg-background hover:border-primary/50 hover:bg-accent/50'
            } ${isLoading || loadingPayment ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Avatar className="size-10 shrink-0">
              {member.photoUrl && <AvatarImage src={member.photoUrl} alt={`${member.firstName} ${member.lastName}`} />}
              <AvatarFallback>{getInitials(member.firstName, member.lastName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {member.firstName}
                {' '}
                {member.lastName}
              </p>
              <p className="truncate text-sm text-muted-foreground">{member.email}</p>
            </div>
            {data.hohMemberId === member.id && (
              <Badge variant="default" className="shrink-0">
                <UserCheck className="mr-1 size-3" />
                {t('selected_label')}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Selected HOH payment info */}
      {isSelected && !loadingPayment && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-1 text-sm font-medium">{t('payment_method_label')}</p>
          {data.hohHasPaymentMethod
            ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {data.hohPaymentMethodType === 'ach'
                    ? <Landmark className="size-4" />
                    : <CreditCard className="size-4" />}
                  {t('payment_method_value', {
                    type: data.hohPaymentMethodType === 'ach' ? 'ACH' : 'Card',
                    last4: data.hohPaymentMethodLast4 || '****',
                  })}
                </div>
              )
            : (
                <p className="text-sm text-muted-foreground">{t('no_payment_method')}</p>
              )}
        </div>
      )}

      {loadingPayment && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading payment information...
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between gap-3 pt-6">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} disabled={isLoading || loadingPayment}>
            {t('back_button')}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isLoading || loadingPayment}>
            {t('cancel_button')}
          </Button>
        </div>
        <Button onClick={onNext} disabled={!canProceed || isLoading}>
          {t('next_button')}
        </Button>
      </div>
    </div>
  );
};
