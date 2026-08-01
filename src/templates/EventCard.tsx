'use client';

import { Calendar, Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type EventSession = {
  date: string;
  time: string;
};

export type EventCardProps = {
  id: string;
  name: string;
  description: string;
  eventType: string;
  startDate: string;
  endDate: string;
  sessions: EventSession[];
  location: string;
  instructors: Array<{
    name: string;
    photoUrl: string;
  }>;
  price: number | null;
  onEdit?: (id: string) => void;
};

function getInitials(name: string) {
  const parts = name.split(' ');
  return parts.map(part => part[0]).join('').toUpperCase();
}

function formatPrice(price: number | null): string {
  if (price === null || price === 0) {
    return 'Free';
  }
  return `$${price.toFixed(2)}`;
}

export const EventCard = (props: EventCardProps) => {
  const { id, name, description, eventType, startDate, endDate, sessions, location, instructors, price, onEdit } = props;
  const t = useTranslations('EventCard');

  const isSingleDay = startDate === endDate;
  const dateDisplay = isSingleDay ? startDate : `${startDate} - ${endDate}`;

  return (
    <Card className="overflow-hidden border-2 border-primary/30 bg-primary/5 p-6">
      <div className="space-y-4">
        {/* Title and Event Badge */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            <Badge variant="default" className="bg-primary text-primary-foreground">
              {t('event_badge')}
            </Badge>
          </div>
          <h3 className="text-lg font-semibold text-foreground">{name}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{eventType}</Badge>
          <Badge variant={price === null || price === 0 ? 'secondary' : 'default'}>
            {formatPrice(price)}
          </Badge>
        </div>

        {/* Details */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-sm">
            <p className="text-muted-foreground">{t('dates_label')}</p>
            <p className="font-medium text-foreground">{dateDisplay}</p>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground">Sessions</p>
            <div className="mt-1 space-y-1">
              {sessions.map(session => (
                <p key={`${session.date}-${session.time}`} className="font-medium text-foreground">
                  {session.date}
                  {' '}
                  •
                  {' '}
                  {session.time}
                </p>
              ))}
            </div>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground">Location</p>
            <p className="font-medium text-foreground">{location}</p>
          </div>
          {instructors.length > 0 && (
            <div className="text-sm">
              <p className="text-muted-foreground">Instructors</p>
              <div className="mt-2 flex flex-col gap-2">
                {instructors.map(instructor => (
                  <div key={instructor.name} className="flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarImage src={instructor.photoUrl} alt={instructor.name} />
                      <AvatarFallback>{getInitials(instructor.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground">{instructor.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit Button */}
          {onEdit && (
            <div className="flex justify-end pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(id)}
                aria-label={t('edit_button_aria_label')}
                title={t('edit_button_aria_label')}
              >
                <Edit className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
