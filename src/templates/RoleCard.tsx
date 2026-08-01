'use client';

import { Edit, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Permission = {
  id: string;
  key: string;
  name: string;
  description: string;
};

type RoleCardProps = {
  id: string;
  name: string;
  roleKey: string;
  description: string;
  permissions: Permission[];
  memberCount: number;
  isSystemRole?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
};

export function RoleCard({
  id,
  name,
  roleKey,
  description,
  permissions,
  memberCount,
  isSystemRole = false,
  onEdit,
  onDelete,
}: RoleCardProps) {
  const t = useTranslations('RoleCard');

  return (
    <Card className="relative p-6">
      <div className="space-y-4">
        {/* Header with Title and Key Badge */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
            <Badge variant="outline" className="mt-1">
              {roleKey}
            </Badge>
          </div>
          {isSystemRole && (
            <Badge className="bg-blue-500 text-white hover:bg-blue-600">
              {t('system_role_badge')}
            </Badge>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground">{description}</p>

        {/* Permissions List */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">
            {t('permissions_label')}
            {' '}
            <span className="font-normal text-muted-foreground">
              (
              {permissions.length}
              )
            </span>
          </span>
          {permissions.length > 0
            ? (
                <div className="space-y-1.5">
                  {permissions.map(permission => (
                    <div
                      key={permission.id}
                      className="flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
                    >
                      <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {permission.key}
                      </code>
                      <span className="text-xs text-foreground" title={permission.description}>
                        {permission.name}
                      </span>
                    </div>
                  ))}
                </div>
              )
            : (
                <p className="text-sm text-muted-foreground">
                  {t('no_permissions')}
                </p>
              )}
        </div>

        {/* Footer Stats and Actions */}
        <div className="flex items-end justify-between border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              {memberCount}
              {' '}
              {memberCount === 1
                ? t('member_singular')
                : t('member_plural')}
            </p>
          </div>
          <div className="flex gap-2">
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
            {onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(id)}
                aria-label={t('delete_button_aria_label')}
                title={t('delete_button_aria_label')}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
