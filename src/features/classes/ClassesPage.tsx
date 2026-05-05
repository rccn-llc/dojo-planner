'use client';

import type { ClassFilters } from './ClassFilterBar';
import type { ClassCardProps } from '@/templates/ClassCard';
import type { EventCardProps } from '@/templates/EventCard';
import { useOrganization } from '@clerk/nextjs';
import { CalendarDays, CalendarRange, Grid3x3, Plus, Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroupItem, ButtonGroupRoot } from '@/components/ui/button-group';
import { Skeleton } from '@/components/ui/skeleton';
import { invalidateClassesCache, useClassesCache } from '@/hooks/useClassesCache';
import { invalidateEventsCache, useEventsCache } from '@/hooks/useEventsCache';
import { useHasRole } from '@/hooks/useHasRole';
import { useOrganizationLocation } from '@/hooks/useOrganizationLocation';
import { ClassCard } from '@/templates/ClassCard';
import { EventCard } from '@/templates/EventCard';
import { StatsCards } from '@/templates/StatsCards';
import { ORG_ROLE } from '@/types/Auth';
import { transformClassesToCardProps, transformEventsToCardProps } from './classDataTransformers';
import { ClassFilterBar } from './ClassFilterBar';
import { ClassTagsManagement } from './ClassTagsManagement';
import { MonthlyView } from './MonthlyView';
import { WeeklyView } from './WeeklyView';
import { AddClassModal } from './wizard';

const VALID_VIEWS = ['grid', 'weekly', 'monthly'] as const;
type ViewType = (typeof VALID_VIEWS)[number];

