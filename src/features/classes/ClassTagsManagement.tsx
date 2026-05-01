'use client';

import type { Tag } from '@/hooks/useTagsCache';
import { useOrganization } from '@clerk/nextjs';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AddEditTagModal } from '@/features/tags/AddEditTagModal';
import { DeleteTagAlertDialog } from '@/features/tags/DeleteTagAlertDialog';
import { invalidateTagsCache, useTagsCache } from '@/hooks/useTagsCache';
import { client } from '@/libs/Orpc';

type ClassTagsManagementProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ModalState
  = | { kind: 'closed' }
    | { kind: 'create' }
    | { kind: 'edit'; tag: Tag };

export function ClassTagsManagement({ open, onOpenChange }: ClassTagsManagementProps) {
  const t = useTranslations('ClassTagsManagement');
  const { organization } = useOrganization();
  const { classTags, loading } = useTagsCache(organization?.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalState, setModalState] = useState<ModalState>({ kind: 'closed' });
  const [deleteCandidate, setDeleteCandidate] = useState<Tag | null>(null);

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) {
      return classTags;
    }
    const query = searchQuery.toLowerCase();
    return classTags.filter(
      tag =>
        tag.name.toLowerCase().includes(query)
        || (tag.classNames && tag.classNames.some(className => className.toLowerCase().includes(query))),
    );
  }, [searchQuery, classTags]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const closeModal = useCallback(() => setModalState({ kind: 'closed' }), []);

  const handleSubmitTag = useCallback(async (payload: { name: string; color: string | null }) => {
    try {
      if (modalState.kind === 'create') {
        await client.tags.create({ entityType: 'class', name: payload.name, color: payload.color });
      } else if (modalState.kind === 'edit') {
        await client.tags.update({ id: modalState.tag.id, name: payload.name, color: payload.color });
      } else {
        return undefined;
      }
      await invalidateTagsCache();
      return undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save tag.';
      return message;
    }
  }, [modalState]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteCandidate) {
      return;
    }
    try {
      await client.tags.remove({ id: deleteCandidate.id });
      await invalidateTagsCache();
    } finally {
      setDeleteCandidate(null);
    }
  }, [deleteCandidate]);

  const editingTag = modalState.kind === 'edit' ? modalState.tag : undefined;

  return (
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
                {/* Search and Add New Tag Row */}
                <div className="flex items-center justify-between gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={t('search_placeholder')}
                      value={searchQuery}
                      onChange={handleSearchChange}
                      className="pl-9"
                      aria-label={t('search_placeholder')}
                    />
                  </div>
                  <Button onClick={() => setModalState({ kind: 'create' })}>
                    <Plus className="mr-1 size-4" />
                    {t('add_new_tag_button')}
                  </Button>
                </div>

                {/* Tags Table */}
                <div className="overflow-hidden rounded-lg border border-border bg-background">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-secondary">
                          <th className="w-[200px] px-6 py-3 text-left text-sm font-semibold text-foreground">{t('tag_name_column')}</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t('usage_column')}</th>
                          <th className="w-[150px] px-6 py-3 text-right text-sm font-semibold text-foreground">{t('actions_column')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTags.length === 0
                          ? (
                              <tr>
                                <td colSpan={3} className="py-8 text-center text-muted-foreground">
                                  {t('no_tags_found')}
                                </td>
                              </tr>
                            )
                          : (
                              filteredTags.map(tag => (
                                <ClassTagRow
                                  key={tag.id}
                                  tag={tag}
                                  onEdit={() => setModalState({ kind: 'edit', tag })}
                                  onDelete={() => setDeleteCandidate(tag)}
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

      <AddEditTagModal
        key={modalState.kind === 'edit' ? `edit-${modalState.tag.id}` : modalState.kind}
        isOpen={modalState.kind !== 'closed'}
        mode={modalState.kind === 'edit' ? 'edit' : 'create'}
        initialName={editingTag?.name ?? ''}
        initialColor={editingTag?.color ?? null}
        onCloseAction={closeModal}
        onSubmitAction={handleSubmitTag}
      />

      <DeleteTagAlertDialog
        isOpen={deleteCandidate !== null}
        tagName={deleteCandidate?.name ?? ''}
        onCloseAction={() => setDeleteCandidate(null)}
        onConfirmAction={handleConfirmDelete}
      />
    </Sheet>
  );
}

type ClassTagRowProps = {
  tag: Tag;
  onEdit: () => void;
  onDelete: () => void;
};

function ClassTagRow({ tag, onEdit, onDelete }: ClassTagRowProps) {
  const t = useTranslations('ClassTagsManagement');

  return (
    <tr className="border-b border-border hover:bg-secondary/30">
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div
            className="size-4 rounded"
            style={{ backgroundColor: tag.color || '#6b7280' }}
            aria-hidden="true"
          />
          <span className="font-medium text-foreground">{tag.name}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-primary">{tag.usageCount}</span>
          {tag.classNames && tag.classNames.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {tag.classNames.join(', ')}
            </span>
          )}
        </div>
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
