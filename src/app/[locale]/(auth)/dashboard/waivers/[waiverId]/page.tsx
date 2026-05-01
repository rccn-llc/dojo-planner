'use client';

import type { WaiverMergeField, WaiverTemplate } from '@/services/WaiversService';
import { format } from 'date-fns';
import { ArrowLeft, Edit, Eye, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DeleteWaiverAlertDialog } from '@/features/waivers/details/DeleteWaiverAlertDialog';
import { EditWaiverBasicsModal } from '@/features/waivers/details/EditWaiverBasicsModal';
import { EditWaiverContentModal } from '@/features/waivers/details/EditWaiverContentModal';
import { EditWaiverMembershipsModal } from '@/features/waivers/details/EditWaiverMembershipsModal';
import { ViewVersionModal } from '@/features/waivers/details/ViewVersionModal';
import { client } from '@/libs/Orpc';

type MembershipPlanSummary = {
  id: string;
  name: string;
};

export default function WaiverDetailPage() {
  const t = useTranslations('WaiverDetailPage');
  const router = useRouter();
  const params = useParams();
  const waiverId = params.waiverId as string;

  const [waiver, setWaiver] = useState<WaiverTemplate | null>(null);
  const [memberships, setMemberships] = useState<MembershipPlanSummary[]>([]);
  const [mergeFields, setMergeFields] = useState<WaiverMergeField[]>([]);
  const [versions, setVersions] = useState<WaiverTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isEditBasicsOpen, setIsEditBasicsOpen] = useState(false);
  const [isEditContentOpen, setIsEditContentOpen] = useState(false);
  const [isEditMembershipsOpen, setIsEditMembershipsOpen] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<WaiverTemplate | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchWaiver = useCallback(async () => {
    try {
      setIsLoading(true);
      const [waiverResult, mergeFieldsResult, versionsResult] = await Promise.all([
        client.waivers.getTemplate({ id: waiverId }),
        client.waivers.listMergeFields(),
        client.waivers.listTemplateVersions({ id: waiverId }),
      ]);
      setWaiver(waiverResult.template);
      setMemberships(waiverResult.memberships);
      setMergeFields(mergeFieldsResult.mergeFields);
      setVersions(versionsResult.versions);
    } catch (err) {
      console.error('Failed to fetch waiver:', err);
      setError(t('error_loading'));
    } finally {
      setIsLoading(false);
    }
  }, [waiverId, t]);

  useEffect(() => {
    fetchWaiver();
  }, [fetchWaiver]);

  const handleBack = useCallback(() => {
    router.push('/dashboard/waivers');
  }, [router]);

  const handleDelete = useCallback(() => {
    setIsDeleteOpen(true);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setIsDeleteOpen(false);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (isDeleting) {
      return;
    }
    setIsDeleting(true);
    try {
      await client.waivers.deleteTemplate({ id: waiverId });
      setIsDeleteOpen(false);
      router.push('/dashboard/waivers');
    } catch (err) {
      console.error('Failed to delete waiver:', err);
      setError(t('error_deleting'));
      setIsDeleteOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, waiverId, router, t]);

  // Resolve placeholders for preview using dynamic merge fields
  // Returns React nodes with highlighted merge field values
  const resolvedContentNodes = useMemo(() => {
    if (!waiver) {
      return null;
    }

    // Build a combined regex matching all merge field placeholders
    if (mergeFields.length === 0) {
      return waiver.content;
    }

    const fieldMap = new Map(mergeFields.map(f => [f.key.toLowerCase(), f.defaultValue]));
    const pattern = new RegExp(
      `(${mergeFields.map(f => `<${f.key}>`).join('|')})`,
      'gi',
    );
    const parts = waiver.content.split(pattern);

    let mergeFieldCounter = 0;
    return parts.map((part) => {
      const match = part.match(/^<(.+)>$/);
      if (match) {
        const value = fieldMap.get(match[1]!.toLowerCase());
        if (value !== undefined) {
          mergeFieldCounter += 1;
          return (
            <mark key={`mf-${match[1]}-${mergeFieldCounter}`} className="rounded bg-yellow-200 px-0.5 font-bold dark:bg-yellow-800">
              {value}
            </mark>
          );
        }
      }
      return part;
    });
  }, [waiver, mergeFields]);

  // Save handlers
  const handleSaveBasics = useCallback(async (data: {
    name: string;
    description: string | null;
    isActive: boolean;
    isDefault: boolean;
    requiresGuardian: boolean;
    guardianAgeThreshold: number;
  }) => {
    await client.waivers.updateTemplate({ id: waiverId, ...data });
    await fetchWaiver();
    setIsEditBasicsOpen(false);
  }, [waiverId, fetchWaiver]);

  const handleSaveContent = useCallback(async (data: { name: string; content: string }) => {
    await client.waivers.updateTemplate({ id: waiverId, ...data });
    await fetchWaiver();
    setIsEditContentOpen(false);
  }, [waiverId, fetchWaiver]);

  const handleSaveMemberships = useCallback(async (membershipIds: string[]) => {
    await client.waivers.setMembershipWaivers({
      membershipPlanId: waiverId,
      waiverTemplateIds: membershipIds,
    });
    await fetchWaiver();
    setIsEditMembershipsOpen(false);
  }, [waiverId, fetchWaiver]);

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton className="h-96" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !waiver) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">{error || t('waiver_not_found')}</p>
        <Button variant="outline" onClick={handleBack} className="mt-4">
          <ArrowLeft className="mr-2 size-4" />
          {t('back_to_waivers')}
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{waiver.name}</h1>
              <Badge variant={waiver.isActive ? 'default' : 'secondary'}>
                {waiver.isActive ? t('status_active') : t('status_inactive')}
              </Badge>
              {waiver.isDefault && (
                <Badge variant="outline">{t('default_badge')}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {t('version_label', { version: waiver.version })}
              {' • '}
              {t('updated_label', { date: format(waiver.updatedAt, 'MMM d, yyyy') })}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDelete}>
          <Trash2 className="mr-2 size-4" />
          {t('delete_button')}
        </Button>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Waiver Content */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('content_title')}</CardTitle>
              {waiver.description && (
                <CardDescription>{waiver.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="max-h-125 overflow-y-auto rounded-lg border bg-muted/30 p-4">
                <pre className="font-sans text-sm whitespace-pre-wrap">
                  {resolvedContentNodes}
                </pre>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('preview_note')}
              </p>
              <div className="mt-6 flex justify-end">
                <Button variant="outline" size="icon" onClick={() => setIsEditContentOpen(true)} aria-label={t('edit_content_aria')}>
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings_title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('status_label')}</span>
                <Badge variant={waiver.isActive ? 'default' : 'secondary'}>
                  {waiver.isActive ? t('status_active') : t('status_inactive')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('default_label')}</span>
                <Badge variant={waiver.isDefault ? 'default' : 'secondary'}>
                  {waiver.isDefault ? t('yes') : t('no')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('requires_guardian_label')}</span>
                <Badge variant={waiver.requiresGuardian ? 'default' : 'secondary'}>
                  {waiver.requiresGuardian ? t('yes') : t('no')}
                </Badge>
              </div>
              {waiver.requiresGuardian && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('guardian_age_label')}</span>
                  <span className="font-medium">{t('under_age', { age: waiver.guardianAgeThreshold })}</span>
                </div>
              )}
              <div className="mt-6 flex justify-end">
                <Button variant="outline" size="icon" onClick={() => setIsEditBasicsOpen(true)} aria-label={t('edit_settings_aria')}>
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Associated Memberships Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('memberships_title')}</CardTitle>
              <CardDescription>
                {t('memberships_description', { count: memberships.length })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {memberships.length === 0
                ? (
                    <p className="text-sm text-muted-foreground">{t('no_memberships')}</p>
                  )
                : (
                    <ul className="space-y-2">
                      {memberships.map(membership => (
                        <li key={membership.id} className="rounded-lg border p-2">
                          <span className="text-sm font-medium">{membership.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              <div className="mt-6 flex justify-end">
                <Button variant="outline" size="icon" onClick={() => setIsEditMembershipsOpen(true)} aria-label={t('edit_memberships_aria')}>
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Version History Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('version_history_title')}</CardTitle>
              <CardDescription>
                {t('current_version_label', { version: waiver.version })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {versions.filter(v => v.parentId !== null).length === 0
                ? (
                    <p className="text-sm text-muted-foreground">{t('no_previous_versions')}</p>
                  )
                : (
                    <ul className="space-y-2">
                      {versions
                        .filter(v => v.parentId !== null)
                        .map(version => (
                          <li key={version.id} className="flex items-center justify-between rounded-lg border p-2">
                            <span className="text-sm font-medium">
                              {t('version_date_label', {
                                version: version.version,
                                date: format(version.createdAt, 'MMM d, yyyy'),
                              })}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setViewingVersion(version)}
                              aria-label={t('view_version_button')}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                    </ul>
                  )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Modals */}
      <EditWaiverBasicsModal
        isOpen={isEditBasicsOpen}
        onClose={() => setIsEditBasicsOpen(false)}
        name={waiver.name}
        description={waiver.description}
        isActive={waiver.isActive}
        isDefault={waiver.isDefault}
        requiresGuardian={waiver.requiresGuardian}
        guardianAgeThreshold={waiver.guardianAgeThreshold}
        onSave={handleSaveBasics}
      />
      <EditWaiverContentModal
        isOpen={isEditContentOpen}
        onClose={() => setIsEditContentOpen(false)}
        name={waiver.name}
        content={waiver.content}
        onSave={handleSaveContent}
      />
      <EditWaiverMembershipsModal
        isOpen={isEditMembershipsOpen}
        onClose={() => setIsEditMembershipsOpen(false)}
        waiverId={waiverId}
        currentMembershipIds={memberships.map(m => m.id)}
        onSave={handleSaveMemberships}
      />
      <ViewVersionModal
        isOpen={!!viewingVersion}
        onClose={() => setViewingVersion(null)}
        template={viewingVersion}
        mergeFields={mergeFields}
      />
      <DeleteWaiverAlertDialog
        isOpen={isDeleteOpen}
        waiverName={waiver?.name ?? ''}
        onCloseAction={handleCancelDelete}
        onConfirmAction={handleConfirmDelete}
      />
    </div>
  );
}
