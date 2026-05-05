'use client';

import type { CalendarScheduleException } from './classDataTransformers';
import { useOrganization } from '@clerk/nextjs';
import { AlertCircle, Calendar, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useClassesCache } from '@/hooks/useClassesCache';
import { useOrganizationLocation } from '@/hooks/useOrganizationLocation';
import { transformClassesToCardProps } from './classDataTransformers';

type ClassEventHoverCardProps = {
  classId: string;
  className: string;
  color: string;
  hour?: number;
  minute?: number;
  duration?: number;
  exception?: CalendarScheduleException;
  children?: React.ReactNode;
  sourceView?: 'weekly' | 'monthly';
  isEvent?: boolean;
  eventId?: string;
};

function formatTime(hour: number, minute: number): string {
  const amPm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${amPm}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

function getExceptionIcon(type: CalendarScheduleException['type']) {
  switch (type) {
    case 'deleted':
      return <Trash2 className="h-3 w-3 text-destructive" />;
    case 'modified':
      return <Pencil className="h-3 w-3 text-amber-500" />;
    case 'modified-forward':
      return <Calendar className="h-3 w-3 text-blue-500" />;
    default:
      return <AlertCircle className="h-3 w-3" />;
  }
}

function getExceptionLabel(type: CalendarScheduleException['type']): string {
  switch (type) {
    case 'deleted':
      return 'Cancelled';
    case 'modified':
      return 'Modified';
    case 'modified-forward':
      return 'Modified (ongoing)';
    default:
      return 'Exception';
  }
}

export function ClassEventHoverCard({
  classId,
  className,
  color,
  hour,
  minute,
  duration,
  exception,
  children,
  sourceView,
  isEvent,
  eventId,
}: ClassEventHoverCardProps) {
  const router = useRouter();
  const { organization } = useOrganization();
  const { classes: rawClasses } = useClassesCache(organization?.id);
  const { location: orgLocation } = useOrganizationLocation();
  const locationLabel = orgLocation.address ?? '';

  // Transform and find the class data (only for classes, not events)
  const classes = useMemo(() => transformClassesToCardProps(rawClasses, locationLabel), [rawClasses, locationLabel]);
  const classData = isEvent ? undefined : classes.find(c => c.id === classId);

  const handleClick = () => {
    const viewParam = sourceView ? `?view=${sourceView}` : '';
    if (isEvent && eventId) {
      router.push(`/dashboard/classes/events/${eventId}${viewParam}`);
    } else {
      router.push(`/dashboard/classes/${classId}${viewParam}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const isDeleted = exception?.type === 'deleted';
  const hasException = !!exception;

  // Determine border/styling based on exception type
  const getExceptionStyles = () => {
    if (!exception) {
      return {};
    }
    switch (exception.type) {
      case 'deleted':
        return { opacity: 0.5, textDecoration: 'line-through' };
      case 'modified':
        return { boxShadow: 'inset 0 0 0 2px #f59e0b' }; // amber border
      case 'modified-forward':
        return { boxShadow: 'inset 0 0 0 2px #3b82f6' }; // blue border
      default:
        return {};
    }
  };

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={`mb-1 w-full cursor-pointer truncate rounded px-2 py-1 text-left text-xs font-medium text-white transition-opacity hover:opacity-80 sm:text-sm ${hasException ? 'relative' : ''}`}
          style={{ backgroundColor: color, ...getExceptionStyles() }}
          data-exception-type={exception?.type}
        >
          {hasException && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-background shadow-sm">
              {getExceptionIcon(exception.type)}
            </span>
          )}
          {children || className}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={8}
        className="w-64 rounded-lg border border-border bg-background p-3 text-foreground shadow-lg"
      >
        <div className="space-y-2">
          {/* Class Name */}
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold text-foreground">{className}</h4>
            <div
              className="mt-0.5 h-3 w-3 shrink-0 rounded"
              style={{ backgroundColor: color }}
            />
          </div>

          {/* Description */}
          {classData?.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {classData.description}
            </p>
          )}

          {/* Exception info if available */}
          {exception && (
            <div
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${
                exception.type === 'deleted'
                  ? 'bg-destructive/10 text-destructive'
                  : exception.type === 'modified-forward'
                    ? 'bg-blue-500/10 text-blue-600'
                    : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              {getExceptionIcon(exception.type)}
              <span className="font-medium">{getExceptionLabel(exception.type)}</span>
              {exception.note && (
                <span className="text-muted-foreground">
                  -
                  {' '}
                  {exception.note}
                </span>
              )}
            </div>
          )}

          {/* Time info if available */}
          {hour !== undefined && minute !== undefined && duration !== undefined && !isDeleted && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Time:</span>
              {' '}
              {formatTime(hour, minute)}
              {' '}
              (
              {formatDuration(duration)}
              )
            </div>
          )}

          {/* Badges */}
          {classData && (
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-[10px]">{classData.level}</Badge>
              <Badge variant="outline" className="text-[10px]">{classData.type}</Badge>
              <Badge variant="outline" className="text-[10px]">{classData.style}</Badge>
            </div>
          )}

          {/* Location */}
          {classData?.location && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Location:</span>
              {' '}
              {classData.location}
            </div>
          )}

          {/* Instructors */}
          {classData?.instructors && classData.instructors.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Instructors:</span>
              {' '}
              {classData.instructors.map(i => i.name).join(', ')}
            </div>
          )}

          {/* Event badge */}
          {isEvent && (
            <Badge variant="default" className="bg-primary text-[10px] text-primary-foreground">
              Event
            </Badge>
          )}

          {/* Click hint */}
          <div className="border-t border-border pt-2 text-[10px] text-muted-foreground">
            {isEvent ? 'Click to view event details' : 'Click to view class details'}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
