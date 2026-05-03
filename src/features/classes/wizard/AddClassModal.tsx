'use client';

import type { DayOfWeek } from '@/hooks/useAddClassWizard';
import type { ClassCardProps, ScheduleItem } from '@/templates/ClassCard';
import type { EventCardProps, EventSession as EventCardSession } from '@/templates/EventCard';
import { useOrganization } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAddClassWizard } from '@/hooks/useAddClassWizard';
import { useTagsCache } from '@/hooks/useTagsCache';
import { client } from '@/libs/Orpc';
import { ClassBasicsStep } from './ClassBasicsStep';
import { ClassScheduleStep } from './ClassScheduleStep';
import { ClassSuccessStep } from './ClassSuccessStep';
import { ClassTagsStep } from './ClassTagsStep';
import { EventBasicsStep } from './EventBasicsStep';
import { EventBillingStep } from './EventBillingStep';
import { EventScheduleStep } from './EventScheduleStep';
import { TypeSelectionStep } from './TypeSelectionStep';

type AddClassModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  onClassCreated?: (newClass: ClassCardProps) => void;
  onEventCreated?: (newEvent: EventCardProps) => void;
};

const MOCK_PROGRAMS: Record<string, string> = {
  'adult-bjj': 'Adult Brazilian Jiu-Jitsu',
  'kids-bjj': 'Kids Brazilian Jiu-Jitsu',
  'womens-bjj': 'Women\'s Brazilian Jiu-Jitsu',
  'competition': 'Competition Team',
  'judo': 'Judo',
  'wrestling': 'Wrestling',
};

