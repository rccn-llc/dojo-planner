'use client';

import type { EventData } from '@/hooks/useEventsCache';
import { useOrganization } from '@clerk/nextjs';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { invalidateEventsCache } from '@/hooks/useEventsCache';
import { useInstructorsCache } from '@/hooks/useInstructorsCache';
import { client } from '@/libs/Orpc';

const MAX_DESCRIPTION_LENGTH = 2000;

type ApiEventType = 'seminar' | 'workshop' | 'tournament' | 'camp' | 'other';

const ALLOWED_EVENT_TYPES: readonly ApiEventType[] = ['seminar', 'workshop', 'tournament', 'camp', 'other'];

function normalizeEventType(raw: string): ApiEventType {
  return ALLOWED_EVENT_TYPES.includes(raw as ApiEventType) ? (raw as ApiEventType) : 'other';
}

export type EditEventModalTab = 'details' | 'pricing' | 'sessions';

type SessionRow = {
  id: string;
  sessionDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  primaryInstructorClerkId: string | null;
};

type BillingRow = {
  id: string;
  name: string;
  price: string; // string in form, parsed on save
};

type EditEventModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  initialTab?: EditEventModalTab;
  event: EventData;
  onSavedAction?: () => void;
};

function dateToInputValue(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function emptySession(): SessionRow {
  return { id: crypto.randomUUID(), sessionDate: '', startTime: '10:00', endTime: '12:00', primaryInstructorClerkId: null };
}

function emptyBilling(): BillingRow {
  return { id: crypto.randomUUID(), name: 'Regular', price: '0' };
}

type FormState = {
  name: string;
  description: string;
  eventType: ApiEventType;
  maxCapacity: string;
  sessions: SessionRow[];
  billing: BillingRow[];
  tab: EditEventModalTab;
  // Tracks the (eventId, initialTab) tuple this state was built for. Used
  // during render to detect when the parent has reopened the modal with a
  // different event/tab and we need to rebuild the form.
  syncKey: string;
};

function buildFormState(event: EventData, initialTab: EditEventModalTab): FormState {
  return {
    name: event.name,
    description: event.description ?? '',
    eventType: normalizeEventType(event.eventType),
    maxCapacity: event.maxCapacity !== null ? String(event.maxCapacity) : '',
    sessions: event.sessions.length > 0
      ? event.sessions.map(s => ({
          id: crypto.randomUUID(),
          sessionDate: dateToInputValue(new Date(s.sessionDate)),
          startTime: s.startTime,
          endTime: s.endTime,
          primaryInstructorClerkId: s.instructorClerkId ?? null,
        }))
      : [emptySession()],
    billing: event.billing.length > 0
      ? event.billing.map(b => ({
          id: crypto.randomUUID(),
          name: b.name,
          price: String(b.price),
        }))
      : [emptyBilling()],
    tab: initialTab,
    syncKey: `${event.id}|${initialTab}`,
  };
}

export function EditEventModal({
  isOpen,
  onCloseAction,
  initialTab = 'details',
  event,
  onSavedAction,
}: EditEventModalProps) {
  const t = useTranslations('EventDetailPage.EditEventModal');
  const { organization } = useOrganization();
  const { instructors, loading: instructorsLoading } = useInstructorsCache(organization?.id);

  // Single state object so the parent reopening the modal with a different
  // event or tab triggers exactly one re-sync (during render) instead of an
  // 8-call useEffect cascade. See React docs on "deriving state from props".
  const [form, setForm] = useState<FormState>(() => buildFormState(event, initialTab));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync during render when the modal opens or the event/initialTab change.
  // React explicitly supports calling setState during render to derive state
  // from props — it bails out without scheduling an extra render.
  const desiredSyncKey = `${event.id}|${initialTab}`;
  if (isOpen && form.syncKey !== desiredSyncKey) {
    setForm(buildFormState(event, initialTab));
    setError(null);
  }

  const isNameValid = form.name.trim().length > 0;
  const isFormValid
    = isNameValid
      && form.sessions.every(s => s.sessionDate && s.startTime && s.endTime)
      && form.billing.every(b => b.name.trim() && !Number.isNaN(Number.parseFloat(b.price)));

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await client.events.update({
        id: event.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        eventType: form.eventType,
        maxCapacity: form.maxCapacity ? Number.parseInt(form.maxCapacity, 10) : null,
        isPublic: true,
        isActive: event.isActive ?? true,
        sessions: form.sessions.map(s => ({
          sessionDate: new Date(`${s.sessionDate}T00:00:00Z`),
          startTime: s.startTime,
          endTime: s.endTime,
          primaryInstructorClerkId: s.primaryInstructorClerkId,
        })),
        billing: form.billing.map((b, idx) => ({
          name: b.name.trim(),
          price: Number.parseFloat(b.price) || 0,
          memberOnly: false,
          sortOrder: idx,
        })),
        tagIds: event.tags.map(tg => tg.id),
      });
      await invalidateEventsCache();
      if (onSavedAction) {
        onSavedAction();
      }
      onCloseAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCloseAction()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <Tabs value={form.tab} onValueChange={v => updateForm('tab', v as EditEventModalTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">{t('tab_details')}</TabsTrigger>
            <TabsTrigger value="pricing">{t('tab_pricing')}</TabsTrigger>
            <TabsTrigger value="sessions">{t('tab_sessions')}</TabsTrigger>
          </TabsList>

          {/* Details tab */}
          <TabsContent value="details" className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="event-name">{t('name_label')}</label>
              <Input
                id="event-name"
                value={form.name}
                onChange={e => updateForm('name', e.target.value)}
                placeholder={t('name_placeholder')}
                error={!isNameValid && form.name.length > 0}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="event-type">{t('event_type_label')}</label>
              <Select value={form.eventType} onValueChange={v => updateForm('eventType', v as ApiEventType)}>
                <SelectTrigger id="event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seminar">{t('event_type_seminar')}</SelectItem>
                  <SelectItem value="workshop">{t('event_type_workshop')}</SelectItem>
                  <SelectItem value="tournament">{t('event_type_tournament')}</SelectItem>
                  <SelectItem value="camp">{t('event_type_camp')}</SelectItem>
                  <SelectItem value="other">{t('event_type_other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="event-capacity">{t('max_capacity_label')}</label>
              <Input
                id="event-capacity"
                type="number"
                min={1}
                value={form.maxCapacity}
                onChange={e => updateForm('maxCapacity', e.target.value)}
                placeholder={t('max_capacity_placeholder')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="event-description">{t('description_label')}</label>
              <Textarea
                id="event-description"
                value={form.description}
                onChange={e => updateForm('description', e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                rows={4}
                placeholder={t('description_placeholder')}
              />
              <p className="text-xs text-muted-foreground">
                {t('description_character_count', { count: form.description.length, max: MAX_DESCRIPTION_LENGTH })}
              </p>
            </div>
          </TabsContent>

          {/* Pricing tab */}
          <TabsContent value="pricing" className="space-y-4 py-4">
            <div className="space-y-3">
              {form.billing.map(b => (
                <div key={b.id} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-sm font-medium">{t('tier_name_label')}</label>
                    <Input
                      value={b.name}
                      onChange={e => updateForm('billing', form.billing.map(row => (row.id === b.id ? { ...row, name: e.target.value } : row)))}
                      placeholder={t('tier_name_placeholder')}
                    />
                  </div>
                  <div className="w-32 space-y-1.5">
                    <label className="text-sm font-medium">{t('price_label')}</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={b.price}
                      onChange={e => updateForm('billing', form.billing.map(row => (row.id === b.id ? { ...row, price: e.target.value } : row)))}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => updateForm('billing', form.billing.filter(row => row.id !== b.id))}
                    disabled={form.billing.length <= 1}
                    aria-label={t('remove_tier_aria')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => updateForm('billing', [...form.billing, emptyBilling()])}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('add_tier_button')}
              </Button>
            </div>
          </TabsContent>

          {/* Sessions tab */}
          <TabsContent value="sessions" className="space-y-4 py-4">
            <div className="space-y-3">
              {form.sessions.map(s => (
                <div key={s.id} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-sm font-medium">{t('session_date_label')}</label>
                      <Input
                        type="date"
                        value={s.sessionDate}
                        onChange={e => updateForm('sessions', form.sessions.map(row => (row.id === s.id ? { ...row, sessionDate: e.target.value } : row)))}
                      />
                    </div>
                    <div className="w-28 space-y-1.5">
                      <label className="text-sm font-medium">{t('session_start_label')}</label>
                      <Input
                        type="time"
                        value={s.startTime}
                        onChange={e => updateForm('sessions', form.sessions.map(row => (row.id === s.id ? { ...row, startTime: e.target.value } : row)))}
                      />
                    </div>
                    <div className="w-28 space-y-1.5">
                      <label className="text-sm font-medium">{t('session_end_label')}</label>
                      <Input
                        type="time"
                        value={s.endTime}
                        onChange={e => updateForm('sessions', form.sessions.map(row => (row.id === s.id ? { ...row, endTime: e.target.value } : row)))}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => updateForm('sessions', form.sessions.filter(row => row.id !== s.id))}
                      disabled={form.sessions.length <= 1}
                      aria-label={t('remove_session_aria')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('session_instructor_label')}</label>
                    <Select
                      value={s.primaryInstructorClerkId ?? 'none'}
                      onValueChange={value => updateForm('sessions', form.sessions.map(row => (row.id === s.id ? { ...row, primaryInstructorClerkId: value === 'none' ? null : value } : row)))}
                      disabled={instructorsLoading}
                    >
                      <SelectTrigger data-testid={`event-instructor-select-${s.id}`}>
                        <SelectValue placeholder={t('session_instructor_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('session_instructor_none')}</SelectItem>
                        {instructors.map(instructor => (
                          <SelectItem key={instructor.id} value={instructor.id}>
                            {instructor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => updateForm('sessions', [...form.sessions, emptySession()])}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('add_session_button')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onCloseAction} disabled={isLoading}>
            {t('cancel_button')}
          </Button>
          <Button onClick={handleSubmit} disabled={!isFormValid || isLoading}>
            {isLoading ? t('saving_button') : t('save_button')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
