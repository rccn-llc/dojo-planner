'use client';

import { Edit, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type StaffCardProps = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  photoUrl: string | null;
  emailAddress: string;
  role: string;
  status: 'Active' | 'Invitation sent' | 'Inactive';
  formatText?: boolean;
  onEdit?: (() => void) | ((id: string) => void);
  onRemove?: (id: string) => void;
};

function getRoleColor(role: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (role === 'org:admin') {
    return 'default';
  }
  return 'outline';
}

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
  status: 'Active' | 'Invitation sent' | 'Inactive';
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

function formatRole(role: string): string {
  const roleMap: Record<string, string> = {
    'org:admin': 'Admin',
    'org:academy_owner': 'Academy Owner',
    'org:front_desk': 'Front Desk',
    'org:instructor': 'Instructor',
    'org:member': 'Member',
    'org:individual_member': 'Individual Member',
    'front-desk': 'Front Desk',
  };
  if (roleMap[role]) {
    return roleMap[role];
  }

  // Strip org: prefix, then capitalize words split by hyphens or underscores
  return role
    .replace(/^org:/, '')
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getInitials(firstName: string | null, lastName: string | null) {
  const first = firstName?.[0] ?? '';
  const last = lastName?.[0] ?? '';
  return (first + last).toUpperCase();
}

export function StaffCard({
  id,
  firstName,
  lastName,
  email,
  photoUrl,
  role,
  status,
  formatText = true,
  onEdit,
  onRemove,
}: StaffCardProps) {
  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Staff Name */}
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

        {/* Staff Details */}
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">Role</div>
            <div className="mt-1">
              <Badge variant={getRoleColor(role)}>
                {formatText ? formatRole(role) : role}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground">Status</div>
            <div className="mt-1">
              <StatusBadge status={status} formatStatus={formatText} />
            </div>
          </div>
        </div>

        {/* Actions */}
        {(onEdit || onRemove) && (
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Handle both signature types: () => void or (id: string) => void
                  if (onEdit.length === 0) {
                    (onEdit as () => void)();
                  } else {
                    (onEdit as (id: string) => void)(id);
                  }
                }}
                aria-label={`Edit ${firstName} ${lastName}`}
                title={`Edit ${firstName} ${lastName}`}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onRemove && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onRemove(id)}
                aria-label={`Remove ${firstName} ${lastName}`}
                title={`Remove ${firstName} ${lastName}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
