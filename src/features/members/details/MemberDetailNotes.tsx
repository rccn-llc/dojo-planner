'use client';

import { ArrowDown01, ArrowDownAZ, ArrowUp10, ArrowUpZA, Pencil, Search, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
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
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input/input';
import { Textarea } from '@/components/ui/textarea';

export type MemberNote = {
  id: string;
  memberId: string;
  content: string;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MemberDetailNotesProps = {
  memberId: string;
  memberName: string;
  notes: MemberNote[];
  isLoading?: boolean;
  onAddNote?: (content: string) => void | Promise<void>;
  onEditNote?: (noteId: string, content: string) => void | Promise<void>;
  onDeleteNote?: (noteId: string) => void | Promise<void>;
};

// Maximum character limit for notes to prevent abuse
const MAX_NOTE_LENGTH = 2000;

type SortField = 'date' | 'author' | 'content';
type SortDirection = 'asc' | 'desc';

function formatNoteDate(date: Date): string {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MemberDetailNotes({
  notes,
  isLoading = false,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: MemberDetailNotesProps) {
  const t = useTranslations('MemberDetailNotes');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!newNoteContent.trim() || isSubmitting || !onAddNote) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddNote(newNoteContent.trim());
      setNewNoteContent('');
    } finally {
      setIsSubmitting(false);
    }
  }, [newNoteContent, isSubmitting, onAddNote]);

  const handleStartEdit = useCallback((note: MemberNote) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingNoteId(null);
    setEditContent('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingNoteId || !editContent.trim() || !onEditNote) {
      return;
    }
    setPendingActionId(editingNoteId);
    try {
      await onEditNote(editingNoteId, editContent.trim());
      setEditingNoteId(null);
      setEditContent('');
    } finally {
      setPendingActionId(null);
    }
  }, [editingNoteId, editContent, onEditNote]);

  const handleRequestDelete = useCallback((noteId: string) => {
    if (!onDeleteNote) {
      return;
    }
    setDeleteCandidateId(noteId);
  }, [onDeleteNote]);

  const handleCancelDelete = useCallback(() => {
    setDeleteCandidateId(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!onDeleteNote || !deleteCandidateId) {
      return;
    }
    const noteId = deleteCandidateId;
    setPendingActionId(noteId);
    try {
      await onDeleteNote(noteId);
      setDeleteCandidateId(null);
    } finally {
      setPendingActionId(null);
    }
  }, [onDeleteNote, deleteCandidateId]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'date' ? 'desc' : 'asc');
    }
  }, [sortField]);

  const filteredAndSortedNotes = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? notes.filter(
          (note) => {
            const formattedDate = formatNoteDate(note.createdAt).toLowerCase();
            const author = (note.createdByName ?? '').toLowerCase();
            return note.content.toLowerCase().includes(query)
              || author.includes(query)
              || formattedDate.includes(query);
          },
        )
      : notes;

    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'date': {
          const comparison = a.createdAt.getTime() - b.createdAt.getTime();
          return sortDirection === 'asc' ? comparison : -comparison;
        }
        case 'author': {
          const aValue = (a.createdByName ?? '').toLowerCase();
          const bValue = (b.createdByName ?? '').toLowerCase();
          if (aValue < bValue) {
            return sortDirection === 'asc' ? -1 : 1;
          }
          if (aValue > bValue) {
            return sortDirection === 'asc' ? 1 : -1;
          }
          return 0;
        }
        case 'content': {
          const aValue = a.content.toLowerCase();
          const bValue = b.content.toLowerCase();
          if (aValue < bValue) {
            return sortDirection === 'asc' ? -1 : 1;
          }
          if (aValue > bValue) {
            return sortDirection === 'asc' ? 1 : -1;
          }
          return 0;
        }
        default:
          return 0;
      }
    });
  }, [notes, sortField, sortDirection, searchQuery]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return null;
    }

    if (field === 'date') {
      return sortDirection === 'asc'
        ? <ArrowDown01 className="size-4" />
        : <ArrowUp10 className="size-4" />;
    }

    return sortDirection === 'asc'
      ? <ArrowDownAZ className="size-4" />
      : <ArrowUpZA className="size-4" />;
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">{t('add_note_title')}</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder={t('note_placeholder')}
              value={newNoteContent}
              onChange={e => setNewNoteContent(e.target.value)}
              className="min-h-30 resize-none"
              aria-label={t('note_placeholder')}
              maxLength={MAX_NOTE_LENGTH}
            />
            <div className="flex justify-end text-xs text-muted-foreground">
              {newNoteContent.length}
              /
              {MAX_NOTE_LENGTH}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={!newNoteContent.trim() || isSubmitting}
            >
              {isSubmitting ? t('saving_button') : t('save_note_button')}
            </Button>
          </div>
        </div>
      </Card>

      <div className="rounded-lg border border-border bg-background">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">{t('notes_history_title')}</h2>
        </div>
        {notes.length > 0 && (
          <div className="border-b border-border px-6 py-4">
            <div className="relative w-full sm:w-80">
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
          </div>
        )}
        {isLoading
          ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">{t('loading')}</p>
              </div>
            )
          : notes.length === 0
            ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">{t('no_notes')}</p>
                </div>
              )
            : filteredAndSortedNotes.length === 0
              ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-muted-foreground">{t('no_matching_notes')}</p>
                  </div>
                )
              : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden overflow-x-auto lg:block">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border bg-secondary">
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                              <button
                                type="button"
                                onClick={() => handleSort('date')}
                                className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                              >
                                {t('table_date')}
                                {renderSortIcon('date')}
                              </button>
                            </th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                              <button
                                type="button"
                                onClick={() => handleSort('author')}
                                className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                              >
                                {t('table_author')}
                                {renderSortIcon('author')}
                              </button>
                            </th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                              <button
                                type="button"
                                onClick={() => handleSort('content')}
                                className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                              >
                                {t('table_note')}
                                {renderSortIcon('content')}
                              </button>
                            </th>
                            {(onEditNote || onDeleteNote) && (
                              <th className="px-6 py-3 text-right text-sm font-semibold text-foreground">
                                {t('table_actions')}
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAndSortedNotes.map((note) => {
                            const isEditing = editingNoteId === note.id;
                            const isPending = pendingActionId === note.id;
                            return (
                              <tr key={note.id} className="border-b border-border hover:bg-secondary/30">
                                <td className="px-6 py-4 text-sm text-muted-foreground">
                                  {formatNoteDate(note.createdAt)}
                                </td>
                                <td className="px-6 py-4 text-sm font-medium text-foreground">
                                  {note.createdByName ?? t('unknown_author')}
                                </td>
                                <td className="px-6 py-4 text-sm text-foreground">
                                  {isEditing
                                    ? (
                                        <div className="space-y-2">
                                          <Textarea
                                            value={editContent}
                                            onChange={e => setEditContent(e.target.value)}
                                            maxLength={MAX_NOTE_LENGTH}
                                            aria-label={t('edit_note_placeholder')}
                                            className="min-h-20 resize-none"
                                          />
                                          <div className="flex gap-2">
                                            <Button size="sm" onClick={handleSaveEdit} disabled={!editContent.trim() || isPending}>
                                              {t('save_edit_button')}
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={isPending}>
                                              {t('cancel_edit_button')}
                                            </Button>
                                          </div>
                                        </div>
                                      )
                                    : (
                                        note.content
                                      )}
                                </td>
                                {(onEditNote || onDeleteNote) && (
                                  <td className="px-6 py-4 text-right">
                                    {!isEditing && (
                                      <div className="flex justify-end gap-2">
                                        {onEditNote && (
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleStartEdit(note)}
                                            disabled={isPending}
                                            aria-label={t('edit_note_aria')}
                                          >
                                            <Pencil className="size-4" />
                                          </Button>
                                        )}
                                        {onDeleteNote && (
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleRequestDelete(note.id)}
                                            disabled={isPending}
                                            aria-label={t('delete_note_aria')}
                                          >
                                            <Trash2 className="size-4" />
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="space-y-4 p-4 lg:hidden">
                      {filteredAndSortedNotes.map((note) => {
                        const isEditing = editingNoteId === note.id;
                        const isPending = pendingActionId === note.id;
                        return (
                          <Card key={note.id} className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between border-b border-border pb-3">
                                <div>
                                  <div className="text-xs font-semibold text-muted-foreground">
                                    {t('table_date')}
                                  </div>
                                  <div className="mt-1 text-sm font-medium text-foreground">
                                    {formatNoteDate(note.createdAt)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-semibold text-muted-foreground">
                                    {t('table_author')}
                                  </div>
                                  <div className="mt-1 text-sm font-medium text-foreground">
                                    {note.createdByName ?? t('unknown_author')}
                                  </div>
                                </div>
                              </div>

                              <div>
                                <div className="text-xs font-semibold text-muted-foreground">
                                  {t('table_note')}
                                </div>
                                <div className="mt-1 text-sm text-foreground">
                                  {isEditing
                                    ? (
                                        <div className="space-y-2">
                                          <Textarea
                                            value={editContent}
                                            onChange={e => setEditContent(e.target.value)}
                                            maxLength={MAX_NOTE_LENGTH}
                                            aria-label={t('edit_note_placeholder')}
                                            className="min-h-20 resize-none"
                                          />
                                          <div className="flex gap-2">
                                            <Button size="sm" onClick={handleSaveEdit} disabled={!editContent.trim() || isPending}>
                                              {t('save_edit_button')}
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={isPending}>
                                              {t('cancel_edit_button')}
                                            </Button>
                                          </div>
                                        </div>
                                      )
                                    : (
                                        note.content
                                      )}
                                </div>
                              </div>

                              {!isEditing && (onEditNote || onDeleteNote) && (
                                <div className="flex justify-end gap-2 border-t border-border pt-3">
                                  {onEditNote && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleStartEdit(note)}
                                      disabled={isPending}
                                    >
                                      <Pencil className="mr-1 size-4" />
                                      {t('edit_button')}
                                    </Button>
                                  )}
                                  {onDeleteNote && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleRequestDelete(note.id)}
                                      disabled={isPending}
                                    >
                                      <Trash2 className="mr-1 size-4" />
                                      {t('delete_button')}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </>
                )}
      </div>

      <AlertDialog
        open={deleteCandidateId !== null}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelDelete();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_dialog_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirm_delete')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingActionId !== null}>
              {t('cancel_edit_button')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={pendingActionId !== null}
              onClick={handleConfirmDelete}
            >
              {t('delete_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
