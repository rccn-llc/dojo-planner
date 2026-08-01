'use client';

import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type MembershipStatus = 'Active' | 'Inactive' | 'Trial';

export type MembershipCardProps = {
  id: string;
  name: string;
  category: string;
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
  onEdit?: (id: string) => void;
};

function StatusBadge({ status }: { status: MembershipStatus }) {
  const t = useTranslations('MembershipCard');

  if (status === 'Active') {
    return (
      <Badge className="bg-green-500 text-white hover:bg-green-600">
        {t('status_active')}
      </Badge>
    );
  }
  if (status === 'Inactive') {
    return (
      <Badge className="bg-red-500 text-white hover:bg-red-600">
        {t('status_inactive')}
      </Badge>
    );
  }
  return <Badge>{status}</Badge>;
}

function TrialBadge() {
  const t = useTranslations('MembershipCard');

  return (
    <Badge className="bg-amber-500 text-gray-900 hover:bg-amber-600">
      {t('trial_badge')}
    </Badge>
  );
}

function MonthlyBadge() {
  const t = useTranslations('MembershipCard');

  return (
    <Badge className="bg-blue-500 text-white hover:bg-blue-600">
      {t('monthly_badge')}
    </Badge>
  );
}

function PunchcardBadge() {
  const t = useTranslations('MembershipCard');

  return (
    <Badge className="bg-violet-500 text-white hover:bg-violet-600">
      {t('punchcard_badge')}
    </Badge>
  );
}

export function MembershipCard({
  id,
  name,
  category,
  status,
  isTrial = false,
  isMonthly = false,
  isPunchcard = false,
  price,
  signupFee,
  frequency,
  contract,
  access,
  activeCount,
  revenue,
  onEdit,
}: MembershipCardProps) {
  const t = useTranslations('MembershipCard');

  const activeLabel = isTrial ? t('active_trials') : t('active_members');

  return (
    <Card className="relative p-6">
      <div className="space-y-4">
        {/* Header with Title and Badges */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-bold">{t('program_prefix')}</span>
              {' '}
              {category}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusBadge status={status} />
            {isTrial && <TrialBadge />}
            {isMonthly && <MonthlyBadge />}
            {isPunchcard && <PunchcardBadge />}
          </div>
        </div>

        {/* Price and Signup Fee */}
        <div>
          <p className="text-2xl font-bold text-foreground">{price}</p>
          <p className="text-sm text-muted-foreground">{signupFee}</p>
        </div>

        {/* Details Grid */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">
              {t('frequency_label')}
            </span>
            <span className="text-sm font-medium text-foreground">
              {frequency}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">
              {t('contract_label')}
            </span>
            <span className="text-sm font-medium text-foreground">
              {contract}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">
              {t('access_label')}
            </span>
            <span className="text-sm font-medium text-foreground">
              {access}
            </span>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="flex items-end justify-between border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              {activeCount}
              {' '}
              {activeLabel}
            </p>
            <p className="text-sm text-muted-foreground">{revenue}</p>
          </div>
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(id)}
              aria-label={t('edit_button_aria_label')}
              title={t('edit_button_aria_label')}
            >
              <Edit className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
