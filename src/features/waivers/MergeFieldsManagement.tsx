'use client';

import type { WaiverMergeField } from '@/services/WaiversService';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AddMergeFieldModal } from '@/features/waivers/details/AddMergeFieldModal';
import { EditMergeFieldModal } from '@/features/waivers/details/EditMergeFieldModal';
import { client } from '@/libs/Orpc';

type MergeFieldsManagementProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MergeFieldsManagement({ open, onOpenChange }: MergeFieldsManagementProps) {
  const t = useTranslations('MergeFieldsManagement');

  const [mergeFields, setMergeFields] = useState<WaiverMergeField[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<WaiverMergeField | null>(null);
  const [deletingField, setDeletingField] = useState<WaiverMergeField | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMergeFields = useCallback(async () => {
    try {
      setLoading(true);
      const result = await client.waivers.listMergeFields();
      setMergeFields(result.mergeFields);
    } catch (err) {
      console.error('Failed to fetch merge fields:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void (async () => {
      await fetchMergeFields();
    })();
  }, [open, fetchMergeFields]);

  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) {
      return mergeFields;
    }
    const query = searchQuery.toLowerCase();
    return mergeFields.filter(
      field =>
        field.key.toLowerCase().includes(query)
        || field.label.toLowerCase().includes(query)
        || field.defaultValue.toLowerCase().includes(query),
    );
  }, [searchQuery, mergeFields]);

  const handleCreate = useCallback(async (data: { key: string; label: string; defaultValue: string; description?: string }) => {
    await client.waivers.createMergeField(data);
    await fetchMergeFields();
    setIsAddModalOpen(false);
  }, [fetchMergeFields]);

  const handleUpdate = useCallback(async (data: { id: string; label?: string; defaultValue?: string; description?: string | null }) => {
    await client.waivers.updateMergeField(data);
    await fetchMergeFields();
    setEditingField(null);
  }, [fetchMergeFields]);

  const handleDelete = useCallback(async () => {
    if (!deletingField) {
      return;
    }
    setIsDeleting(true);
    try {
      await client.waivers.deleteMergeField({ id: deletingField.id });
      await fetchMergeFields();
    } finally {
      setIsDeleting(false);
      setDeletingField(null);
    }
  }, [deletingField, fetchMergeFields]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:w-[50vw] sm:max-w-3xl">
          <SheetHeader className="pt-10 pb-4">
            <SheetTitle className="text-xl">{t('title')}</SheetTitle>
          </SheetHeader>

          {loading
            ? (
                <div className="flex flex-col gap-4 px-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              )
            : (
                <div className="flex flex-col gap-4 px-4">
                  {/* Search and Add Field Row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder={t('search_placeholder')}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9"
                        aria-label={t('search_placeholder')}
                      />
                    </div>
                    <Button onClick={() => setIsAddModalOpen(true)}>
                      <Plus className="mr-1 size-4" />
                      {t('add_field_button')}
                    </Button>
                  </div>

                  {/* Fields Table */}
                  <div className="overflow-hidden rounded-lg border border-border bg-background">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border bg-secondary">
                            <th className="w-40 px-6 py-3 text-left text-sm font-semibold text-foreground">{t('field_key_column')}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t('label_column')}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t('default_value_column')}</th>
                            <th className="w-[150px] px-6 py-3 text-right text-sm font-semibold text-foreground">{t('actions_column')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFields.length === 0
                            ? (
                                <tr>
                                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                                    {t('no_fields_found')}
                                  </td>
                                </tr>
                              )
                            : (
                                filteredFields.map(field => (
                                  <MergeFieldRow
                                    key={field.id}
                                    field={field}
                                    onEdit={() => setEditingField(field)}
                                    onDelete={() => setDeletingField(field)}
                                  />
                                ))
                              )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
        </SheetContent>
      </Sheet>

      {/* Add Modal */}
      <AddMergeFieldModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleCreate}
      />

      {/* Edit Modal */}
      {editingField && (
        <EditMergeFieldModal
          isOpen={!!editingField}
          onClose={() => setEditingField(null)}
          field={editingField}
          onSave={handleUpdate}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingField}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingField(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingField && t('delete_confirm_description', { key: deletingField.key })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('delete_confirm_cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {t('delete_confirm_action')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type MergeFieldRowProps = {
  field: WaiverMergeField;
  onEdit: () => void;
  onDelete: () => void;
};

function MergeFieldRow({ field, onEdit, onDelete }: MergeFieldRowProps) {
  const t = useTranslations('MergeFieldsManagement');

  return (
    <tr className="border-b border-border hover:bg-secondary/30">
      <td className="px-6 py-4">
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{`<${field.key}>`}</code>
      </td>
      <td className="px-6 py-4">
        <span className="font-medium text-foreground">{field.label}</span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-muted-foreground">{field.defaultValue}</span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            {t('edit_button')}
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            {t('delete_button')}
          </Button>
        </div>
      </td>
    </tr>
  );
}
