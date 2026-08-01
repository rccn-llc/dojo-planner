'use client';

import type { ClassAttendanceRecord } from '@/services/ClassesService';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';

type ClassAttendanceCardProps = {
  records: ClassAttendanceRecord[];
};

function initials(first: string, last: string): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?';
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(date: Date | string | null): string {
  if (!date) {
    return '—';
  }
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Attendance roster for a class — past check-ins with member, date, and
 * check-in/out times. Renders an empty state when there are no records (#248).
 */
export function ClassAttendanceCard({ records }: ClassAttendanceCardProps) {
  const t = useTranslations('ClassDetailPage.AttendanceCard');

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{t('title')}</h2>
      {records.length === 0
        ? (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          )
        : (
            <div className="space-y-3">
              {records.map(r => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <Avatar className="size-9 shrink-0">
                    {r.memberPhotoUrl && <AvatarImage src={r.memberPhotoUrl} alt={`${r.memberFirstName} ${r.memberLastName}`} />}
                    <AvatarFallback>{initials(r.memberFirstName, r.memberLastName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{`${r.memberFirstName} ${r.memberLastName}`.trim()}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(r.attendanceDate)}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p>{t('checked_in', { time: formatTime(r.checkInTime) })}</p>
                    {r.checkOutTime && <p>{t('checked_out', { time: formatTime(r.checkOutTime) })}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
    </Card>
  );
}
