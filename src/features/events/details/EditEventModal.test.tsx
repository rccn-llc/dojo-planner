import type { EventData } from '@/hooks/useEventsCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditEventModal } from './EditEventModal';

const translationKeys: Record<string, string> = {
  title: 'Edit Event',
  tab_details: 'Details',
  tab_pricing: 'Pricing',
  tab_sessions: 'Sessions',
  name_label: 'Event Name',
  name_placeholder: 'e.g. Black Belt Seminar',
  event_type_label: 'Event Type',
  event_type_seminar: 'Seminar',
  event_type_workshop: 'Workshop',
  event_type_tournament: 'Tournament',
  event_type_camp: 'Camp',
  event_type_other: 'Other',
  max_capacity_label: 'Maximum Capacity',
  max_capacity_placeholder: 'Leave blank for unlimited',
  description_label: 'Description',
  description_placeholder: 'What is this event about?',
  description_character_count: '{count} / {max}',
  tier_name_label: 'Tier Name',
  tier_name_placeholder: 'e.g. Regular',
  price_label: 'Price',
  remove_tier_aria: 'Remove pricing tier',
  add_tier_button: 'Add Pricing Tier',
  session_date_label: 'Date',
  session_start_label: 'Starts',
  session_end_label: 'Ends',
  remove_session_aria: 'Remove session',
  add_session_button: 'Add Session',
  cancel_button: 'Cancel',
  save_button: 'Save Changes',
  saving_button: 'Saving...',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    let result = translationKeys[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(`{${k}}`, String(v));
      });
    }
    return result;
  },
}));

const mockUpdate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    events: {
      update: (input: unknown) => mockUpdate(input),
    },
  },
}));

vi.mock('@/hooks/useEventsCache', () => ({
  invalidateEventsCache: () => mockInvalidate(),
}));

const baseEvent: EventData = {
  id: 'event-123',
  name: 'Black Belt Seminar',
  slug: 'black-belt-seminar',
  description: 'A weekend seminar.',
  eventType: 'seminar',
  maxCapacity: 50,
  isActive: true,
  tags: [],
  sessions: [
    {
      id: 'sess-1',
      sessionDate: new Date('2026-06-15T00:00:00Z'),
      startTime: '10:00',
      endTime: '14:00',
      instructorClerkId: null,
    },
  ],
  billing: [
    { id: 'bill-1', name: 'Regular', price: 99.99, memberOnly: false, validUntil: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue({ event: baseEvent });
  mockInvalidate.mockResolvedValue(undefined);
});

describe('EditEventModal', () => {
  it('does not render when isOpen is false', () => {
    render(
      <EditEventModal
        isOpen={false}
        event={baseEvent}
        onCloseAction={vi.fn()}
      />,
    );

    expect(document.body.textContent).not.toContain('Edit Event');
  });

  it('renders the title and pre-populates the name field', () => {
    render(
      <EditEventModal
        isOpen={true}
        event={baseEvent}
        onCloseAction={vi.fn()}
      />,
    );

    expect(page.getByText('Edit Event')).toBeTruthy();

    const nameInput = page.getByLabelText('Event Name').element() as HTMLInputElement;

    expect(nameInput.value).toBe('Black Belt Seminar');
  });

  it('opens on the initial tab and switches between tabs', async () => {
    render(
      <EditEventModal
        isOpen={true}
        event={baseEvent}
        onCloseAction={vi.fn()}
        initialTab="pricing"
      />,
    );

    expect(page.getByText('Tier Name')).toBeTruthy();

    await page.getByRole('tab', { name: 'Sessions' }).click();

    expect(page.getByText('Date')).toBeTruthy();
  });

  it('calls client.events.update with the canonical payload on save', async () => {
    const onClose = vi.fn();
    render(
      <EditEventModal
        isOpen={true}
        event={baseEvent}
        onCloseAction={onClose}
      />,
    );

    const saveButton = Array.from(document.querySelectorAll('button')).find(
      btn => btn.textContent === 'Save Changes',
    ) as HTMLButtonElement;
    await userEvent.click(saveButton);

    expect(mockUpdate).toHaveBeenCalledTimes(1);

    const payload = mockUpdate.mock.calls[0]![0] as Record<string, unknown>;

    expect(payload.id).toBe('event-123');
    expect(payload.name).toBe('Black Belt Seminar');
    expect(payload.eventType).toBe('seminar');
    expect(payload.maxCapacity).toBe(50);
    expect(Array.isArray(payload.sessions)).toBe(true);
    expect(Array.isArray(payload.billing)).toBe(true);

    expect(mockInvalidate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('coerces unknown event types to "other" on open', () => {
    const oddEvent = { ...baseEvent, eventType: 'something-weird' };
    render(
      <EditEventModal
        isOpen={true}
        event={oddEvent}
        onCloseAction={vi.fn()}
      />,
    );

    // The Select trigger shows the localized label; "Other" comes from
    // event_type_other in our mock translations.
    const trigger = page.getByLabelText('Event Type').element();

    expect(trigger.textContent).toContain('Other');
  });
});
