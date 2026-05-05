/**
 * Transforms database class/event data to the format expected by UI components.
 * This bridges the gap between database schema and component props.
 */

import type { ClassData, ClassSchedule } from '@/services/ClassesService';
import type { EventData } from '@/services/EventsService';
import type { ClassCardProps, ScheduleItem } from '@/templates/ClassCard';
import type { EventCardProps, EventSession as EventCardSession } from '@/templates/EventCard';

// =============================================================================
// CONSTANTS
// =============================================================================

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Default instructor when none assigned (Clerk ID not available)
const DEFAULT_INSTRUCTOR = {
  name: 'TBD',
  photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format time from 24h (HH:MM) to 12h format (H:MM AM/PM)
 */
function formatTime(time: string): string {
  const [hoursStr, minutesStr] = time.split(':');
  const hours = Number(hoursStr) || 0;
  const minutes = Number(minutesStr) || 0;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Convert schedule instances to ScheduleItem format
 */
function transformSchedule(schedule: ClassSchedule[]): ScheduleItem[] {
  return schedule.map(s => ({
    day: DAY_NAMES[s.dayOfWeek] || 'Unknown',
    time: `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`,
  }));
}

/**
 * Extract level from tags (Beginner, Intermediate, Advanced, or All Levels)
 */
function extractLevel(tags: { name: string }[]): string {
  const levelTags = ['Beginner', 'Intermediate', 'Advanced'];
  const found = tags.find(t => levelTags.includes(t.name));
  return found?.name || 'All Levels';
}

/**
 * Extract type from tags (Adults, Kids, Competition, etc.)
 */
function extractType(tags: { name: string }[]): string {
  const typeTags = ['Adults', 'Kids', 'Competition', 'Event'];
  const found = tags.find(t => typeTags.includes(t.name));
  return found?.name || 'Adults';
}

/**
 * Extract style from tags (Gi, No-Gi)
 */
function extractStyle(tags: { name: string }[]): string {
  const styleTags = ['Gi', 'No-Gi'];
  const found = tags.find(t => styleTags.includes(t.name));
  return found?.name || 'Gi';
}

/**
 * Generate avatar URL from name
 */
function getAvatarUrl(name: string): string {
  const seed = name.replace(/\s+/g, '');
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
}

// =============================================================================
// TRANSFORMERS
// =============================================================================

/**
 * Transform database ClassData to ClassCardProps
 */
export function transformClassToCardProps(classData: ClassData, location: string = ''): ClassCardProps {
  // For now, we don't have instructor data from Clerk, so we use placeholders
  // In a full implementation, you would fetch instructor details from Clerk API
  const instructors = classData.schedule
    .filter(s => s.instructorClerkId)
    .map(s => ({
      name: `Instructor`, // Would be fetched from Clerk
      photoUrl: getAvatarUrl(s.instructorClerkId || 'default'),
    }))
    .filter((v, i, a) => a.findIndex(t => t.name === v.name) === i); // Dedupe

  // If no instructors assigned, show TBD
  if (instructors.length === 0) {
    instructors.push(DEFAULT_INSTRUCTOR);
  }

  return {
    id: classData.id,
    name: classData.name,
    description: classData.description || '',
    level: extractLevel(classData.tags),
    type: extractType(classData.tags),
    style: extractStyle(classData.tags),
    schedule: transformSchedule(classData.schedule),
    location,
    instructors,
  };
}

/**
 * Transform database EventData to EventCardProps
 */
export function transformEventToCardProps(eventData: EventData, location: string = ''): EventCardProps {
  // Get date range from sessions
  const sortedSessions = [...eventData.sessions].sort(
    (a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime(),
  );

  const startDate = sortedSessions[0]?.sessionDate
    ? new Date(sortedSessions[0].sessionDate).toISOString().split('T')[0] ?? ''
    : '';
  const endDate = sortedSessions.at(-1)?.sessionDate
    ? new Date(sortedSessions.at(-1)!.sessionDate).toISOString().split('T')[0] ?? startDate
    : startDate;

  // Transform sessions
  const sessions: EventCardSession[] = eventData.sessions.map(s => ({
    date: new Date(s.sessionDate).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    time: `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`,
  }));

  // Get price from billing (use first/lowest price)
  const lowestPrice = eventData.billing.length > 0
    ? Math.min(...eventData.billing.map(b => b.price))
    : null;

  // Instructors placeholder
  const instructors = eventData.sessions
    .filter(s => s.instructorClerkId)
    .map(s => ({
      name: `Instructor`,
      photoUrl: getAvatarUrl(s.instructorClerkId || 'default'),
    }))
    .filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);

  if (instructors.length === 0) {
    instructors.push(DEFAULT_INSTRUCTOR);
  }

  return {
    id: eventData.id,
    name: eventData.name,
    description: eventData.description || '',
    eventType: eventData.eventType,
    startDate,
    endDate,
    sessions,
    location,
    instructors,
    price: lowestPrice,
  };
}

/**
 * Transform array of classes
 */
export function transformClassesToCardProps(classes: ClassData[], location: string = ''): ClassCardProps[] {
  return classes
    .filter(c => c.isActive !== false)
    .map(c => transformClassToCardProps(c, location));
}

/**
 * Transform array of events
 */
export function transformEventsToCardProps(events: EventData[], location: string = ''): EventCardProps[] {
  return events
    .filter(e => e.isActive !== false)
    .map(e => transformEventToCardProps(e, location));
}

// =============================================================================
// CALENDAR VIEW TYPES AND FUNCTIONS
// =============================================================================

export type ScheduleExceptionType = 'deleted' | 'modified' | 'modified-forward';

export type CalendarScheduleException = {
  classId: string;
  date: string; // YYYY-MM-DD format
  type: ScheduleExceptionType;
  originalHour?: number;
  originalMinute?: number;
  newHour?: number;
  newMinute?: number;
  newDuration?: number;
  newInstructor?: string;
  note?: string;
};

export type CalendarEvent = {
  classId: string;
  className: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  hour: number; // 0-23
  minute: number; // 0-59
  duration: number; // in minutes
  color: string;
  date?: string; // YYYY-MM-DD format for specific instances
  exception?: CalendarScheduleException;
  isEvent?: boolean; // true for events (seminars, workshops), false/undefined for classes
  eventId?: string; // event ID when isEvent is true
};

/**
 * Parse time string (HH:MM) into hour and minute
 */
function parseTime(timeStr: string): { hour: number; minute: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hour: hours || 0, minute: minutes || 0 };
}

/**
 * Calculate duration in minutes between two time strings
 */
function calculateDuration(startTime: string, endTime: string): number {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  return (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute);
}

/**
 * Get a color for a class based on its name and tags
 */
function getClassColor(classData: ClassData): string {
  // Use class's own color if set
  if (classData.color) {
    return classData.color;
  }

  // Use program color if available
  if (classData.program?.color) {
    return classData.program.color;
  }

  // Fallback to name-based colors
  const name = classData.name.toLowerCase();
  if (name.includes('fundamentals')) {
    return '#22c55e'; // green
  }
  if (name.includes('advanced') || name.includes('competition')) {
    return '#a855f7'; // purple
  }
  if (name.includes('kids')) {
    return '#06b6d4'; // cyan
  }
  if (name.includes('women')) {
    return '#ec4899'; // pink
  }
  if (name.includes('open')) {
    return '#ef4444'; // red
  }
  if (name.includes('intermediate')) {
    return '#22c55e'; // green
  }
  return '#6b7280'; // gray
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDateStr(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Transform database schedule exceptions to calendar format
 */
function transformExceptions(classData: ClassData): CalendarScheduleException[] {
  return classData.scheduleExceptions.map((exc) => {
    const scheduleInstance = classData.schedule.find(s => s.id === exc.classScheduleInstanceId);
    const originalTime = scheduleInstance ? parseTime(scheduleInstance.startTime) : { hour: 0, minute: 0 };
    const newTime = exc.newStartTime ? parseTime(exc.newStartTime) : undefined;

    let duration: number | undefined;
    if (exc.newStartTime && exc.newEndTime) {
      duration = calculateDuration(exc.newStartTime, exc.newEndTime);
    }

    return {
      classId: classData.id,
      date: formatDateStr(new Date(exc.exceptionDate)),
      type: exc.exceptionType as ScheduleExceptionType,
      originalHour: originalTime.hour,
      originalMinute: originalTime.minute,
      newHour: newTime?.hour,
      newMinute: newTime?.minute,
      newDuration: duration,
      newInstructor: exc.newInstructorClerkId || undefined,
      note: exc.reason || undefined,
    };
  });
}

/**
 * Generate weekly schedule from database classes
 */
export function generateWeeklyScheduleFromData(
  startDate: Date,
  classes: ClassData[],
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const dayOfWeek = startDate.getDay();
  const weekStart = new Date(Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate() - dayOfWeek,
  ));

  // Collect all exceptions from all classes
  const allExceptions: CalendarScheduleException[] = classes.flatMap(transformExceptions);

  for (const classData of classes) {
    // Skip inactive classes
    if (classData.isActive === false) {
      continue;
    }

    const color = getClassColor(classData);

    for (const schedule of classData.schedule) {
      const { hour, minute } = parseTime(schedule.startTime);
      const duration = calculateDuration(schedule.startTime, schedule.endTime);

      // Calculate the actual date for this event in the current week
      const eventDate = new Date(Date.UTC(
        weekStart.getUTCFullYear(),
        weekStart.getUTCMonth(),
        weekStart.getUTCDate() + schedule.dayOfWeek,
      ));
      const dateStr = formatDateStr(eventDate);

      // Check if there's an exception for this class on this date
      const exception = allExceptions.find(
        exc =>
          exc.classId === classData.id
          && exc.date === dateStr
          && (exc.originalHour === undefined || exc.originalHour === hour)
          && (exc.originalMinute === undefined || exc.originalMinute === minute),
      );

      // Still add deleted events (will be shown with strikethrough)
      if (exception?.type === 'deleted') {
        events.push({
          classId: classData.id,
          className: classData.name,
          dayOfWeek: schedule.dayOfWeek,
          hour,
          minute,
          duration,
          color,
          date: dateStr,
          exception,
        });
        continue;
      }

      // Apply modifications from exception
      const finalHour = exception?.newHour ?? hour;
      const finalMinute = exception?.newMinute ?? minute;
      const finalDuration = exception?.newDuration ?? duration;

      events.push({
        classId: classData.id,
        className: classData.name,
        dayOfWeek: schedule.dayOfWeek,
        hour: finalHour,
        minute: finalMinute,
        duration: finalDuration,
        color,
        date: dateStr,
        exception,
      });
    }
  }

  return events;
}

/**
 * Generate monthly schedule from database classes
 */
export function generateMonthlyScheduleFromData(
  year: number,
  month: number,
  classes: ClassData[],
): Record<string, CalendarEvent[]> {
  const monthlyEvents: Record<string, CalendarEvent[]> = {};
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Collect all exceptions from all classes
  const allExceptions: CalendarScheduleException[] = classes.flatMap(transformExceptions);

  // Build a map of which classes run on which days of week
  const classesByDayOfWeek = new Map<number, { classData: ClassData; schedule: ClassSchedule }[]>();
  for (const classData of classes) {
    if (classData.isActive === false) {
      continue;
    }

    for (const schedule of classData.schedule) {
      const existing = classesByDayOfWeek.get(schedule.dayOfWeek) || [];
      existing.push({ classData, schedule });
      classesByDayOfWeek.set(schedule.dayOfWeek, existing);
    }
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month, day));
    const dayOfWeek = date.getUTCDay();
    const dateStr = formatDateStr(date);
    monthlyEvents[day.toString()] = [];

    const classesForDay = classesByDayOfWeek.get(dayOfWeek) || [];

    for (const { classData, schedule } of classesForDay) {
      const { hour, minute } = parseTime(schedule.startTime);
      const duration = calculateDuration(schedule.startTime, schedule.endTime);
      const color = getClassColor(classData);

      // Check for exceptions on this date
      const exception = allExceptions.find(
        exc => exc.classId === classData.id && exc.date === dateStr,
      );

      monthlyEvents[day.toString()]!.push({
        classId: classData.id,
        className: classData.name,
        dayOfWeek,
        hour,
        minute,
        duration,
        color,
        date: dateStr,
        exception,
      });
    }
  }

  return monthlyEvents;
}

