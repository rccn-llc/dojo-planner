'use client';

import type { EventBilling } from '@/hooks/useEventsCache';
import { Loader2, Search, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { dedupeRequest } from '@/hooks/dedupeRequest';
import { client } from '@/libs/Orpc';
import { rankMembersByQuery } from '@/utils/MemberSearch';

type EnrollMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  status: string;
};

type EnrollMemberModalProps = {
  isOpen: boolean;
  eventId: string;
  eventName: string;
  billingTiers: EventBilling[];
  onCloseAction: () => void;
  onEnrolledAction: () => void;
};

function initials(firstName: string, lastName: string) {
  return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
}

const NO_TIER = 'none';

export function EnrollMemberModal({
  isOpen,
  eventId,
  eventName,
  billingTiers,
  onCloseAction,
  onEnrolledAction,
}: EnrollMemberModalProps) {
  const t = useTranslations('EventDetailPage.EnrollMemberModal');

  const [members, setMembers] = useState<EnrollMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<EnrollMember | null>(null);
  const [tierId, setTierId] = useState<string>(NO_TIER);
  const [chargeCard, setChargeCard] = useState(false);
  const [hasSavedCard, setHasSavedCard] = useState(false);
  const [savedCardType, setSavedCardType] = useState<'card' | 'ach' | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks the open transition so we reset form state exactly once per open,
  // during render (React supports setState-during-render to derive from props;
  // it bails out without an extra commit) rather than via a setState cascade in
  // an effect.
  const [wasOpen, setWasOpen] = useState(false);

  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setSearchQuery('');
    setSelected(null);
    setTierId(NO_TIER);
    setChargeCard(false);
    setHasSavedCard(false);
    setSavedCardType(null);
    setError(null);
    setSubmitting(false);
    setLoadingMembers(true);
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  // Fetch the member list once each time the modal opens.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    dedupeRequest('members.list', async () => client.members.list())
      .then((result) => {
        if (!cancelled) {
          setMembers(result.members as EnrollMember[]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMembers([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMembers(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Prefix-priority, alphabetically-ordered member search (#244).
  const filteredMembers = useMemo(
    () => rankMembersByQuery(members, searchQuery),
    [members, searchQuery],
  );

  const selectedTier = useMemo(
    () => (tierId === NO_TIER ? null : billingTiers.find(b => b.id === tierId) ?? null),
    [tierId, billingTiers],
  );
  const tierPrice = selectedTier?.price ?? 0;

  const handleSelectMember = useCallback(async (member: EnrollMember) => {
    setSelected(member);
    setError(null);
    setChargeCard(false);
    setHasSavedCard(false);
    setSavedCardType(null);
    setLoadingPayment(true);
    try {
      const result = await client.member.listPaymentMethods({ memberId: member.id });
      const pm = result.paymentMethods?.[0];
      if (pm) {
        setHasSavedCard(true);
        setSavedCardType(pm.type === 'bank_transfer' ? 'ach' : 'card');
      }
    } catch {
      setHasSavedCard(false);
    } finally {
      setLoadingPayment(false);
    }
  }, []);

  const canCharge = hasSavedCard && tierPrice > 0;

  const handleSubmit = async () => {
    if (!selected) {
      return;
    }
    setSubmitting(true);
    setError(null);

    let transactionId: string | null = null;
    const willCharge = chargeCard && canCharge;

    try {
      if (willCharge) {
        const paymentResult = await client.payment.process({
          memberId: selected.id,
          memberEmail: selected.email,
          memberFirstName: selected.firstName,
          memberLastName: selected.lastName,
          ...(selected.phone ? { memberPhone: selected.phone } : {}),
          paymentMethod: savedCardType === 'ach' ? 'ach' : 'card',
          paymentMethodSource: 'saved',
          billingType: 'one-time',
          amount: tierPrice,
          description: t('charge_description', { eventName }),
          isTaxable: true,
        });

        if (!paymentResult.success) {
          setError(paymentResult.declineReason || paymentResult.error || t('charge_failed'));
          setSubmitting(false);
          return;
        }
        transactionId = paymentResult.transactionId ?? null;
      }

      await client.events.register({
        eventId,
        memberId: selected.id,
        eventBillingId: selectedTier?.id ?? null,
        amountPaid: willCharge ? tierPrice : (selectedTier ? tierPrice : null),
        ...(transactionId ? { transactionId } : {}),
      });

      onEnrolledAction();
      onCloseAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('enroll_failed');
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCloseAction()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { eventName })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Member search + list */}
          <div className="space-y-2">
            <Label>{t('member_label')}</Label>
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('search_placeholder')}
                className="pl-9"
              />
            </div>

            {loadingMembers
              ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )
              : (
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {filteredMembers.length === 0
                      ? <p className="py-4 text-center text-sm text-muted-foreground">{t('no_members')}</p>
                      : filteredMembers.map(member => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => handleSelectMember(member)}
                            className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                              selected?.id === member.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                            }`}
                          >
                            <Avatar className="size-9">
                              <AvatarImage src={member.photoUrl ?? undefined} alt={`${member.firstName} ${member.lastName}`} />
                              <AvatarFallback>{initials(member.firstName, member.lastName)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {member.firstName}
                                {' '}
                                {member.lastName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                            </div>
                            {selected?.id === member.id && (
                              <Badge variant="secondary" className="shrink-0">
                                <UserCheck className="mr-1 size-3" />
                                {t('selected')}
                              </Badge>
                            )}
                          </button>
                        ))}
                  </div>
                )}
          </div>

          {/* Tier selection */}
          {billingTiers.length > 0 && (
            <div className="space-y-2">
              <Label>{t('tier_label')}</Label>
              <Select value={tierId} onValueChange={setTierId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TIER}>{t('tier_none')}</SelectItem>
                  {billingTiers.map(tier => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name}
                      {' — $'}
                      {tier.price.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Charge toggle */}
          {selected && (
            <div className="rounded-lg border border-border p-3">
              {loadingPayment
                ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      {t('checking_payment')}
                    </div>
                  )
                : canCharge
                  ? (
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id="charge-card"
                          checked={chargeCard}
                          onCheckedChange={checked => setChargeCard(checked === true)}
                        />
                        <div className="grid gap-0.5">
                          <Label htmlFor="charge-card" className="cursor-pointer">
                            {t('charge_saved_card', { amount: tierPrice.toFixed(2) })}
                          </Label>
                          <p className="text-xs text-muted-foreground">{t('charge_hint')}</p>
                        </div>
                      </div>
                    )
                  : (
                      <p className="text-sm text-muted-foreground">
                        {tierPrice > 0 ? t('no_saved_card') : t('free_registration')}
                      </p>
                    )}
            </div>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCloseAction} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!selected || submitting || loadingPayment}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {chargeCard && canCharge ? t('enroll_and_charge') : t('enroll')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
