'use client';

import type { DayOfWeek, ScheduleException, ScheduleInstance } from '@/hooks/useAddClassWizard';
import type { ClassData } from '@/hooks/useClassesCache';
import { useOrganization } from '@clerk/nextjs';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ClassBasicsCard } from '@/features/classes/details/ClassBasicsCard';
import { ClassScheduleCard } from '@/features/classes/details/ClassScheduleCard';
import { ClassSettingsCard } from '@/features/classes/details/ClassSettingsCard';
import { ClassStatsCard } from '@/features/classes/details/ClassStatsCard';
import { DeleteClassAlertDialog } from '@/features/classes/details/DeleteClassAlertDialog';
import { EditClassBasicsModal } from '@/features/classes/details/EditClassBasicsModal';
import { EditClassScheduleModal } from '@/features/classes/details/EditClassScheduleModal';
import { EditClassSettingsModal } from '@/features/classes/details/EditClassSettingsModal';
import { EditScheduleInstanceModal } from '@/features/classes/details/EditScheduleInstanceModal';
import { useClassesCache } from '@/hooks/useClassesCache';
import { useHasRole } from '@/hooks/useHasRole';
import { ORG_ROLE } from '@/types/Auth';

export type ClassLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'All Levels';
export type ClassType = 'Adults' | 'Kids' | 'Women' | 'Open' | 'Competition';
export type ClassStyle = 'Gi' | 'No Gi';
export type AllowWalkIns = 'Yes' | 'No';

export type ClassInstructor = {
  id: string;
  name: string;
  photoUrl: string;
  role: 'primary' | 'assistant';
};

export type ClassDetailData = {
  id: string;
  // Basics
  className: string;
  program: string;
  description: string;
  level: ClassLevel;
  type: ClassType;
  style: ClassStyle;
  // Schedule
  scheduleInstances: ScheduleInstance[];
  scheduleExceptions: ScheduleException[];
  location: string;
  calendarColor: string;
  // Instructors
  instructors: ClassInstructor[];
  // Settings
  maximumCapacity: number | null;
  minimumAge: number | null;
  allowWalkIns: AllowWalkIns;
  // Stats (read-only)
  activeEnrollments: number;
  averageAttendance: number;
  totalSessions: number;
};

const DAY_NAMES: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LEVEL_TAGS = new Set(['beginner', 'intermediate', 'advanced', 'all levels']);
const TYPE_TAGS = new Set(['adults', 'kids', 'women', 'open', 'competition']);
const STYLE_TAGS = new Set(['gi', 'no gi', 'no-gi']);

function deriveTagValue<T extends string>(tags: ClassData['tags'], knownSet: Set<string>, fallback: T): T {
  const match = tags.find(t => knownSet.has(t.name.toLowerCase()));
  return (match?.name ?? fallback) as T;
}

function transformScheduleInstance(schedule: ClassData['schedule'][number]): ScheduleInstance {
  const hour24 = Number.parseInt(schedule.startTime.split(':')[0]!, 10);
  const minute = Number.parseInt(schedule.startTime.split(':')[1]!, 10);
  const endHour = Number.parseInt(schedule.endTime.split(':')[0]!, 10);
  const endMinute = Number.parseInt(schedule.endTime.split(':')[1]!, 10);
  const totalMinutes = (endHour * 60 + endMinute) - (hour24 * 60 + minute);

  const amPm: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const displayHour = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;

  return {
    id: schedule.id,
    dayOfWeek: DAY_NAMES[schedule.dayOfWeek]!,
    timeHour: displayHour,
    timeMinute: minute,
    timeAmPm: amPm,
    durationHours: Math.floor(totalMinutes / 60),
    durationMinutes: totalMinutes % 60,
    staffMember: schedule.instructorClerkId ?? '',
    assistantStaff: '',
  };
}