// =============================================================================
// EVENT CALENDAR FUNCTIONS
// =============================================================================

const EVENT_COLOR = '#f97316'; // orange for events

/**
 * Get a color for an event based on its type
 */
function getEventColor(eventData: EventData): string {
  const type = eventData.eventType.toLowerCase();
  if (type.includes('seminar')) {
    return '#f97316'; // orange
  }
  if (type.includes('workshop')) {
    return '#8b5cf6'; // violet
  }
  if (type.includes('tournament') || type.includes('competition')) {
    return '#ef4444'; // red
  }
  return EVENT_COLOR;
}

/**
 * Generate weekly schedule entries from event sessions.
 * Events have specific dates (not recurring), so we only include sessions
 * that fall within the given week.
 */
export function generateWeeklyEventScheduleFromData(
  startDate: Date,
  events: EventData[],
): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  const dayOfWeek = startDate.getDay();
  const weekStart = new Date(Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate() - dayOfWeek,
  ));
  const weekEnd = new Date(Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate() + 7,
  ));

  for (const eventData of events) {
    if (eventData.isActive === false) {
      continue;
    }

    const color = getEventColor(eventData);

    for (const session of eventData.sessions) {
      const sessionDate = new Date(session.sessionDate);
      const dateStr = formatDateStr(sessionDate);

      // Check if session falls within the current week
      if (sessionDate >= weekStart && sessionDate < weekEnd) {
        const { hour, minute } = parseTime(session.startTime);
        const duration = calculateDuration(session.startTime, session.endTime);
        const sessionDayOfWeek = sessionDate.getUTCDay();

        result.push({
          classId: eventData.id,
          className: eventData.name,
          dayOfWeek: sessionDayOfWeek,
          hour,
          minute,
          duration,
          color,
          date: dateStr,
          isEvent: true,
          eventId: eventData.id,
        });
      }
    }
  }

  return result;
}

