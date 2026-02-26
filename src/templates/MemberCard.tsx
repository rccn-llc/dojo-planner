'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export type MemberCardProps = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  dateOfBirth: Date | null;
  photoUrl: string | null;
  lastAccessedAt: Date | null;
  status: string;
  memberType?: string | null;
  membershipType?: 'free' | 'free-trial' | 'monthly' | 'annual';
  amountDue?: string;
  nextPayment?: Date | null;
  formatText?: boolean;
  onClick?: (id: string) => void;
  labels?: {
    membership?: string;
    amountDue?: string;
    nextPayment?: string;
    lastVisited?: string;
  };
  formatters?: {
    currency?: (amount: string) => string;
    date?: (date: Date | null) => string;
    memberType?: (type: string | null | undefined) => string;
    membershipType?: (type: string) => string;
    status?: (status: string) => string;
  };
};

function formatText(text: string): string {
  // Split by spaces and capitalize each word
  return text
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function StatusBadge({
  status,
  formatStatus = true,
  formatter,
}: {
  status: string;
  formatStatus?: boolean;
  formatter?: (status: string) => string;
}) {
  const displayText = formatter ? formatter(status) : formatStatus ? formatText(status) : status;

  // Default status color logic - can be overridden by formatter
  const getStatusColor = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('active')) {
      return 'default';
    }
    if (lowerStatus.includes('inactive') || lowerStatus.includes('suspended')) {
      return 'destructive';
    }
    if (lowerStatus.includes('trial') || lowerStatus.includes('pending')) {
      return 'secondary';
    }
    return 'outline';
  };

  return (
    <Badge variant={getStatusColor(status)}>
      {displayText}
    </Badge>
  );
}

function MembershipBadge({
  membershipType,
  formatStatus = true,
  formatter,
}: {
  membershipType?: string;
  formatStatus?: boolean;
  formatter?: (type: string) => string;
}) {
  if (!membershipType) {
    return null;
  }

  const displayText = formatter
    ? formatter(membershipType)
    : formatStatus
      ? formatText(membershipType.replace('-', ' '))
      : membershipType;

  const getMembershipColor = (type: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (type) {
      case 'annual': return 'default';
      case 'monthly': return 'secondary';
      case 'free-trial': return 'outline';
      case 'free': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <Badge variant={getMembershipColor(membershipType)}>
      {displayText}
    </Badge>
  );
}

function getInitials(firstName: string | null, lastName: string | null) {
  const first = firstName?.[0] ?? '';
  const last = lastName?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}

function defaultCurrencyFormatter(amount: string): string {
  return amount || '$0.00';
}

function defaultDateFormatter(date: Date | null): string {
  if (!date) {
    return 'Never';
  }
  return date.toLocaleDateString();
}

// Default labels
const getDefaultLabels = () => ({
  membership: 'Membership',
  amountDue: 'Amount Due',
  nextPayment: 'Next Payment',
  lastVisited: 'Last Visited',
});

const defaultFormatters = {
  currency: defaultCurrencyFormatter,
  date: defaultDateFormatter,
};

export function MemberCard({
  id,
  firstName,
  lastName,
  email,
  photoUrl,
  memberType,
  amountDue,
  nextPayment,
  lastAccessedAt,
  status,
  formatText = true,
  onClick,
  labels,
  formatters = defaultFormatters,
}: MemberCardProps) {
  const defaultLabels = getDefaultLabels();
  const finalLabels = { ...defaultLabels, ...labels };
  return (
    <Card
      className={`p-4 transition-colors ${onClick ? 'cursor-pointer hover:bg-secondary/30' : ''}`}
      onClick={onClick ? () => onClick(id) : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="space-y-4">
        {/* Member Name */}
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <Avatar className="h-10 w-10 shrink-0">
            {photoUrl && (
              <AvatarImage src={photoUrl} alt={`${firstName} ${lastName}`} />
            )}
            <AvatarFallback>
              {getInitials(firstName, lastName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium text-foreground">
              {firstName}
              {' '}
              {lastName}
            </div>
            <div className="text-xs text-muted-foreground">{email}</div>
          </div>
        </div>

        {/* Member Details Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">{finalLabels.membership}</div>
            <div className="mt-1">
              {formatters.memberType
                ? (
                    <Badge variant="secondary">
                      {formatters.memberType(memberType)}
                    </Badge>
                  )
                : (
                    <MembershipBadge
                      membershipType={memberType || undefined}
                      formatStatus={formatText}
                      formatter={formatters.membershipType}
                    />
                  )}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground">{finalLabels.amountDue}</div>
            <div className="mt-1 text-sm text-foreground">
              {formatters.currency?.(amountDue || '')}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground">{finalLabels.nextPayment}</div>
            <div className="mt-1 text-sm text-foreground">
              {formatters.date?.(nextPayment ?? null)}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground">{finalLabels.lastVisited}</div>
            <div className="mt-1 text-sm text-foreground">
              {formatters.date?.(lastAccessedAt)}
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="border-t border-border pt-4">
          <StatusBadge
            status={status}
            formatStatus={formatText}
            formatter={formatters.status}
          />
        </div>
      </div>
    </Card>
  );
}
