'use client';

import type { ClassFilters } from './ClassFilterBar';
import { useOrganization } from '@clerk/nextjs';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroupItem, ButtonGroupRoot } from '@/components/ui/button-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useClassesCache } from '@/hooks/useClassesCache';
import { useEventsCache } from '@/hooks/useEventsCache';
import { useOrganizationLocation } from '@/hooks/useOrganizationLocation';
import { CalendarDateNav } from './CalendarDateNav';
import { buildClassColorLegend, generateMonthlyEventScheduleFromData, generateMonthlyScheduleFromData, transformClassesToCardProps } from './classDataTransformers';
import { ClassEventHoverCard } from './ClassEventHoverCard';
import { ClassFilterBar } from './ClassFilterBar';

const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

type MonthlyViewProps = {
  withFilters?: ClassFilters;
};

export function MonthlyView({ withFilters }: MonthlyViewProps = {}) {
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

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

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

  // Generate monthly events from filtered classes
  const classesToUse = useMemo(
    () => filteredClassIds.size > 0
      ? rawClasses.filter(c => filteredClassIds.has(c.id))
      : rawClasses,
    [rawClasses, filteredClassIds],
  );
  const monthlyClassEvents = useMemo(
    () => generateMonthlyScheduleFromData(year, month, classesToUse),
    [year, month, classesToUse],
  );
  const monthlyEventSessions = useMemo(
    () => generateMonthlyEventScheduleFromData(year, month, rawEvents),
    [year, month, rawEvents],
  );
  const monthlyEvents = useMemo(() => {
    const merged = { ...monthlyClassEvents };
    for (const [day, events] of Object.entries(monthlyEventSessions)) {
      merged[day] = [...(merged[day] || []), ...events];
    }
    return merged;
  }, [monthlyClassEvents, monthlyEventSessions]);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const handlePrevious = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNext = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const dateDisplay = `${monthName} ${currentDate.getFullYear()}`;

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  // Create weeks array with stable keys based on the first non-null day or position
  const weeks: { key: string; days: (number | null)[] }[] = [];
  const numWeeks = Math.ceil(calendarDays.length / 7);
  for (let weekIdx = 0; weekIdx < numWeeks; weekIdx++) {
    const weekDays = calendarDays.slice(weekIdx * 7, weekIdx * 7 + 7);
    const firstDay = weekDays.find(d => d !== null) ?? weekIdx * 7;
    weeks.push({
      key: `${year}-${month}-day-${firstDay}`,
      days: weekDays,
    });
  }

  // Build color legend from database classes and events
  const classColors = useMemo(() => buildClassColorLegend(rawClasses, rawEvents), [rawClasses, rawEvents]);

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
              <ButtonGroupRoot value="monthly" onValueChange={() => {}}>
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
                <Plus className="h-4 w-4" />
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

      {/* Calendar Grid */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full table-fixed border-collapse">
          {/* Header with days of week */}
          <thead className="bg-muted">
            <tr>
              {DAYS_OF_WEEK.map(day => (
                <th
                  key={day}
                  className="border-r border-border p-2 text-center text-sm font-semibold text-foreground last:border-r-0 sm:p-3"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>

          {/* Calendar cells */}
          <tbody className="bg-background">
            {weeks.map(week => (
              <tr key={week.key} className="border-b border-border last:border-b-0">
                {week.days.map((day) => {
                  const today = new Date();
                  const isToday = day !== null
                    && today.getFullYear() === year
                    && today.getMonth() === month
                    && today.getDate() === day;
                  return (
                    <td
                      key={day ?? `empty-${week.key}`}
                      className={`h-20 border-r border-border p-1 align-top last:border-r-0 sm:h-24 sm:p-2 ${
                        !day ? 'bg-muted' : isToday ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                      }`}
                      aria-current={isToday ? 'date' : undefined}
                    >
                      {day && (
                        <>
                          <div className={`mb-1 text-sm font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>{day}</div>
                          <div className="flex flex-col gap-1">
                            {monthlyEvents[day.toString()]?.slice(0, 3).map(event => (
                              <ClassEventHoverCard
                                key={`${event.classId}-${day}-${event.hour}-${event.minute}`}
                                classId={event.classId}
                                className={event.className}
                                color={event.color}
                                hour={event.hour}
                                minute={event.minute}
                                duration={event.duration}
                                exception={event.exception}
                                sourceView="monthly"
                                isEvent={event.isEvent}
                                eventId={event.eventId}
                              >
                                <span className="truncate">{event.className}</span>
                              </ClassEventHoverCard>
                            ))}
                            {(monthlyEvents[day.toString()]?.length ?? 0) > 3 && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
                                    aria-label={`Show all ${monthlyEvents[day.toString()]!.length} events for ${monthName} ${day}`}
                                  >
                                    +
                                    {monthlyEvents[day.toString()]!.length - 3}
                                    {' more'}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-72 p-2">
                                  <div className="mb-2 text-sm font-semibold text-foreground">
                                    {monthName}
                                    {' '}
                                    {day}
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    {monthlyEvents[day.toString()]!.map(event => (
                                      <ClassEventHoverCard
                                        key={`expanded-${event.classId}-${event.hour}-${event.minute}`}
                                        classId={event.classId}
                                        className={event.className}
                                        color={event.color}
                                        hour={event.hour}
                                        minute={event.minute}
                                        duration={event.duration}
                                        exception={event.exception}
                                        sourceView="monthly"
                                        isEvent={event.isEvent}
                                        eventId={event.eventId}
                                      >
                                        <span className="truncate">{event.className}</span>
                                      </ClassEventHoverCard>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </>
                      )}
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
              className="h-3 w-3 rounded"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-foreground sm:text-sm">{className}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