const MOCK_STAFF: Record<string, { name: string; photoUrl: string }> = {
  'collin-grayson': { name: 'Collin Grayson', photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Collin' },
  'coach-alex': { name: 'Coach Alex', photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex' },
  'professor-jessica': { name: 'Professor Jessica', photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jessica' },
  'professor-joao': { name: 'Professor Joao', photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Joao' },
  'coach-liza': { name: 'Coach Liza', photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Liza' },
  'professor-ivan': { name: 'Professor Ivan', photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ivan' },
};

const DAY_OF_WEEK_INDEX: Record<DayOfWeek, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// Convert wizard's 12-hour {hour, minute, AM/PM} to 24-hour "HH:MM".
function to24h(hour: number, minute: number, amPm: 'AM' | 'PM'): string {
  let h = hour % 12;
  if (amPm === 'PM') {
    h += 12;
  }
  return `${h.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

// Add hours+minutes to a "HH:MM" string, returning a "HH:MM" string. Used to
// derive endTime from startTime + duration.
function addDuration(start: string, durationHours: number, durationMinutes: number): string {
  const [hStr, mStr] = start.split(':');
  let h = Number.parseInt(hStr ?? '0', 10);
  let m = Number.parseInt(mStr ?? '0', 10);
  m += durationMinutes;
  h += durationHours + Math.floor(m / 60);
  m %= 60;
  h %= 24;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const EVENT_TYPE_TO_API: Record<string, 'seminar' | 'workshop' | 'tournament' | 'camp' | 'other'> = {
  'Seminar': 'seminar',
  'Workshop': 'workshop',
  'Guest Instructor': 'other',
  'Tournament': 'tournament',
  'Other': 'other',
};

export const AddClassModal = ({ isOpen, onCloseAction, onClassCreated, onEventCreated }: AddClassModalProps) => {
  const router = useRouter();
  const wizard = useAddClassWizard();
  const t = useTranslations('AddClassWizard');
  const { organization } = useOrganization();
  const { classTags } = useTagsCache(organization?.id);

  const handleCancel = () => {
    wizard.reset();
    onCloseAction();
  };

  const handleSuccess = () => {
    const itemType = wizard.data.itemType;
    console.info(`[Add Class/Event Wizard] ${itemType === 'event' ? 'Event' : 'Class'} created successfully:`, {
      timestamp: new Date().toISOString(),
      data: wizard.data,
    });
    wizard.reset();
    onCloseAction();
    router.refresh();
  };

  const handleFinalStep = async () => {
    try {
      wizard.setIsLoading(true);
      wizard.clearError();

      const isEvent = wizard.data.itemType === 'event';

      if (isEvent) {
        // Build the API payload from the wizard's 12-hour-with-AM/PM shape.
        const sessions = wizard.data.eventSchedule.sessions.map((s) => {
          const start = to24h(s.timeHour, s.timeMinute, s.timeAmPm);
          const end = addDuration(start, s.durationHours, s.durationMinutes);
          return {
            sessionDate: new Date(s.date),
            startTime: start,
            endTime: end,
            primaryInstructorClerkId: s.staffMember || null,
            room: wizard.data.eventSchedule.location || null,
          };
        });

        const billing = wizard.data.eventBilling.hasFee && wizard.data.eventBilling.price !== null
          ? [{
              name: 'Regular',
              price: wizard.data.eventBilling.price,
              memberOnly: false,
              sortOrder: 0,
              ...(wizard.data.eventBilling.hasEarlyBird
                && wizard.data.eventBilling.earlyBirdPrice !== null
                && wizard.data.eventBilling.earlyBirdDeadline
                ? { validUntil: new Date(wizard.data.eventBilling.earlyBirdDeadline) }
                : {}),
            }]
          : [];
        if (wizard.data.eventBilling.hasFee
          && wizard.data.eventBilling.hasEarlyBird
          && wizard.data.eventBilling.earlyBirdPrice !== null) {
          billing.push({
            name: 'Early Bird',
            price: wizard.data.eventBilling.earlyBirdPrice,
            memberOnly: false,
            sortOrder: 1,
            ...(wizard.data.eventBilling.earlyBirdDeadline
              ? { validUntil: new Date(wizard.data.eventBilling.earlyBirdDeadline) }
              : {}),
          });
        }

        const apiEventType = EVENT_TYPE_TO_API[wizard.data.eventType || 'Other'] ?? 'other';

        const result = await client.events.create({
          name: wizard.data.eventName,
          description: wizard.data.eventDescription || null,
          eventType: apiEventType,
          maxCapacity: wizard.data.eventMaxCapacity ?? null,
          isPublic: true,
          isActive: true,
          sessions,
          billing,
          tagIds: wizard.data.tags,
        });

        // Build the EventCardProps from the wizard data for the success-step
        // preview. The server has the canonical id; everything else is what
        // the user just entered, formatted for display.
        const formatEventSessions = (): EventCardSession[] => {
          return wizard.data.eventSchedule.sessions.map((session) => {
            const hour = session.timeHour;
            const minute = session.timeMinute.toString().padStart(2, '0');
            const endHour = hour + session.durationHours + Math.floor((session.timeMinute + session.durationMinutes) / 60);
            const endMinute = (session.timeMinute + session.durationMinutes) % 60;
            const endAmPm = session.timeAmPm === 'AM' && endHour >= 12 ? 'PM' : session.timeAmPm;
            const displayEndHour = endHour > 12 ? endHour - 12 : endHour;
            const dateObj = new Date(session.date);
            const formattedDate = dateObj.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            });
            return {
              date: formattedDate,
              time: `${hour}:${minute} ${session.timeAmPm} - ${displayEndHour}:${endMinute.toString().padStart(2, '0')} ${endAmPm}`,
            };
          });
        };

        const uniqueStaffIds = [...new Set(wizard.data.eventSchedule.sessions.flatMap(s => [s.staffMember, s.assistantStaff].filter(Boolean)))];
        const eventInstructors = uniqueStaffIds
          .map(id => MOCK_STAFF[id])
          .filter((staff): staff is { name: string; photoUrl: string } => staff !== undefined);

        const formatDate = (dateStr: string) => {
          const dateObj = new Date(dateStr);
          return dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        };

        const newEvent: EventCardProps = {
          id: result.event.id,
          name: result.event.name,
          description: wizard.data.eventDescription,
          eventType: wizard.data.eventType || 'Other',
          startDate: formatDate(wizard.data.eventSchedule.startDate),
          endDate: formatDate(wizard.data.eventSchedule.endDate || wizard.data.eventSchedule.startDate),
          sessions: formatEventSessions(),
          location: wizard.data.eventSchedule.location || 'Current Location',
          instructors: eventInstructors,
          price: wizard.data.eventBilling.hasFee ? wizard.data.eventBilling.price : null,
        };

        if (onEventCreated) {
          onEventCreated(newEvent);
        }
      } else {
        const schedule = wizard.data.schedule.instances.map((i) => {
          const start = to24h(i.timeHour, i.timeMinute, i.timeAmPm);
          const end = addDuration(start, i.durationHours, i.durationMinutes);
          return {
            dayOfWeek: DAY_OF_WEEK_INDEX[i.dayOfWeek],
            startTime: start,
            endTime: end,
            primaryInstructorClerkId: i.staffMember || null,
            room: wizard.data.schedule.location || null,
          };
        });

        const result = await client.classes.create({
          name: wizard.data.className,
          description: wizard.data.description || null,
          color: wizard.data.calendarColor || null,
          maxCapacity: wizard.data.maximumCapacity ?? null,
          minAge: wizard.data.minimumAge ?? null,
          isActive: true,
          schedule,
          tagIds: wizard.data.tags,
        });

        const formatSchedule = (): ScheduleItem[] => {
          return wizard.data.schedule.instances.map((instance) => {
            const hour = instance.timeHour;
            const minute = instance.timeMinute.toString().padStart(2, '0');
            const endHour = hour + instance.durationHours + Math.floor((instance.timeMinute + instance.durationMinutes) / 60);
            const endMinute = (instance.timeMinute + instance.durationMinutes) % 60;
            const endAmPm = instance.timeAmPm === 'AM' && endHour >= 12 ? 'PM' : instance.timeAmPm;
            const displayEndHour = endHour > 12 ? endHour - 12 : endHour;
            return {
              day: instance.dayOfWeek,
              time: `${hour}:${minute} ${instance.timeAmPm} - ${displayEndHour}:${endMinute.toString().padStart(2, '0')} ${endAmPm}`,
            };
          });
        };

        const uniqueStaffIds = [...new Set(wizard.data.schedule.instances.flatMap(i => [i.staffMember, i.assistantStaff].filter(Boolean)))];
        const classInstructors = uniqueStaffIds
          .map(id => MOCK_STAFF[id])
          .filter((staff): staff is { name: string; photoUrl: string } => staff !== undefined);

        const newClass: ClassCardProps = {
          id: result.class.id,
          name: result.class.name,
          description: wizard.data.description,
          level: 'All Levels',
          type: MOCK_PROGRAMS[wizard.data.program]?.split(' ')[0] || 'Adults',
          style: 'Gi',
          schedule: formatSchedule(),
          location: wizard.data.schedule.location || 'Current Location',
          instructors: classInstructors,
        };

        if (onClassCreated) {
          onClassCreated(newClass);
        }
      }

      wizard.setStep('success');
    } catch (err) {
      console.error('[Add Class/Event Wizard] Failed to create:', {
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
      wizard.setError(err instanceof Error ? err.message : 'Failed to create. Please try again.');
    } finally {
      wizard.setIsLoading(false);
    }
  };

  const getDialogTitle = () => {
    switch (wizard.step) {
      case 'type-selection':
        return t('step_type_selection_title');
      case 'class-basics':
        return t('step_class_basics_title');
      case 'event-basics':
        return t('step_event_basics_title');
      case 'schedule':
        return t('step_schedule_title');
      case 'event-schedule':
        return t('step_event_schedule_title');
      case 'event-billing':
        return t('step_billing_title');
      case 'tags':
        return t('step_tags_title');
      case 'success':
        return t('step_success_title');
      default:
        return t('modal_title');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={isOpen => !isOpen && handleCancel()}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto py-6">
          {wizard.step === 'type-selection' && (
            <TypeSelectionStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={wizard.nextStep}
              onCancel={handleCancel}
              error={wizard.error}
            />
          )}

          {wizard.step === 'class-basics' && (
            <ClassBasicsStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={wizard.nextStep}
              onCancel={handleCancel}
              error={wizard.error}
            />
          )}

          {wizard.step === 'event-basics' && (
            <EventBasicsStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              error={wizard.error}
            />
          )}

          {wizard.step === 'schedule' && (
            <ClassScheduleStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onUpdateSchedule={wizard.updateSchedule}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              error={wizard.error}
            />
          )}

          {wizard.step === 'event-schedule' && (
            <EventScheduleStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onUpdateEventSchedule={wizard.updateEventSchedule}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              error={wizard.error}
            />
          )}

          {wizard.step === 'event-billing' && (
            <EventBillingStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onUpdateEventBilling={wizard.updateEventBilling}
              onNext={wizard.nextStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              error={wizard.error}
            />
          )}

          {wizard.step === 'tags' && (
            <ClassTagsStep
              data={wizard.data}
              onUpdate={wizard.updateData}
              onNext={handleFinalStep}
              onBack={wizard.previousStep}
              onCancel={handleCancel}
              isLoading={wizard.isLoading}
              error={wizard.error}
              classTags={classTags}
            />
          )}

          {wizard.step === 'success' && (
            <ClassSuccessStep
              data={wizard.data}
              onDone={handleSuccess}
              classTags={classTags}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
