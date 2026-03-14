'use client';

import type { ProgramFormData } from '@/features/programs/AddEditProgramModal';
import type { ProgramFilters } from '@/features/programs/ProgramFilterBar';
import type { ProgramCardProps, ProgramStatus } from '@/templates/ProgramCard';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AddEditProgramModal } from '@/features/programs/AddEditProgramModal';
import { DeleteProgramAlertDialog } from '@/features/programs/DeleteProgramAlertDialog';
import { ProgramFilterBar } from '@/features/programs/ProgramFilterBar';
import { useHasRole } from '@/hooks/useHasRole';
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

const initialMockPrograms: Program[] = [
  {
    id: '1',
    name: 'Adult Brazilian Jiu-jitsu',
    description: 'Traditional Brazilian Jiu-Jitsu program for adults focusing on self-defense, competition, and fitness.',
    classCount: 5,
    classNames: 'BJJ Fundamentals I & II, Intermediate, Advanced, Advanced No-Gi',
    status: 'Active',
  },
  {
    id: '2',
    name: 'Kids Program',
    description: 'Fun and engaging martial arts program designed specifically for children ages 6-12.',
    classCount: 2,
    classNames: 'Kids Class (Ages 6-9), Kids Class (Ages 10-12)',
    status: 'Active',
  },
  {
    id: '3',
    name: 'Competition Team',
    description: 'Elite training program for competitive athletes with advanced techniques and intensive conditioning.',
    classCount: 3,
    classNames: 'Competition Team Training, Advanced Sparring, Competition Prep',
    status: 'Active',
  },
  {
    id: '4',
    name: 'Judo Fundamentals',
    description: 'Traditional Judo program focusing on throws, breakfalls, and Olympic-style techniques.',
    classCount: 1,
    classNames: 'Judo Fundamentals',
    status: 'Active',
  },
  {
    id: '5',
    name: 'Wrestling Fundamentals',
    description: 'Traditional Wrestling program focusing on takedowns, mat control, and collegiate-style techniques.',
    classCount: 0,
    classNames: '',
    status: 'Inactive',
  },
];

export default function ProgramsPage() {
  const t = useTranslations('ProgramsPage');
  const canEdit = useHasRole(ORG_ROLE.ACADEMY_OWNER);
  const [filters, setFilters] = useState<ProgramFilters>({
    search: '',
    status: 'all',
  });
  const [programs, setPrograms] = useState<Program[]>(initialMockPrograms);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<ProgramFormData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingProgram, setDeletingProgram] = useState<{ id: string; name: string } | null>(null);

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
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (deletingProgram) {
      setPrograms(prev => prev.filter(p => p.id !== deletingProgram.id));
      setDeletingProgram(null);
    }
  }, [deletingProgram]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingProgram(null);
  }, []);

  const handleSaveProgram = useCallback(async (data: ProgramFormData) => {
    setIsLoading(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 300));

      if (data.id) {
        // Edit existing program
        setPrograms(prev => prev.map(p =>
          p.id === data.id
            ? { ...p, name: data.name, description: data.description, status: data.status }
            : p,
        ));
      } else {
        // Add new program
        const newProgram: Program = {
          id: String(Date.now()),
          name: data.name,
          description: data.description,
          classCount: 0,
          classNames: '',
          status: data.status,
        };
        setPrograms(prev => [...prev, newProgram]);
      }

      handleCloseModal();
    } finally {
      setIsLoading(false);
    }
  }, [handleCloseModal]);

  const statsData = useMemo(() => [
    { id: 'programs', label: t('total_programs_label'), value: stats.totalPrograms },
    { id: 'active', label: t('active_label'), value: stats.active },
    { id: 'classes', label: t('total_classes_label'), value: stats.totalClasses },
  ], [stats, t]);

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
      />

      {/* Delete Program Confirmation Dialog */}
      <DeleteProgramAlertDialog
        isOpen={!!deletingProgram}
        programName={deletingProgram?.name ?? ''}
        onCloseAction={handleCloseDeleteDialog}
        onConfirmAction={handleConfirmDelete}
      />
    </div>
  );
}
