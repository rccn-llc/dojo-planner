'use client';

import { ArrowDown01, ArrowDownAZ, ArrowUp10, ArrowUpZA, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input/input';

export type AttendanceRecord = {
  id: string;
  className: string;
  date: string;
  time: string;
  instructor: string;
};

export type PunchcardInfo = {
  totalClasses: number;
  classesUsed: number;
  classesRemaining: number;
};

type MemberDetailAttendanceProps = {
  memberId: string;
  memberName: string;
  attendanceRecords: AttendanceRecord[];
  punchcardInfo: PunchcardInfo | null;
  isLoading?: boolean;
};

type SortField = 'className' | 'date' | 'time' | 'instructor';
type SortDirection = 'asc' | 'desc';

export function MemberDetailAttendance({
  attendanceRecords,
  punchcardInfo,
  isLoading = false,
}: MemberDetailAttendanceProps) {
  const t = useTranslations('MemberDetailAttendance');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // Default to descending for date (newest first), ascending for text fields
      setSortDirection(field === 'date' ? 'desc' : 'asc');
    }
  }, [sortField]);

  const filteredAndSortedRecords = useMemo(() => {
    // Filter records by search query
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? attendanceRecords.filter(
          record =>
            record.className.toLowerCase().includes(query)
            || record.date.toLowerCase().includes(query)
            || record.time.toLowerCase().includes(query)
            || record.instructor.toLowerCase().includes(query),
        )
      : attendanceRecords;

    // Sort filtered records
    return [...filtered].sort((a, b) => {
      let aValue: string;
      let bValue: string;

      switch (sortField) {
        case 'date': {
          // Parse dates for comparison - assumes format like "Jan 5, 2026"
          aValue = a.date;
          bValue = b.date;
          const aDate = new Date(a.date);
          const bDate = new Date(b.date);
          if (!Number.isNaN(aDate.getTime()) && !Number.isNaN(bDate.getTime())) {
            const comparison = aDate.getTime() - bDate.getTime();
            return sortDirection === 'asc' ? comparison : -comparison;
          }
          break;
        }
        case 'className':
          aValue = a.className.toLowerCase();
          bValue = b.className.toLowerCase();
          break;
        case 'time':
          aValue = a.time.toLowerCase();
          bValue = b.time.toLowerCase();
          break;
        case 'instructor':
          aValue = a.instructor.toLowerCase();
          bValue = b.instructor.toLowerCase();
          break;
        default:
          aValue = '';
          bValue = '';
      }

      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [attendanceRecords, sortField, sortDirection, searchQuery]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return null;
    }

    // Date field uses numeric icons, text fields use alphabetic icons
    if (field === 'date') {
      return sortDirection === 'asc'
        ? <ArrowDown01 className="h-4 w-4" />
        : <ArrowUp10 className="h-4 w-4" />;
    }

    return sortDirection === 'asc'
      ? <ArrowDownAZ className="h-4 w-4" />
      : <ArrowUpZA className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Punchcard Status Section */}
      {punchcardInfo && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('punchcard_info_title')}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">{t('classes_remaining')}</p>
              <p className={`text-3xl font-bold ${punchcardInfo.classesRemaining <= 2 ? 'text-destructive' : 'text-primary'}`}>
                {punchcardInfo.classesRemaining}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">{t('classes_used')}</p>
              <p className="text-3xl font-bold text-foreground">{punchcardInfo.classesUsed}</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">{t('total_classes')}</p>
              <p className="text-3xl font-bold text-foreground">{punchcardInfo.totalClasses}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Attendance History Section */}
      <div className="rounded-lg border border-border bg-background">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        </div>
        {attendanceRecords.length > 0 && (
          <div className="border-b border-border px-6 py-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
          : attendanceRecords.length === 0
            ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">{t('no_attendance')}</p>
                </div>
              )
            : filteredAndSortedRecords.length === 0
              ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-muted-foreground">{t('no_matching_attendance')}</p>
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
                                onClick={() => handleSort('className')}
                                className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                              >
                                {t('table_class')}
                                {renderSortIcon('className')}
                              </button>
                            </th>
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
                                onClick={() => handleSort('time')}
                                className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                              >
                                {t('table_time')}
                                {renderSortIcon('time')}
                              </button>
                            </th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                              <button
                                type="button"
                                onClick={() => handleSort('instructor')}
                                className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                              >
                                {t('table_instructor')}
                                {renderSortIcon('instructor')}
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAndSortedRecords.map(record => (
                            <tr key={record.id} className="border-b border-border hover:bg-secondary/30">
                              <td className="px-6 py-4 text-sm font-medium text-foreground">
                                {record.className}
                              </td>
                              <td className="px-6 py-4 text-sm text-muted-foreground">
                                {record.date}
                              </td>
                              <td className="px-6 py-4 text-sm text-muted-foreground">
                                {record.time}
                              </td>
                              <td className="px-6 py-4 text-sm text-foreground">
                                {record.instructor}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="space-y-4 p-4 lg:hidden">
                      {filteredAndSortedRecords.map(record => (
                        <Card key={record.id} className="p-4">
                          <div className="space-y-3">
                            {/* Class Name Header */}
                            <div className="border-b border-border pb-3">
                              <div className="text-xs font-semibold text-muted-foreground">
                                {t('table_class')}
                              </div>
                              <div className="mt-1 text-sm font-medium text-foreground">
                                {record.className}
                              </div>
                            </div>

                            {/* Date and Time */}
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="text-xs font-semibold text-muted-foreground">
                                  {t('table_date')}
                                </div>
                                <div className="mt-1 text-sm text-foreground">
                                  {record.date}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs font-semibold text-muted-foreground">
                                  {t('table_time')}
                                </div>
                                <div className="mt-1 text-sm text-foreground">
                                  {record.time}
                                </div>
                              </div>
                            </div>

                            {/* Instructor */}
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground">
                                {t('table_instructor')}
                              </div>
                              <div className="mt-1 text-sm text-foreground">
                                {record.instructor}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
      </div>
    </div>
  );
}