function transformScheduleException(exc: ClassData['scheduleExceptions'][number]): ScheduleException {
  const date = exc.exceptionDate;
  const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

  return {
    id: exc.id,
    scheduleInstanceId: exc.classScheduleInstanceId,
    date: dateStr,
    type: exc.exceptionType as ScheduleException['type'],
    overrides: exc.newStartTime
      ? {
          timeHour: Number.parseInt(exc.newStartTime.split(':')[0]!, 10) > 12
            ? Number.parseInt(exc.newStartTime.split(':')[0]!, 10) - 12
            : Number.parseInt(exc.newStartTime.split(':')[0]!, 10) || 12,
          timeMinute: Number.parseInt(exc.newStartTime.split(':')[1]!, 10),
          timeAmPm: Number.parseInt(exc.newStartTime.split(':')[0]!, 10) >= 12 ? 'PM' as const : 'AM' as const,
          ...(exc.newEndTime && exc.newStartTime
            ? {
                durationHours: Math.floor(((Number.parseInt(exc.newEndTime.split(':')[0]!, 10) * 60 + Number.parseInt(exc.newEndTime.split(':')[1]!, 10)) - (Number.parseInt(exc.newStartTime.split(':')[0]!, 10) * 60 + Number.parseInt(exc.newStartTime.split(':')[1]!, 10))) / 60),
                durationMinutes: ((Number.parseInt(exc.newEndTime.split(':')[0]!, 10) * 60 + Number.parseInt(exc.newEndTime.split(':')[1]!, 10)) - (Number.parseInt(exc.newStartTime.split(':')[0]!, 10) * 60 + Number.parseInt(exc.newStartTime.split(':')[1]!, 10))) % 60,
              }
            : {}),
          ...(exc.newInstructorClerkId ? { staffMember: exc.newInstructorClerkId } : {}),
        }
      : undefined,
    note: exc.reason ?? undefined,
    createdAt: new Date().toISOString(),
  };
}

function transformClassData(classData: ClassData): ClassDetailData {
  const styleName = deriveTagValue<ClassStyle>(classData.tags, STYLE_TAGS, 'Gi');

  return {
    id: classData.id,
    className: classData.name,
    program: classData.program?.slug ?? '',
    description: classData.description ?? '',
    level: deriveTagValue<ClassLevel>(classData.tags, LEVEL_TAGS, 'All Levels'),
    type: deriveTagValue<ClassType>(classData.tags, TYPE_TAGS, 'Adults'),
    style: styleName.toLowerCase() === 'no-gi' ? 'No Gi' : styleName,
    scheduleInstances: classData.schedule.map(transformScheduleInstance),
    scheduleExceptions: classData.scheduleExceptions.map(transformScheduleException),
    location: '',
    calendarColor: classData.color ?? classData.program?.color ?? '#6b7280',
    instructors: [],
    maximumCapacity: classData.maxCapacity,
    minimumAge: classData.minAge,
    allowWalkIns: 'Yes',
    activeEnrollments: 0,
    averageAttendance: 0,
    totalSessions: 0,
  };
}

type PageParams = {
  classId: string;
};

type InstanceEditState = {
  instance: ScheduleInstance;
  date: string;
  existingException?: ScheduleException;
} | null;

