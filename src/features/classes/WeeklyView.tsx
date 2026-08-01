'use client';

import type { ClassFilters } from './ClassFilterBar';
import { useOrganization } from '@clerk/nextjs';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroupItem, ButtonGroupRoot } from '@/components/ui/button-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useClassesCache } from '@/hooks/useClassesCache';
import { useEventsCache } from '@/hooks/useEventsCache';
import { useOrganizationLocation } from '@/hooks/useOrganizationLocation';
import { CalendarDateNav } from './CalendarDateNav';
import { buildClassColorLegend, generateWeeklyEventScheduleFromData, generateWeeklyScheduleFromData, transformClassesToCardProps } from './classDataTransformers';
import { ClassEventHoverCard } from './ClassEventHoverCard';
import { ClassFilterBar } from './ClassFilterBar';

const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6 AM to 10 PM

type WeeklyViewProps = {
  withFilters?: ClassFilters;
};

export function WeeklyView({ withFilters }: WeeklyViewProps = {}) {
  const { organization } = useOrganization();
  const { classes: rawClasses, loading: classesLoading } = useClassesCache(organization?.id);
  const { events: rawEvents, loading: eventsLoading } = useEventsCache(organization?.id);
  const { location: orgLocation } = useOrganizationLocation();
  const locationLabel = orgLocation.address ?? '';
  const loading = classesLoading || eventsLoading;

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [localFilters, setLocalFilters] = useState<ClassFilters>({
    search: '',
    tag: 'all',
    instructor: 'all',
  });

  // Transform database data to card props for filtering
  const classes = useMemo(() => transformClassesToCardProps(rawClasses, locationLabel), [rawClasses, locationLabel]);

  // Use parent filters if provided, otherwise use local filters
  const filters = withFilters || localFilters;
  const setFilters = withFilters ? () => {} : setLocalFilters;

  const dayOfWeek = currentDate.getDay();
  const weekStart = new Date(currentDate);
  weekStart.setDate(currentDate.getDate() - dayOfWeek);

  // Get unique instructors from classes
  const allInstructors = useMemo(
    () => Array.from(new Set(classes.flatMap(cls => cls.instructors.map(i => i.name)))),
    [classes],
  );

  // Filter classes based on filters
  const filteredClasses = useMemo(() => classes.filter((cls) => {
    const matchesSearch = cls.name.toLowerCase().includes(filters.search.toLowerCase())
      || cls.description.toLowerCase().includes(filters.search.toLowerCase());
    const matchesTag = filters.tag === 'all' || cls.type === filters.tag || cls.style === filters.tag;
    const matchesInstructor = filters.instructor === 'all'
      || cls.instructors.some(i => i.name === filters.instructor);
    return matchesSearch && matchesTag && matchesInstructor;
  }), [classes, filters]);

  // Get filtered class IDs for schedule generation
  const filteredClassIds = useMemo(() => new Set(filteredClasses.map(c => c.id)), [filteredClasses]);

  const handlePrevious = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Calculate week end date (Saturday)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // Format date range display
  const startMonth = weekStart.toLocaleString('default', { month: 'long' });
  const endMonth = weekEnd.toLocaleString('default', { month: 'long' });

  // If week spans two months, show both month names
  const dateDisplay = startMonth === endMonth
    ? `${startMonth} ${weekStart.getDate()} - ${weekEnd.getDate()}`
    : `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}`;

  // Generate weekly events from filtered classes
  const classesToUse = useMemo(
    () => filteredClassIds.size > 0
      ? rawClasses.filter(c => filteredClassIds.has(c.id))
      : rawClasses,
    [rawClasses, filteredClassIds],
  );
  const weeklyClassEvents = useMemo(
    () => generateWeeklyScheduleFromData(currentDate, classesToUse),
    [currentDate, classesToUse],
  );
  const weeklyEventSessions = useMemo(
    () => generateWeeklyEventScheduleFromData(currentDate, rawEvents),
    [currentDate, rawEvents],
  );
  const weeklyEvents = useMemo(
    () => [...weeklyClassEvents, ...weeklyEventSessions],
    [weeklyClassEvents, weeklyEventSessions],
  );

  // Build color legend from database classes and events
  const classColors = useMemo(() => buildClassColorLegend(rawClasses, rawEvents), [rawClasses, rawEvents]);

  const getEventsForTimeSlot = (dayIndex: number, hour: number) => {
    return weeklyEvents.filter(
      event => event.dayOfWeek === dayIndex && event.hour === hour,
    );
  };

  const formatHour = (hour: number) => {
    if (hour === 0) {
      return '12:00 AM';
    }
    if (hour < 12) {
      return `${hour}:00 AM`;
    }
    if (hour === 12) {
      return '12:00 PM';
    }
    return `${hour - 12}:00 PM`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-125 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - Only show when not embedded */}
      {!withFilters && (
        <div>
          <h1 className="text-3xl font-bold text-foreground">Class Calendar</h1>
        </div>
      )}

      {/* Controls - Only show when not embedded */}
      {!withFilters && (
        <div className="space-y-4">
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
              <ButtonGroupRoot value="weekly" onValueChange={() => {}}>
                <ButtonGroupItem value="cards" title="Cards view">
                  <span className="text-xs">Cards</span>
                </ButtonGroupItem>
                <ButtonGroupItem value="weekly" title="Weekly view">
                  <span className="text-xs">Weekly</span>
                </ButtonGroupItem>
                <ButtonGroupItem value="monthly" title="Monthly view">
                  <span className="text-xs">Monthly</span>
                </ButtonGroupItem>
              </ButtonGroupRoot>

              {/* Add New Class Button */}
              <Button>
                <Plus className="size-4" />
                <span className="ml-1 hidden sm:inline">Add New Class</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrevious}
            className="flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            ← Previous
          </button>
          <CalendarDateNav
            currentDate={currentDate}
            onDateChangeAction={setCurrentDate}
            display={dateDisplay}
          />
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            Next →
          </button>
        </div>
        <Button onClick={handleToday} className="bg-blue-600 hover:bg-blue-700">
          Today
        </Button>
      </div>

      {/* Weekly Schedule Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full table-fixed border-collapse">
          {/* Header with days */}
          <thead className="bg-muted">
            <tr>
              <th className="w-20 border-r border-border p-2 text-center text-sm font-semibold text-foreground">Time</th>
              {Array.from({ length: 7 }).map((_, i) => {
                const date = new Date(weekStart);
                date.setDate(weekStart.getDate() + i);
                const today = new Date();
                const isToday
                  = date.getFullYear() === today.getFullYear()
                    && date.getMonth() === today.getMonth()
                    && date.getDate() === today.getDate();
                return (
                  <th
                    key={date.toISOString()}
                    className={`border-r border-border p-2 text-center text-xs font-semibold last:border-r-0 sm:text-sm ${
                      isToday ? 'bg-blue-50 text-primary dark:bg-blue-950/40' : 'text-foreground'
                    }`}
                    aria-current={isToday ? 'date' : undefined}
                  >
                    <div>{DAYS_OF_WEEK[i]}</div>
                    <div>{date.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Time slots */}
          <tbody className="bg-background">
            {HOURS.map(hour => (
              <tr key={hour} className="border-b border-border">
                {/* Time label */}
                <td className="w-20 border-r border-border p-1 text-center text-xs text-muted-foreground sm:p-2 sm:text-sm">
                  {formatHour(hour)}
                </td>

                {/* Day cells */}
                {Array.from({ length: 7 }).map((_, dayIndex) => {
                  const events = getEventsForTimeSlot(dayIndex, hour);
                  return (
                    <td
                      key={`${DAYS_OF_WEEK[dayIndex]}-${hour}`}
                      className="border-r border-border p-1 align-top last:border-r-0 sm:p-2"
                      style={{ minHeight: '60px', height: '60px' }}
                    >
                      {events.map(event => (
                        <ClassEventHoverCard
                          key={`${event.classId}-${event.hour}-${event.minute}-${event.date ?? ''}`}
                          classId={event.classId}
                          className={event.className}
                          color={event.color}
                          hour={event.hour}
                          minute={event.minute}
                          duration={event.duration}
                          exception={event.exception}
                          sourceView="weekly"
                          isEvent={event.isEvent}
                          eventId={event.eventId}
                        >
                          {event.className}
                        </ClassEventHoverCard>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-border p-4">
        {Object.entries(classColors).map(([className, color]) => (
          <div key={className} className="flex items-center gap-2">
            <div
              className="size-3 rounded"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-foreground sm:text-sm">{className}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
