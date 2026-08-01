'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export type UserCardProps = {
  id: string;
  name: string;
  title: string;
  roles: string;
  status: 'Active' | 'Inactive' | 'Invitation sent';
  recentActivity: string;
  lastLoggedIn: string;
  avatar?: string;
  formatText?: boolean;
  onClick?: (id: string) => void;
  labels?: {
    roles?: string;
    status?: string;
    recentActivity?: string;
    lastLoggedIn?: string;
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
}: {
  status: 'Active' | 'Inactive' | 'Invitation sent';
  formatStatus?: boolean;
}) {
  const displayText = formatStatus ? formatText(status) : status;

  const getStatusColor = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'default';
      case 'inactive':
        return 'destructive';
      case 'invitation sent':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Badge variant={getStatusColor(status)}>
      {displayText}
    </Badge>
  );
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase();
}

// Default labels
const getDefaultLabels = () => ({
  roles: 'Roles',
  status: 'Status',
  recentActivity: 'Recent Activity',
  lastLoggedIn: 'Last Logged In',
});

export function UserCard({
  id,
  name,
  title,
  roles,
  status,
  recentActivity,
  lastLoggedIn,
  avatar,
  formatText = true,
  onClick,
  labels,
}: UserCardProps) {
  const defaultLabels = getDefaultLabels();
  const finalLabels = { ...defaultLabels, ...labels };
  return (
    <Card
      className={`p-4 ${onClick ? 'cursor-pointer hover:bg-secondary/30' : ''}`}
      onClick={onClick ? () => onClick(id) : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="space-y-4">
        {/* User Name and Avatar */}
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <Avatar className="size-10 shrink-0">
            {avatar && (
              <AvatarImage src={avatar} alt={name} />
            )}
            <AvatarFallback className="text-xs">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium text-foreground">{name}</div>
            <div className="text-xs text-muted-foreground">{title}</div>
          </div>
        </div>

        {/* User Details Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">{finalLabels.roles}</div>
            <div className="mt-1 text-sm text-foreground">{roles}</div>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground">{finalLabels.status}</div>
            <div className="mt-1">
              <StatusBadge status={status} formatStatus={formatText} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground">{finalLabels.recentActivity}</div>
            <div className="mt-1 text-sm text-foreground">{recentActivity}</div>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground">{finalLabels.lastLoggedIn}</div>
            <div className="mt-1 text-sm text-foreground">{lastLoggedIn}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}