export default function ClassDetailPage({ params }: { params: Promise<PageParams> }) {
  const resolvedParams = use(params);
  const t = useTranslations('ClassDetailPage');
  const canEdit = useHasRole(ORG_ROLE.ACADEMY_OWNER);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization } = useOrganization();
  const { classes, loading } = useClassesCache(organization?.id);

  // Get the view param to preserve when navigating back
  const viewParam = searchParams.get('view');
  const backToClassesUrl = viewParam ? `/dashboard/classes?view=${viewParam}` : '/dashboard/classes';

  // Modal states
  const [isEditBasicsOpen, setIsEditBasicsOpen] = useState(false);
  const [isEditScheduleOpen, setIsEditScheduleOpen] = useState(false);
  const [isEditSettingsOpen, setIsEditSettingsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditInstanceOpen, setIsEditInstanceOpen] = useState(false);
  const [instanceEditState, setInstanceEditState] = useState<InstanceEditState>(null);

  // Find class from cache and transform
  const initialClassData = useMemo(() => {
    const raw = classes.find(c => c.id === resolvedParams.classId);
    return raw ? transformClassData(raw) : null;
  }, [classes, resolvedParams.classId]);

  const [classData, setClassData] = useState<ClassDetailData | null>(null);

  // Sync initial data when it becomes available
  const [lastInitialId, setLastInitialId] = useState<string | null>(null);
  if (initialClassData && initialClassData.id !== lastInitialId) {
    setClassData(initialClassData);
    setLastInitialId(initialClassData.id);
  }

  // Handler for updating class data
  const handleUpdateClass = (updates: Partial<ClassDetailData>) => {
    if (classData) {
      setClassData({ ...classData, ...updates });
    }
  };

  // Handler for deleting class
  const handleDeleteClass = () => {
    router.push(backToClassesUrl);
  };

  // Handler for opening the instance edit modal
  const handleEditInstance = (instance: ScheduleInstance, date: string, existingException?: ScheduleException) => {
    setInstanceEditState({ instance, date, existingException });
    setIsEditInstanceOpen(true);
  };

  // Handler for saving a schedule exception
  const handleSaveException = (exception: ScheduleException) => {
    if (!classData) {
      return;
    }

    const existingIndex = classData.scheduleExceptions.findIndex(e => e.id === exception.id);
    let updatedExceptions: ScheduleException[];

    if (existingIndex >= 0) {
      updatedExceptions = [...classData.scheduleExceptions];
      updatedExceptions[existingIndex] = exception;
    } else {
      updatedExceptions = [...classData.scheduleExceptions, exception];
    }

    setClassData({
      ...classData,
      scheduleExceptions: updatedExceptions,
    });
  };

  // Handler for deleting a schedule instance (creating a deletion exception)
  const handleDeleteException = (exception: ScheduleException) => {
    if (!classData) {
      return;
    }

    const existingIndex = classData.scheduleExceptions.findIndex(
      e => e.scheduleInstanceId === exception.scheduleInstanceId && e.date === exception.date,
    );
    let updatedExceptions: ScheduleException[];

    if (existingIndex >= 0) {
      updatedExceptions = [...classData.scheduleExceptions];
      updatedExceptions[existingIndex] = exception;
    } else {
      updatedExceptions = [...classData.scheduleExceptions, exception];
    }

    setClassData({
      ...classData,
      scheduleExceptions: updatedExceptions,
    });
  };

  if (loading) {
    return (
      <div className="w-full space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">{t('not_found')}</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Back Navigation */}
      <div className="flex items-center gap-4">
        <Link href={backToClassesUrl}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('back_to_classes')}
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-foreground">{classData.className}</h1>
        <p className="text-lg text-muted-foreground">{classData.program}</p>
      </div>

      {/* Stats Card */}
      <ClassStatsCard
        activeEnrollments={classData.activeEnrollments}
        averageAttendance={classData.averageAttendance}
        totalSessions={classData.totalSessions}
        level={classData.level}
      />

      {/* Detail Cards Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Basics + Settings */}
        <div className="flex flex-col gap-6">
          {/* Class Basics Card */}
          <ClassBasicsCard
            className={classData.className}
            program={classData.program}
            description={classData.description}
            level={classData.level}
            type={classData.type}
            style={classData.style}
            onEdit={canEdit ? () => setIsEditBasicsOpen(true) : undefined}
          />

          {/* Settings Card */}
          <ClassSettingsCard
            maximumCapacity={classData.maximumCapacity}
            minimumAge={classData.minimumAge}
            allowWalkIns={classData.allowWalkIns}
            onEdit={canEdit ? () => setIsEditSettingsOpen(true) : undefined}
          />
        </div>

        {/* Right Column: Schedule Card spanning full height */}
        <ClassScheduleCard
          scheduleInstances={classData.scheduleInstances}
          scheduleExceptions={classData.scheduleExceptions}
          location={classData.location}
          calendarColor={classData.calendarColor}
          onEdit={canEdit ? () => setIsEditScheduleOpen(true) : undefined}
          onEditInstance={canEdit ? handleEditInstance : undefined}
        />
      </div>

      {/* Edit Modals */}
      <EditClassBasicsModal
        isOpen={isEditBasicsOpen}
        onClose={() => setIsEditBasicsOpen(false)}
        className={classData.className}
        program={classData.program}
        description={classData.description}
        level={classData.level}
        type={classData.type}
        style={classData.style}
        onSave={(data) => {
          handleUpdateClass(data);
          setIsEditBasicsOpen(false);
        }}
      />

      <EditClassScheduleModal
        isOpen={isEditScheduleOpen}
        onClose={() => setIsEditScheduleOpen(false)}
        scheduleInstances={classData.scheduleInstances}
        location={classData.location}
        calendarColor={classData.calendarColor}
        onSave={(data) => {
          handleUpdateClass(data);
          setIsEditScheduleOpen(false);
        }}
      />

      <EditClassSettingsModal
        isOpen={isEditSettingsOpen}
        onClose={() => setIsEditSettingsOpen(false)}
        maximumCapacity={classData.maximumCapacity}
        minimumAge={classData.minimumAge}
        allowWalkIns={classData.allowWalkIns}
        onSave={(data) => {
          handleUpdateClass(data);
          setIsEditSettingsOpen(false);
        }}
      />

      {instanceEditState && (
        <EditScheduleInstanceModal
          isOpen={isEditInstanceOpen}
          onClose={() => {
            setIsEditInstanceOpen(false);
            setInstanceEditState(null);
          }}
          scheduleInstance={instanceEditState.instance}
          selectedDate={instanceEditState.date}
          existingException={instanceEditState.existingException}
          onSaveException={handleSaveException}
          onDeleteException={handleDeleteException}
        />
      )}

      {/* Delete Button */}
      {canEdit && (
        <div className="flex justify-end">
          <Button
            variant="destructive"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('delete_button')}
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteClassAlertDialog
        isOpen={isDeleteDialogOpen}
        classDisplayName={classData.className}
        onCloseAction={() => setIsDeleteDialogOpen(false)}
        onConfirmAction={handleDeleteClass}
      />
    </div>
  );
}