export function ClassesPage() {
  const t = useTranslations('ClassesPage');
  const canEdit = useHasRole(ORG_ROLE.ACADEMY_OWNER);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization } = useOrganization();

  // Fetch data from database with caching
  const { classes: rawClasses, loading: classesLoading } = useClassesCache(organization?.id);
  const { events: rawEvents, loading: eventsLoading } = useEventsCache(organization?.id);
  const { location: orgLocation } = useOrganizationLocation();
  const locationLabel = orgLocation.address ?? '';

  // Transform database data to card props format
  const classes = useMemo(() => transformClassesToCardProps(rawClasses, locationLabel), [rawClasses, locationLabel]);
  const events = useMemo(() => transformEventsToCardProps(rawEvents, locationLabel), [rawEvents, locationLabel]);

  const loading = classesLoading || eventsLoading;

  // Get initial view from URL or default to 'grid'
  const viewParam = searchParams.get('view');
  const initialView: ViewType = VALID_VIEWS.includes(viewParam as ViewType) ? (viewParam as ViewType) : 'grid';

  const [viewType, setViewType] = useState<ViewType>(initialView);
  const [isTagsSheetOpen, setIsTagsSheetOpen] = useState(false);
  const [isAddClassModalOpen, setIsAddClassModalOpen] = useState(false);
  const [filters, setFilters] = useState<ClassFilters>({
    search: '',
    tag: 'all',
    instructor: 'all',
  });

  // Handle view type change and update URL
  const handleViewChange = useCallback((newView: string) => {
    setViewType(newView as ViewType);
    const params = new URLSearchParams(searchParams.toString());
    if (newView === 'grid') {
      params.delete('view');
    } else {
      params.set('view', newView);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [router, searchParams]);

  // Handle edit class navigation - preserve view param
  const handleEditClass = useCallback((id: string) => {
    const viewParam = viewType !== 'grid' ? `?view=${viewType}` : '';
    router.push(`/dashboard/classes/${id}${viewParam}`);
  }, [router, viewType]);

  // Handle new class creation - invalidate cache to refetch
  const handleClassCreated = useCallback(async (_newClass: ClassCardProps) => {
    await invalidateClassesCache();
  }, []);

  // Handle new event creation - invalidate cache to refetch
  const handleEventCreated = useCallback(async (_newEvent: EventCardProps) => {
    await invalidateEventsCache();
  }, []);

  // Handle edit event navigation
  const handleEditEvent = useCallback((id: string) => {
    const viewParam = viewType !== 'grid' ? `?view=${viewType}` : '';
    router.push(`/dashboard/classes/events/${id}${viewParam}`);
  }, [router, viewType]);

  // Get unique instructors from classes and events
  const allInstructors = Array.from(
    new Set([
      ...classes.flatMap(cls => cls.instructors.map(i => i.name)),
      ...events.flatMap(evt => evt.instructors.map(i => i.name)),
    ]),
  );

  // Calculate stats
  const stats = useMemo(() => {
    const uniqueTypes = new Set(classes.map(cls => cls.type));
    const uniqueStyles = new Set(classes.map(cls => cls.style));
    const totalTags = uniqueTypes.size + uniqueStyles.size;
    return {
      totalClasses: classes.length,
      totalEvents: events.length,
      totalTags,
      totalInstructors: allInstructors.length,
    };
  }, [classes, events.length, allInstructors.length]);

  // Filter classes based on filters
  // If "Event" tag is selected, hide all classes
  const filteredClasses = filters.tag === 'Event'
    ? []
    : classes.filter((cls) => {
        const matchesSearch = cls.name.toLowerCase().includes(filters.search.toLowerCase())
          || cls.description.toLowerCase().includes(filters.search.toLowerCase());
        const matchesTag = filters.tag === 'all' || cls.type === filters.tag || cls.style === filters.tag;
        const matchesInstructor = filters.instructor === 'all'
          || cls.instructors.some(i => i.name === filters.instructor);
        return matchesSearch && matchesTag && matchesInstructor;
      });

  // Filter events based on filters
  // "Event" tag matches all events; other tags should hide events unless they match eventType
  const filteredEvents = events.filter((evt) => {
    const matchesSearch = evt.name.toLowerCase().includes(filters.search.toLowerCase())
      || evt.description.toLowerCase().includes(filters.search.toLowerCase());
    const matchesTag = filters.tag === 'all' || filters.tag === 'Event' || evt.eventType === filters.tag;
    const matchesInstructor = filters.instructor === 'all'
      || evt.instructors.some(i => i.name === filters.instructor);
    return matchesSearch && matchesTag && matchesInstructor;
  });

  const statsData = useMemo(() => [
    { id: 'classes', label: t('total_classes_label'), value: stats.totalClasses },
    { id: 'events', label: t('total_events_label'), value: stats.totalEvents },
    { id: 'tags', label: t('total_tags_label'), value: stats.totalTags },
    { id: 'instructors', label: t('total_instructors_label'), value: stats.totalInstructors },
  ], [stats, t]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <StatsCards stats={statsData} columns={4} />

      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        {canEdit && (
          <Button variant="outline" onClick={() => setIsTagsSheetOpen(true)}>
            <Tags className="mr-1 size-4" />
            {t('manage_tags_button')}
          </Button>
        )}
      </div>

      {/* Controls - Shown for all views */}
      <div className="space-y-4">
        {/* Controls Row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {/* Filter Bar */}
          <div className="flex-1">
            <ClassFilterBar
              onFiltersChangeAction={setFilters}
              instructors={allInstructors}
            />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* View Toggle Button Group */}
            <ButtonGroupRoot value={viewType} onValueChange={handleViewChange}>
              <ButtonGroupItem value="grid" title="Grid view">
                <Grid3x3 className="h-4 w-4" />
                <span className="hidden text-sm sm:ml-1 sm:inline">{t('grid_view_label')}</span>
              </ButtonGroupItem>
              <ButtonGroupItem value="weekly" title="Weekly view">
                <CalendarRange className="h-4 w-4" />
                <span className="hidden text-sm sm:ml-1 sm:inline">Weekly</span>
              </ButtonGroupItem>
              <ButtonGroupItem value="monthly" title="Monthly view">
                <CalendarDays className="h-4 w-4" />
                <span className="hidden text-sm sm:ml-1 sm:inline">Monthly</span>
              </ButtonGroupItem>
            </ButtonGroupRoot>

            {/* Add New Class Button */}
            {canEdit && (
              <Button onClick={() => setIsAddClassModalOpen(true)}>
                <Plus className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">{t('add_new_class_button')}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Render Views */}
      {viewType === 'monthly' && (
        <MonthlyView withFilters={filters} />
      )}

      {viewType === 'weekly' && (
        <WeeklyView withFilters={filters} />
      )}

      {/* Render Grid View */}
      {viewType === 'grid' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map(eventItem => (
            <EventCard key={eventItem.id} {...eventItem} onEdit={handleEditEvent} />
          ))}
          {filteredClasses.map(classItem => (
            <ClassCard key={classItem.id} {...classItem} onEdit={handleEditClass} />
          ))}
        </div>
      )}

      {/* Class Tags Management Sheet */}
      <ClassTagsManagement
        open={isTagsSheetOpen}
        onOpenChange={setIsTagsSheetOpen}
      />

      {/* Add Class/Event Wizard Modal */}
      <AddClassModal
        isOpen={isAddClassModalOpen}
        onCloseAction={() => setIsAddClassModalOpen(false)}
        onClassCreated={handleClassCreated}
        onEventCreated={handleEventCreated}
      />
    </div>
  );
}
