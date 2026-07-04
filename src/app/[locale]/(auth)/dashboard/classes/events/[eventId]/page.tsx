'use client';

import type { EventDetailData } from './eventData';
import type { EventData } from '@/hooks/useEventsCache';
import { useOrganization } from '@clerk/nextjs';
import { ArrowLeft, Calendar, Edit, MapPin, Trash2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EditEventModal } from '@/features/events/details/EditEventModal';
import { invalidateEventsCache, useEventsCache } from '@/hooks/useEventsCache';
import { useInstructorsCache } from '@/hooks/useInstructorsCache';
import { client } from '@/libs/Orpc';
import { formatPrice, getInitials } from './eventData';

function formatSessionDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function formatSessionTime(startTime: string, endTime: string): string {
  const formatTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const amPm = h! >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h! > 12 ? h! - 12 : h;
    return `${displayHour}:${String(m).padStart(2, '0')} ${amPm}`;
  };
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

function transformEventData(
  event: EventData,
  instructorLookup?: Map<string, { name: string; photoUrl: string | null }>,
): EventDetailData {
  const sortedSessions = [...event.sessions].sort(
    (a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime(),
  );

  // Resolve unique session instructors to display cards.
  const seenInstructors = new Set<string>();
  const instructors = sortedSessions
    .map(s => s.instructorClerkId)
    .filter((id): id is string => !!id && !seenInstructors.has(id) && (seenInstructors.add(id), true))
    .map((id) => {
      const match = instructorLookup?.get(id);
      return { id, name: match?.name ?? 'Instructor', photoUrl: match?.photoUrl ?? '' };
    });

  const startDate = sortedSessions.length > 0 ? formatSessionDate(new Date(sortedSessions[0]!.sessionDate)) : '';
  const endDate = sortedSessions.length > 0 ? formatSessionDate(new Date(sortedSessions[sortedSessions.length - 1]!.sessionDate)) : '';

  const regularBilling = event.billing.find(b => !b.validUntil);
  const earlyBirdBilling = event.billing.find(b => b.validUntil !== null);

  return {
    id: event.id,
    name: event.name,
    description: event.description ?? '',
    eventType: event.eventType,
    startDate,
    endDate,
    sessions: sortedSessions.map(s => ({
      date: formatSessionDate(new Date(s.sessionDate)),
      time: formatSessionTime(s.startTime, s.endTime),
    })),
    location: '',
    instructors,
    price: regularBilling?.price ?? (event.billing[0]?.price ?? null),
    maxCapacity: event.maxCapacity,
    currentRegistrations: 0,
    earlyBirdPrice: earlyBirdBilling?.price ?? null,
    earlyBirdDeadline: earlyBirdBilling?.validUntil
      ? formatSessionDate(new Date(earlyBirdBilling.validUntil))
      : null,
    memberDiscount: null,
    memberDiscountType: null,
  };
}

type PageParams = {
  eventId: string;
};

export default function EventDetailPage({ params }: { params: Promise<PageParams> }) {
  const resolvedParams = use(params);
  const t = useTranslations('EventDetailPage');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization } = useOrganization();
  const { events, loading } = useEventsCache(organization?.id);
  const { instructorLookup } = useInstructorsCache(organization?.id);

  // Get the view param to preserve when navigating back
  const viewParam = searchParams.get('view');
  const backToClassesUrl = viewParam ? `/dashboard/classes?view=${viewParam}` : '/dashboard/classes';

  // Modal states
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editTab, setEditTab] = useState<'details' | 'pricing' | 'sessions' | null>(null);

  // Find event from cache and transform
  const rawEvent = useMemo(
    () => events.find(e => e.id === resolvedParams.eventId) ?? null,
    [events, resolvedParams.eventId],
  );
  const eventData = useMemo(
    () => (rawEvent ? transformEventData(rawEvent, instructorLookup) : null),
    [rawEvent, instructorLookup],
  );

  // Handler for deleting event — soft-delete on the server then navigate.
  const handleDeleteEvent = async () => {
    if (!eventData) {
      return;
    }
    try {
      await client.events.remove({ id: eventData.id });
      await invalidateEventsCache();
    } catch (err) {
      console.error('[Event Detail] Failed to delete event:', err);
    }
    router.push(backToClassesUrl);
  };

  if (loading) {
    return (
      <div className="w-full space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!eventData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">{t('not_found')}</p>
      </div>
    );
  }

  const isSingleDay = eventData.startDate === eventData.endDate;
  const dateDisplay = isSingleDay ? eventData.startDate : `${eventData.startDate} - ${eventData.endDate}`;
  const spotsRemaining = eventData.maxCapacity ? eventData.maxCapacity - eventData.currentRegistrations : null;

  return (
    <div className="w-full space-y-6">
      {/* Back Navigation */}
      <div className="flex items-center gap-4">
        <Link href={backToClassesUrl}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('back_to_classes')}
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <Badge variant="default" className="bg-primary text-primary-foreground">
            {t('event_badge')}
          </Badge>
          <Badge variant="outline">{eventData.eventType}</Badge>
        </div>
        <h1 className="text-3xl font-bold text-foreground">{eventData.name}</h1>
        <p className="text-lg text-muted-foreground">{eventData.description}</p>
      </div>

      {/* Stats Card */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('price_label')}</p>
          <p className="text-2xl font-bold text-primary">{formatPrice(eventData.price)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('registrations_label')}</p>
          <p className="text-2xl font-bold text-foreground">{eventData.currentRegistrations}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('capacity_label')}</p>
          <p className="text-2xl font-bold text-foreground">
            {eventData.maxCapacity || t('unlimited')}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('spots_remaining_label')}</p>
          <p className={`text-2xl font-bold ${spotsRemaining && spotsRemaining < 5 ? 'text-destructive' : 'text-foreground'}`}>
            {spotsRemaining !== null ? spotsRemaining : t('unlimited')}
          </p>
        </Card>
      </div>

      {/* Detail Cards Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Event Details + Pricing */}
        <div className="flex flex-col gap-6">
          {/* Event Details Card */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{t('details_card_title')}</h2>
              <Button variant="outline" size="sm" onClick={() => setEditTab('details')} aria-label={t('edit_details_aria')}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('dates_label')}</p>
                <p className="font-medium text-foreground">{dateDisplay}</p>
              </div>
              {eventData.location && (
                <div>
                  <p className="text-sm text-muted-foreground">{t('location_label')}</p>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium text-foreground">{eventData.location}</p>
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">{t('event_type_label')}</p>
                <p className="font-medium text-foreground">{eventData.eventType}</p>
              </div>
              {eventData.maxCapacity && (
                <div>
                  <p className="text-sm text-muted-foreground">{t('max_capacity_label')}</p>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium text-foreground">
                      {eventData.maxCapacity}
                      {' '}
                      {t('attendees')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Pricing Card */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{t('pricing_card_title')}</h2>
              <Button variant="outline" size="sm" onClick={() => setEditTab('pricing')} aria-label={t('edit_pricing_aria')}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t('regular_price_label')}</p>
                <p className="text-xl font-bold text-primary">{formatPrice(eventData.price)}</p>
              </div>
              {eventData.earlyBirdPrice && eventData.earlyBirdDeadline && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">{t('early_bird_label')}</p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {t('until')}
                        {' '}
                        {eventData.earlyBirdDeadline}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">
                      {formatPrice(eventData.earlyBirdPrice)}
                    </p>
                  </div>
                </div>
              )}
              {eventData.memberDiscount && eventData.memberDiscountType && (
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">{t('member_discount_label')}</p>
                  <p className="font-medium text-foreground">
                    {eventData.memberDiscountType === 'percentage'
                      ? `${eventData.memberDiscount}% ${t('off')}`
                      : `$${eventData.memberDiscount} ${t('off')}`}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Sessions + Instructors */}
        <div className="flex flex-col gap-6">
          {/* Sessions Card */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{t('sessions_card_title')}</h2>
              <Button variant="outline" size="sm" onClick={() => setEditTab('sessions')} aria-label={t('edit_sessions_aria')}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              {eventData.sessions.map((session, index) => (
                <div
                  key={`${session.date}-${session.time}`}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t('session_label')}
                      {' '}
                      {index + 1}
                    </p>
                    <p className="text-sm text-muted-foreground">{session.date}</p>
                  </div>
                  <p className="text-sm font-medium text-foreground">{session.time}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Instructors Card */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{t('instructors_card_title')}</h2>
              <Button variant="outline" size="sm" onClick={() => setEditTab('sessions')} aria-label={t('edit_instructors_aria')}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            {eventData.instructors.length > 0
              ? (
                  <div className="space-y-3">
                    {eventData.instructors.map(instructor => (
                      <div key={instructor.id} className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={instructor.photoUrl} alt={instructor.name} />
                          <AvatarFallback>{getInitials(instructor.name)}</AvatarFallback>
                        </Avatar>
                        <p className="font-medium text-foreground">{instructor.name}</p>
                      </div>
                    ))}
                  </div>
                )
              : (
                  <p className="text-sm text-muted-foreground">{t('no_instructors')}</p>
                )}
          </Card>
        </div>
      </div>

      {/* Delete Button */}
      <div className="flex justify-end">
        <Button
          variant="destructive"
          onClick={() => setIsDeleteDialogOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('delete_button')}
        </Button>
      </div>

      {/* Edit Modal — single modal with tabs, opened via the per-card Edit buttons */}
      {rawEvent && (
        <EditEventModal
          isOpen={editTab !== null}
          initialTab={editTab ?? 'details'}
          event={rawEvent}
          onCloseAction={() => setEditTab(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_dialog_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_dialog_description', { eventName: eventData.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel_button')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEvent}>
              {t('delete_confirm_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
