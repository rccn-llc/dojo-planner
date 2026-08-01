'use client';

import { Download, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type BillingType = 'autopay' | 'one-time';

type MembershipDetailsData = {
  status: 'active' | 'on-hold' | 'cancelled';
  program: string;
  membershipType: string;
  membershipFee: number;
  paymentFrequency: string;
  registrationDate: string;
  startDate: string;
  firstPaymentDate?: string;
  nextPaymentDate: string;
  nextPaymentAmount: number;
  billingType?: BillingType;
};

type PaymentMethod = {
  last4: string;
  brand: string;
  isDefault: boolean;
};

type Agreement = {
  signedDate: string;
  status: 'signed' | 'unsigned' | 'expired';
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

type MemberDetailFinancialProps = {
  memberId: string;
  memberName: string;
  photoUrl?: string;
  billingContactRole: string;
  membershipBadge: string;
  amountOverdue: string;
  membershipDetails: MembershipDetailsData;
  paymentMethod: PaymentMethod;
  agreement: Agreement;
  billingHistory: BillingHistoryItem[];
  hideHeader?: boolean;
  onChangeMembership?: () => void;
  onSendSecureLink?: () => void;
  onDownloadAgreement?: () => void;
  onRefund?: (itemId: string) => void;
};

export function MemberDetailFinancial({
  memberName,
  photoUrl,
  billingContactRole,
  membershipBadge,
  amountOverdue,
  membershipDetails,
  paymentMethod,
  agreement,
  billingHistory,
  hideHeader,
  onChangeMembership,
  onSendSecureLink,
  onDownloadAgreement,
  onRefund,
}: MemberDetailFinancialProps) {
  const t = useTranslations('MemberDetailFinancial');

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getBrandIcon = (brand: string) => {
    const iconMap: Record<string, string> = {
      visa: '💳',
      mastercard: '💳',
      amex: '💳',
      discover: '💳',
    };
    return iconMap[brand.toLowerCase()] || '💳';
  };

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <>
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
        </>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Membership Details */}
        <Card className="flex flex-col p-6">
          <div>
            <h2 className="mb-6 text-lg font-semibold text-foreground">{t('membership_details')}</h2>
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('status_label')}</p>
                </div>
                <Badge variant={getStatusColor(membershipDetails.status)}>
                  {getStatusLabel(membershipDetails.status)}
                </Badge>
              </div>
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">{t('program_label')}</p>
                <p className={`text-right text-sm ${membershipDetails.program === 'N/A' ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {membershipDetails.program}
                </p>
              </div>
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">{t('membership_type_label')}</p>
                <p className={`text-right text-sm ${membershipDetails.membershipType === 'N/A' ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {membershipDetails.membershipType}
                </p>
              </div>
              {membershipDetails.membershipFee > 0 && (
                <div className="flex items-start justify-between">
                  <p className="text-sm text-muted-foreground">{t('membership_fee_label')}</p>
                  <p className="text-right text-sm font-semibold text-foreground">
                    {formatCurrency(membershipDetails.membershipFee)}
                  </p>
                </div>
              )}
              {membershipDetails.paymentFrequency !== 'N/A' && (
                <div className="flex items-start justify-between">
                  <p className="text-sm text-muted-foreground">{t('payment_frequency_label')}</p>
                  <p className="text-right text-sm text-foreground">{membershipDetails.paymentFrequency}</p>
                </div>
              )}
              {membershipDetails.billingType && membershipDetails.paymentFrequency !== 'N/A' && (
                <div className="flex items-start justify-between">
                  <p className="text-sm text-muted-foreground">{t('billing_type_label')}</p>
                  <div className="flex items-center gap-2">
                    {membershipDetails.billingType === 'autopay' && (
                      <RefreshCw className="size-3 text-primary" />
                    )}
                    <Badge variant={membershipDetails.billingType === 'autopay' ? 'default' : 'secondary'}>
                      {membershipDetails.billingType === 'autopay' ? t('billing_type_autopay') : t('billing_type_onetime')}
                    </Badge>
                  </div>
                </div>
              )}
              <div className="flex items-start justify-between border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">{t('registration_date_label')}</p>
                <p className="text-right text-sm text-foreground">{membershipDetails.registrationDate}</p>
              </div>
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">{t('start_date_label')}</p>
                <p className="text-right text-sm text-foreground">{membershipDetails.startDate}</p>
              </div>
              {membershipDetails.firstPaymentDate && (
                <div className="flex items-start justify-between">
                  <p className="text-sm text-muted-foreground">{t('first_payment_date_label')}</p>
                  <p className="text-right text-sm text-foreground">{membershipDetails.firstPaymentDate}</p>
                </div>
              )}
              {membershipDetails.nextPaymentDate !== 'N/A' && membershipDetails.billingType === 'autopay' && (
                <div className="flex items-start justify-between">
                  <p className="text-sm text-muted-foreground">{t('next_payment_date_label')}</p>
                  <p className="text-right text-sm text-foreground">{membershipDetails.nextPaymentDate}</p>
                </div>
              )}
              {membershipDetails.nextPaymentAmount > 0 && membershipDetails.billingType === 'autopay' && (
                <div className="flex items-start justify-between">
                  <p className="text-sm text-muted-foreground">{t('next_payment_amount_label')}</p>
                  <p className="text-right text-sm font-semibold text-foreground">
                    {formatCurrency(membershipDetails.nextPaymentAmount)}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="mt-auto flex justify-end pt-6">
            <Button
              onClick={onChangeMembership}
              className="w-fit bg-foreground text-background hover:bg-foreground/90"
            >
              {t('change_membership_button')}
            </Button>
          </div>
        </Card>

        {/* Payment Method & Agreement */}
        <div className="space-y-6">
          {/* Payment Method */}
          <Card className="flex flex-col p-6">
            <div>
              <h2 className="mb-6 text-lg font-semibold text-foreground">{t('payment_method')}</h2>
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-blue-600 p-3">
                  <span className="text-2xl">{getBrandIcon(paymentMethod.brand)}</span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">
                    {paymentMethod.brand.toUpperCase()}
                    {' '}
                    •••• •••• ••••
                    {paymentMethod.last4}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {paymentMethod.isDefault ? t('default_payment_method') : ''}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-auto flex justify-end pt-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={onSendSecureLink}
                className="h-auto w-fit p-0 text-blue-600 hover:bg-transparent hover:text-blue-700"
              >
                {t('send_secure_link_button')}
              </Button>
            </div>
          </Card>

          {/* Agreement & Waiver */}
          <Card className="flex flex-col border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950">
            <div>
              <h2 className="mb-2 text-lg font-semibold text-foreground">{t('agreement_waiver')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('signed_on')}
                {' '}
                {agreement.signedDate}
              </p>
            </div>
            <div className="mt-auto flex justify-end pt-6">
              <Button
                size="sm"
                onClick={onDownloadAgreement}
                className="w-fit gap-2 bg-foreground text-background hover:bg-foreground/90"
              >
                <Download className="size-4" />
                {t('download_button')}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Billing History */}
      <Card className="p-6">
        <h2 className="mb-6 text-lg font-semibold text-foreground">{t('billing_history')}</h2>
        {billingHistory.length === 0
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
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('member_column')}</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('date_column')}</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('amount_column')}</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('purpose_column')}</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('method_column')}</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('actions_column')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingHistory.flatMap((item) => {
                      if (item.groupType === 'family' && item.children && item.children.length > 0) {
                        return [
                          // Parent Family Membership Row
                          <tr key={item.id} className="border-b border-border hover:bg-secondary/30">
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">{item.member}</span>
                              </div>
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">{item.date}</td>
                            <td className="p-4 text-sm font-semibold text-primary">
                              {formatCurrency(item.amount)}
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">{item.purpose}</td>
                            <td className="p-4 text-sm text-muted-foreground">{item.method}</td>
                            <td className="p-4">
                              <Button
                                size="sm"
                                onClick={() => onRefund?.(item.id)}
                                className="w-fit bg-foreground text-background hover:bg-foreground/90"
                              >
                                {t('refund_button')}
                              </Button>
                            </td>
                          </tr>,
                          // Child Membership Rows
                          ...item.children.map(child => (
                            <tr key={child.id} className="border-b border-border bg-secondary/20">
                              <td className="p-4 pl-8 text-sm text-muted-foreground">
                                {child.member}
                              </td>
                              <td className="p-4 text-sm text-muted-foreground" />
                              <td className="p-4 text-sm text-muted-foreground">
                                {formatCurrency(child.amount)}
                              </td>
                              <td className="p-4 text-sm text-muted-foreground">{child.purpose}</td>
                              <td className="p-4 text-sm text-muted-foreground" />
                              <td className="p-4" />
                            </tr>
                          )),
                        ];
                      }

                      return [
                        <tr key={item.id} className="border-b border-border hover:bg-secondary/30">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">{item.member}</span>
                            </div>
                          </td>
                          <td className="p-4 text-sm text-muted-foreground">{item.date}</td>
                          <td className="p-4 text-sm font-semibold text-primary">
                            {formatCurrency(item.amount)}
                          </td>
                          <td className="p-4 text-sm text-muted-foreground">{item.purpose}</td>
                          <td className="p-4 text-sm text-muted-foreground">{item.method}</td>
                          <td className="p-4">
                            <Button
                              size="sm"
                              onClick={() => onRefund?.(item.id)}
                              className="w-fit bg-foreground text-background hover:bg-foreground/90"
                            >
                              {t('refund_button')}
                            </Button>
                          </td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </Card>
    </div>
  );
}
