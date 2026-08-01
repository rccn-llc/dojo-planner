'use client';

import { Edit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type ScheduleItem = {
  day: string;
  time: string;
};

export type ClassCardProps = {
  id: string;
  name: string;
  description: string;
  level: string;
  type: string;
  style: string;
  /** Custom tags beyond the level/type/style categories, rendered as extra badges. */
  tags?: string[];
  schedule: ScheduleItem[];
  location: string;
  instructors: Array<{
    name: string;
    photoUrl: string;
  }>;
  onEdit?: (id: string) => void;
};

function getLevelColor(level: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (level) {
    case 'Beginner':
      return 'default';
    case 'Intermediate':
      return 'secondary';
    case 'Advanced':
      return 'destructive';
    case 'All Levels':
      return 'outline';
    default:
      return 'outline';
  }
}

function getInitials(name: string) {
  const parts = name.split(' ');
  return parts.map(part => part[0]).join('').toUpperCase();
}

export const ClassCard = (props: ClassCardProps) => {
  const { id, name, description, level, type, style, tags, schedule, location, instructors, onEdit } = props;
  const t = useTranslations('ClassCard');

  return (
    <Card className="overflow-hidden p-6">
      <div className="space-y-4">
        {/* Title and Level */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">{name}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant={getLevelColor(level)}>{level}</Badge>
          <Badge variant="outline">{type}</Badge>
          <Badge variant="outline">{style}</Badge>
          {tags?.map(tag => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>

        {/* Details */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-sm">
            <p className="text-muted-foreground">Schedule</p>
            <div className="mt-1 space-y-1">
              {schedule.map(item => (
                <p key={`${item.day}-${item.time}`} className="font-medium text-foreground">
                  {item.day}
                  {' '}
                  •
                  {' '}
                  {item.time}
                </p>
              ))}
            </div>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground">Location</p>
            <p className="font-medium text-foreground">{location}</p>
          </div>
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
