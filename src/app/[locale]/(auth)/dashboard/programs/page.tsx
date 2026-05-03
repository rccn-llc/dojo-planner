'use client';

import type { ProgramFormData } from '@/features/programs/AddEditProgramModal';
import type { ProgramFilters } from '@/features/programs/ProgramFilterBar';
import type { ProgramCardProps, ProgramStatus } from '@/templates/ProgramCard';
import { useOrganization } from '@clerk/nextjs';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AddEditProgramModal } from '@/features/programs/AddEditProgramModal';
import { DeleteProgramAlertDialog } from '@/features/programs/DeleteProgramAlertDialog';
import { ProgramFilterBar } from '@/features/programs/ProgramFilterBar';
import { useHasRole } from '@/hooks/useHasRole';
import { invalidateProgramsCache, useProgramsCache } from '@/hooks/useProgramsCache';
import { client } from '@/libs/Orpc';
import { ProgramCard } from '@/templates/ProgramCard';
import { StatsCards } from '@/templates/StatsCards';
import { ORG_ROLE } from '@/types/Auth';

type Program = {
  id: string;
  name: string;
  description: string;
  classCount: number;
  classNames: string;
  status: ProgramStatus;
};

export default function ProgramsPage() {
  const t = useTranslations('ProgramsPage');
  const canEdit = useHasRole(ORG_ROLE.ACADEMY_OWNER);
  const { organization } = useOrganization();
  const { programs: rawPrograms, loading } = useProgramsCache(organization?.id);

  const programs: Program[] = useMemo(() => rawPrograms.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    classCount: p.classCount,
    classNames: '', // Class names are not joined into the cache; the card no
    // longer relies on this — kept for type compatibility.
    status: p.isActive ? 'Active' as ProgramStatus : 'Inactive' as ProgramStatus,
  })), [rawPrograms]);

  const [filters, setFilters] = useState<ProgramFilters>({
    search: '',
    status: 'all',
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<ProgramFormData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingProgram, setDeletingProgram] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const stats = useMemo(() => ({
    totalPrograms: programs.length,
    active: programs.filter(p => p.status === 'Active').length,
    totalClasses: programs.reduce((sum, p) => sum + p.classCount, 0),
  }), [programs]);

  const filteredPrograms = useMemo(() => {
    return programs.filter((program) => {
      // Search filter
      const matchesSearch = program.name.toLowerCase().includes(filters.search.toLowerCase())
        || program.description.toLowerCase().includes(filters.search.toLowerCase());

      // Status filter
      const matchesStatus = filters.status === 'all' || program.status === filters.status;

      return matchesSearch && matchesStatus;
    });
  }, [filters, programs]);

  const handleAddProgram = useCallback(() => {
    setEditingProgram(null);
    setIsModalOpen(true);
  }, []);

  const handleEditProgram = useCallback((id: string) => {
    const program = programs.find(p => p.id === id);
    if (program) {
      setEditingProgram({
        id: program.id,
        name: program.name,
        description: program.description,
        status: program.status,
      });
      setIsModalOpen(true);
    }
  }, [programs]);

  const handleDeleteProgram = useCallback((id: string) => {
    // Only allow deletion if program has no classes
    const program = programs.find(p => p.id === id);
    if (program && program.classCount === 0) {
      setDeletingProgram({ id: program.id, name: program.name });
    }
  }, [programs]);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeletingProgram(null);
    setDeleteError(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingProgram) {
      return;
    }
    setDeleteError(null);
    try {
      await client.programs.remove({ id: deletingProgram.id });
      await invalidateProgramsCache();
      setDeletingProgram(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete program.';
      setDeleteError(message);
    }
  }, [deletingProgram]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingProgram(null);
    setSaveError(null);
  }, []);

  const handleSaveProgram = useCallback(async (data: ProgramFormData) => {
    setIsLoading(true);
    setSaveError(null);

    try {
      const isActive = data.status === 'Active';
      const description = data.description.trim() === '' ? null : data.description.trim();
      if (data.id) {
        await client.programs.update({
          id: data.id,
          name: data.name,
          description,
          isActive,
        });
      } else {
        await client.programs.create({
          name: data.name,
          description,
          isActive,
        });
      }
      await invalidateProgramsCache();
      handleCloseModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save program.';
      setSaveError(message);
    } finally {
      setIsLoading(false);
    }
  }, [handleCloseModal]);

  const statsData = useMemo(() => [
    { id: 'programs', label: t('total_programs_label'), value: stats.totalPrograms },
    { id: 'active', label: t('active_label'), value: stats.active },
    { id: 'classes', label: t('total_classes_label'), value: stats.totalClasses },
  ], [stats, t]);

  if (loading) {
    return (
      <div className="w-full space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Summary Cards */}
      <StatsCards stats={statsData} columns={3} />

      {/* Title */}
      <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>

      {/* Filter Bar and Add Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex-1">
          <ProgramFilterBar
            onFiltersChangeAction={setFilters}
          />
        </div>

        {canEdit && (
          <Button onClick={handleAddProgram}>
            <Plus className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">{t('add_new_program_button')}</span>
          </Button>
        )}
      </div>

      {/* Programs Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {filteredPrograms.length === 0
          ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">
                {t('no_programs_found')}
              </div>
            )
          : (
              filteredPrograms.map((program) => {
                const cardProps: ProgramCardProps = {
                  id: program.id,
                  name: program.name,
                  description: program.description,
                  classCount: program.classCount,
                  classNames: program.classNames,
                  status: program.status,
                  onEdit: canEdit ? handleEditProgram : undefined,
                  // Only pass onDelete if the program has no classes and user can edit
                  onDelete: canEdit && program.classCount === 0 ? handleDeleteProgram : undefined,
                };

                return <ProgramCard key={program.id} {...cardProps} />;
              })
            )}
      </div>

      {/* Add/Edit Program Modal */}
      <AddEditProgramModal
        isOpen={isModalOpen}
        onCloseAction={handleCloseModal}
        onSaveAction={handleSaveProgram}
        program={editingProgram}
        isLoading={isLoading}
        errorMessage={saveError}
      />

      {/* Delete Program Confirmation Dialog */}
      <DeleteProgramAlertDialog
        isOpen={!!deletingProgram}
        programName={deletingProgram?.name ?? ''}
        onCloseAction={handleCloseDeleteDialog}
        onConfirmAction={handleConfirmDelete}
        errorMessage={deleteError}
      />
    </div>
  );
}
