'use client';

import type { CatalogCategory } from './types';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
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
import { DeleteCatalogCategoryAlertDialog } from './DeleteCatalogCategoryAlertDialog';

type CatalogCategoriesManagementProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CatalogCategory[];
  loading: boolean;
  onCreateAction: (data: { name: string; description?: string }) => Promise<void>;
  onUpdateAction: (id: string, data: { name: string; description?: string }) => Promise<void>;
  onDeleteAction: (id: string) => Promise<void>;
};

type EditingCategory = {
  id: string | null; // null means new category
  name: string;
  description: string;
};

export function CatalogCategoriesManagement({
  open,
  onOpenChange,
  categories,
  loading,
  onCreateAction,
  onUpdateAction,
  onDeleteAction,
}: CatalogCategoriesManagementProps) {
  const t = useTranslations('CatalogCategoriesManagement');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return categories;
    }
    const query = searchQuery.toLowerCase();
    return categories.filter(
      category =>
        category.name.toLowerCase().includes(query)
        || category.description?.toLowerCase().includes(query),
    );
  }, [searchQuery, categories]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleStartAdd = useCallback(() => {
    setEditingCategory({ id: null, name: '', description: '' });
  }, []);

  const handleStartEdit = useCallback((category: CatalogCategory) => {
    setEditingCategory({
      id: category.id,
      name: category.name,
      description: category.description || '',
    });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingCategory(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingCategory || !editingCategory.name.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const data = {
        name: editingCategory.name.trim(),
        description: editingCategory.description.trim() || undefined,
      };

      if (editingCategory.id) {
        await onUpdateAction(editingCategory.id, data);
      } else {
        await onCreateAction(data);
      }
      setEditingCategory(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [editingCategory, onCreateAction, onUpdateAction]);

  const handleRequestDelete = useCallback((id: string) => {
    setDeleteCandidateId(id);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeleteCandidateId(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteCandidateId) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onDeleteAction(deleteCandidateId);
      setDeleteCandidateId(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [deleteCandidateId, onDeleteAction]);

  const candidateCategory = deleteCandidateId
    ? categories.find(c => c.id === deleteCandidateId) ?? null
    : null;

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
                {/* Search and Add New Category Row */}
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
                  <Button onClick={handleStartAdd} disabled={!!editingCategory}>
                    <Plus className="mr-1 size-4" />
                    {t('add_new_category_button')}
                  </Button>
                </div>

                {/* Categories Table */}
                <div className="overflow-hidden rounded-lg border border-border bg-background">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-secondary">
                          <th className="w-[200px] px-6 py-3 text-left text-sm font-semibold text-foreground">{t('category_name_column')}</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t('description_column')}</th>
                          <th className="w-[150px] px-6 py-3 text-right text-sm font-semibold text-foreground">{t('actions_column')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* New category row */}
                        {editingCategory && editingCategory.id === null && (
                          <tr className="border-b border-border bg-muted/50">
                            <td className="px-6 py-4">
                              <Input
                                type="text"
                                placeholder={t('name_placeholder')}
                                value={editingCategory.name}
                                onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                className="h-8"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <Input
                                type="text"
                                placeholder={t('description_placeholder')}
                                value={editingCategory.description}
                                onChange={e => setEditingCategory({ ...editingCategory, description: e.target.value })}
                                className="h-8"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleSave}
                                  disabled={!editingCategory.name.trim() || isSubmitting}
                                >
                                  <Check className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleCancelEdit}
                                  disabled={isSubmitting}
                                >
                                  <X className="size-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}

                        {filteredCategories.length === 0 && !editingCategory
                          ? (
                              <tr>
                                <td colSpan={3} className="py-8 text-center text-muted-foreground">
                                  {t('no_categories_found')}
                                </td>
                              </tr>
                            )
                          : (
                              filteredCategories.map(category => (
                                <CategoryRow
                                  key={category.id}
                                  category={category}
                                  isEditing={editingCategory?.id === category.id}
                                  editingData={editingCategory?.id === category.id ? editingCategory : null}
                                  onEditChange={setEditingCategory}
                                  onStartEdit={() => handleStartEdit(category)}
                                  onCancelEdit={handleCancelEdit}
                                  onSave={handleSave}
                                  onDelete={() => handleRequestDelete(category.id)}
                                  isSubmitting={isSubmitting}
                                  isAnotherEditing={!!editingCategory && editingCategory.id !== category.id}
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
      <DeleteCatalogCategoryAlertDialog
        isOpen={candidateCategory !== null}
        categoryName={candidateCategory?.name ?? ''}
        onCloseAction={handleCancelDelete}
        onConfirmAction={handleConfirmDelete}
      />
    </Sheet>
  );
}

type CategoryRowProps = {
  category: CatalogCategory;
  isEditing: boolean;
  editingData: EditingCategory | null;
  onEditChange: (data: EditingCategory) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
  isSubmitting: boolean;
  isAnotherEditing: boolean;
};

function CategoryRow({
  category,
  isEditing,
  editingData,
  onEditChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  isSubmitting,
  isAnotherEditing,
}: CategoryRowProps) {
  const t = useTranslations('CatalogCategoriesManagement');

  if (isEditing && editingData) {
    return (
      <tr className="border-b border-border bg-muted/50">
        <td className="px-6 py-4">
          <Input
            type="text"
            placeholder={t('name_placeholder')}
            value={editingData.name}
            onChange={e => onEditChange({ ...editingData, name: e.target.value })}
            className="h-8"
          />
        </td>
        <td className="px-6 py-4">
          <Input
            type="text"
            placeholder={t('description_placeholder')}
            value={editingData.description}
            onChange={e => onEditChange({ ...editingData, description: e.target.value })}
            className="h-8"
          />
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSave}
              disabled={!editingData.name.trim() || isSubmitting}
            >
              <Check className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelEdit}
              disabled={isSubmitting}
            >
              <X className="size-4" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border hover:bg-secondary/30">
      <td className="px-6 py-4">
        <span className="font-medium text-foreground">{category.name}</span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-muted-foreground">
          {category.description || '-'}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onStartEdit}
            disabled={isAnotherEditing || isSubmitting}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={isAnotherEditing || isSubmitting}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