/**
 * Generate monthly schedule entries from event sessions.
 * Events have specific dates, so we only include sessions in the given month.
 */
export function generateMonthlyEventScheduleFromData(
  year: number,
  month: number,
  events: EventData[],
): Record<string, CalendarEvent[]> {
  const monthlyEvents: Record<string, CalendarEvent[]> = {};

  for (const eventData of events) {
    if (eventData.isActive === false) {
      continue;
    }

    const color = getEventColor(eventData);

    for (const session of eventData.sessions) {
      const sessionDate = new Date(session.sessionDate);
      const sessionYear = sessionDate.getUTCFullYear();
      const sessionMonth = sessionDate.getUTCMonth();
      const sessionDay = sessionDate.getUTCDate();

      // Only include sessions in the target month
      if (sessionYear === year && sessionMonth === month) {
        const { hour, minute } = parseTime(session.startTime);
        const duration = calculateDuration(session.startTime, session.endTime);
        const dateStr = formatDateStr(sessionDate);
        const dayKey = sessionDay.toString();

        if (!monthlyEvents[dayKey]) {
          monthlyEvents[dayKey] = [];
        }

        monthlyEvents[dayKey].push({
          classId: eventData.id,
          className: eventData.name,
          dayOfWeek: sessionDate.getUTCDay(),
          hour,
          minute,
          duration,
          color,
          date: dateStr,
          isEvent: true,
          eventId: eventData.id,
        });
      }
    }
  }

  return monthlyEvents;
}

/**
 * Build a color legend from classes and events
 */
export function buildClassColorLegend(
  classes: ClassData[],
  events?: EventData[],
): Record<string, string> {
  const legend: Record<string, string> = {};
  for (const classData of classes) {
    if (classData.isActive !== false) {
      legend[classData.name] = getClassColor(classData);
    }
  }
  if (events) {
    for (const eventData of events) {
      if (eventData.isActive !== false) {
        legend[eventData.name] = getEventColor(eventData);
      }
    }
  }
  return legend;
}
