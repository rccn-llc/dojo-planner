'use client';

import type { ClassSchedule, ClassScheduleException } from '@/services/ClassesService';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';

type UpcomingSessionsCardProps = {
  schedule: ClassSchedule[];
  exceptions: ClassScheduleException[];
  /** How many weeks ahead to project. */
  weeksAhead?: number;
  /** Max sessions to show. */
  limit?: number;
};

type UpcomingSession = {
  key: string;
  date: Date;
  startTime: string;
  endTime: string;
  cancelled: boolean;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(hhmm: string): string {
  const [h = '0', m = '00'] = hhmm.split(':');
  const hour = Number.parseInt(h, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 || 12;
  return `${display}:${m.padStart(2, '0')} ${period}`;
}

/**
 * Projects the recurring weekly schedule forward and lists the next few
 * sessions, marking any date with a cancellation exception as cancelled (#248).
 * Pure client-side computation from the schedule instances + exceptions.
 */
function computeUpcoming(
  schedule: ClassSchedule[],
  exceptions: ClassScheduleException[],
  from: Date,
  weeksAhead: number,
): UpcomingSession[] {
  const sessions: UpcomingSession[] = [];
  const horizonDays = weeksAhead * 7;

  for (let offset = 0; offset <= horizonDays; offset++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    const dow = day.getDay();
    for (const s of schedule) {
      if (s.dayOfWeek !== dow) {
        continue;
      }
      const cancellation = exceptions.find(
        e => e.exceptionType === 'cancelled' && sameDay(new Date(e.exceptionDate), day),
      );
      const modification = exceptions.find(
        e => e.exceptionType !== 'cancelled' && sameDay(new Date(e.exceptionDate), day),
      );
      sessions.push({
        key: `${s.id}-${day.toISOString().slice(0, 10)}`,
        date: day,
        startTime: modification?.newStartTime ?? s.startTime,
        endTime: modification?.newEndTime ?? s.endTime,
        cancelled: Boolean(cancellation),
      });
    }
  }
  return sessions;
}

export function UpcomingSessionsCard({ schedule, exceptions, weeksAhead = 4, limit = 8 }: UpcomingSessionsCardProps) {
  const t = useTranslations('ClassDetailPage.UpcomingSessionsCard');

  const sessions = useMemo(() => {
    // `new Date()` is evaluated once per render; acceptable for a read-only view.
    const now = new Date();
    return computeUpcoming(schedule, exceptions, now, weeksAhead).slice(0, limit);
  }, [schedule, exceptions, weeksAhead, limit]);

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{t('title')}</h2>
      {sessions.length === 0
        ? (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          )
        : (
            <div className="space-y-2">
              {sessions.map(s => (
                <div key={s.key} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {DAY_NAMES[s.date.getDay()]}
                      {', '}
                      {s.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(s.startTime)}
                      {' – '}
                      {formatTime(s.endTime)}
                    </p>
                  </div>
                  {s.cancelled && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      {t('cancelled')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
    </Card>
  );
}
