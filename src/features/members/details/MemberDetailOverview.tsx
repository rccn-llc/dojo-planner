'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type ContactInfo = {
  address?: string;
  phone?: string;
  email?: string;
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
  membershipType: string;
  status: 'active' | 'on-hold' | 'cancelled';
  amount: number;
};

type MemberDetailOverviewProps = {
  memberId: string;
  memberName: string;
  photoUrl?: string;
  billingContactRole: string;
  membershipBadge: string;
  amountOverdue: string;
  contactInfo: ContactInfo;
  subscriptionDetails: SubscriptionDetails;
  familyMembers: FamilyMember[];
  onEditDetails?: () => void;
  onAddFamilyMember?: () => void;
  onChangeMembership?: () => void;
  onHoldMembership?: () => void;
};

export function MemberDetailOverview({
  memberName,
  photoUrl,
  billingContactRole,
  membershipBadge,
  amountOverdue,
  contactInfo,
  subscriptionDetails,
  familyMembers,
  onEditDetails,
  onAddFamilyMember,
  onChangeMembership,
  onHoldMembership,
}: MemberDetailOverviewProps) {
  const t = useTranslations('MemberDetailOverview');

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.map(part => part[0]).join('').toUpperCase();
  };

  const getStatusColor = (status: 'active' | 'on-hold' | 'cancelled'): 'default' | 'secondary' | 'destructive' => {
    if (status === 'active') {
      return 'default';
    }
    if (status === 'on-hold') {
      return 'secondary';
    }
    return 'destructive';
  };

  const getStatusLabel = (status: 'active' | 'on-hold' | 'cancelled') => {
    if (status === 'on-hold') {
      return 'On Hold';
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div className="space-y-6">
      {/* Member Header */}
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {photoUrl && <AvatarImage src={photoUrl} alt={memberName} />}
          <AvatarFallback>{getInitials(memberName)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-foreground">{memberName}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{billingContactRole}</Badge>
            <Badge variant="default">{membershipBadge}</Badge>
            <Badge variant="destructive">{amountOverdue}</Badge>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contact Information */}
        <Card className="p-6">
          <h2 className="mb-6 text-lg font-semibold text-foreground">{t('contact_information')}</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('address_label')}</label>
              <p className="mt-1 text-foreground">{contactInfo.address || '-'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('phone_label')}</label>
              <p className="mt-1 text-foreground">{contactInfo.phone || '-'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('email_label')}</label>
              <p className="mt-1 text-foreground">{contactInfo.email || '-'}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-6 w-full justify-center"
            onClick={onEditDetails}
          >
            {t('edit_details_button')}
          </Button>
        </Card>

        {/* Subscription Details */}
        <Card className="p-6">
          <h2 className="mb-6 text-lg font-semibold text-foreground">{t('subscription_details')}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{subscriptionDetails.membershipType}</h3>
                <Badge variant={getStatusColor(subscriptionDetails.status)} className="mt-2">
                  {getStatusLabel(subscriptionDetails.status)}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">
                  $
                  {subscriptionDetails.amount}
                </p>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{t('past_due_payments')}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{subscriptionDetails.lastPayment}</p>
                </div>
                <p className="text-2xl font-bold text-destructive">
                  $
                  {subscriptionDetails.pastDuePayments.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="default" onClick={onChangeMembership} className="flex-1">
              {t('change_membership_button')}
            </Button>
            <Button variant="destructive" onClick={onHoldMembership} className="flex-1">
              {t('hold_button')}
            </Button>
          </div>
        </Card>
      </div>

      {/* Family Members Section */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-foreground">{t('family_members')}</h2>

        {familyMembers.length > 0
          ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {familyMembers.map(member => (
                  <Card key={member.id} className="p-6">
                    <div className="mb-4 flex flex-col gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-10 shrink-0">
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
                        <p className="text-xs font-semibold text-muted-foreground">{member.membershipType}</p>
                        <Badge variant={getStatusColor(member.status)} className="mt-2">
                          {getStatusLabel(member.status)}
                        </Badge>
                      </div>
                      <p className="text-2xl font-bold text-primary">
                        $
                        {member.amount}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )
          : null}

        {/* Add Family Member Card */}
        <Card className="border-2 border-dashed p-6">
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="rounded-lg bg-secondary p-3">
              <Plus className="size-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground">{t('add_family_member')}</h3>
            <p className="text-sm text-muted-foreground">{t('create_new_family_membership')}</p>
            <Button variant="outline" onClick={onAddFamilyMember} className="mt-2">
              {t('add_family_member')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
