import type { EventBilling } from '@/hooks/useEventsCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EnrollMemberModal } from './EnrollMemberModal';

const translationKeys: Record<string, string> = {
  title: 'Enroll a Member',
  description: 'Register a member for "{eventName}".',
  member_label: 'Member',
  search_placeholder: 'Search by name or email…',
  no_members: 'No members found.',
  selected: 'Selected',
  tier_label: 'Pricing Tier',
  tier_none: 'No charge / record only',
  checking_payment: 'Checking saved payment methods…',
  charge_saved_card: `Charge saved card ($${'{amount}'})`,
  charge_hint: 'The member\'s card on file will be charged for this event.',
  no_saved_card: 'This member has no saved card. They\'ll be registered without a charge.',
  free_registration: 'This tier has no charge — the member will be registered for free.',
  charge_description: 'Event registration: {eventName}',
  charge_failed: 'The payment could not be processed.',
  enroll_failed: 'Could not enroll the member. Please try again.',
  cancel: 'Cancel',
  enroll: 'Enroll',
  enroll_and_charge: 'Enroll & Charge',
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

const mockMembersList = vi.fn();
const mockListPaymentMethods = vi.fn();
const mockRegister = vi.fn();
const mockProcess = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    members: { list: () => mockMembersList() },
    member: { listPaymentMethods: (input: unknown) => mockListPaymentMethods(input) },
    events: { register: (input: unknown) => mockRegister(input) },
    payment: { process: (input: unknown) => mockProcess(input) },
  },
}));

const MEMBERS = [
  { id: 'm-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null, photoUrl: null, status: 'active' },
  { id: 'm-2', firstName: 'John', lastName: 'Smith', email: 'john@example.com', phone: '555', photoUrl: null, status: 'active' },
];

const TIERS: EventBilling[] = [
  { id: 'tier-1', name: 'Regular', price: 50, memberOnly: false, validUntil: null },
];

async function renderModal(overrides: Partial<Parameters<typeof EnrollMemberModal>[0]> = {}) {
  const onClose = vi.fn();
  const onEnrolled = vi.fn();
  await render(
    <EnrollMemberModal
      isOpen
      eventId="ev-1"
      eventName="Summer Camp"
      billingTiers={TIERS}
      onCloseAction={onClose}
      onEnrolledAction={onEnrolled}
      {...overrides}
    />,
  );
  return { onClose, onEnrolled };
}

describe('EnrollMemberModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMembersList.mockResolvedValue({ members: MEMBERS });
    mockListPaymentMethods.mockResolvedValue({ paymentMethods: [] });
    mockRegister.mockResolvedValue({ registrant: { id: 'reg-1' } });
    mockProcess.mockResolvedValue({ success: true, transactionId: 'tx-1' });
  });

  it('loads and lists members', async () => {
    await renderModal();

    await expect.element(page.getByText('Jane Doe')).toBeInTheDocument();
    await expect.element(page.getByText('John Smith')).toBeInTheDocument();
  });

  it('enrolls a member without charging when no saved card', async () => {
    const { onEnrolled } = await renderModal();

    await page.getByText('Jane Doe').click();
    // No saved card → the enroll button reads "Enroll"
    await page.getByRole('button', { name: 'Enroll', exact: true }).click();

    await vi.waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 'ev-1',
        memberId: 'm-1',
      }));
    });

    expect(mockProcess).not.toHaveBeenCalled();
    expect(onEnrolled).toHaveBeenCalled();
  });

  it('charges the saved card then enrolls with the transaction id', async () => {
    mockListPaymentMethods.mockResolvedValue({ paymentMethods: [{ type: 'card', last4: '4242' }] });
    await renderModal();

    await page.getByText('Jane Doe').click();
    // Pick the paid tier so the charge option becomes available.
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /Regular/ }).click();
    // Wait for the charge checkbox to appear, then tick it.
    const checkbox = page.getByRole('checkbox');

    await expect.element(checkbox).toBeInTheDocument();

    await checkbox.click();

    await page.getByRole('button', { name: 'Enroll & Charge' }).click();

    await vi.waitFor(() => {
      expect(mockProcess).toHaveBeenCalledWith(expect.objectContaining({
        memberId: 'm-1',
        paymentMethodSource: 'saved',
        isTaxable: true,
        billingType: 'one-time',
        amount: 50,
      }));
    });

    expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({
      memberId: 'm-1',
      transactionId: 'tx-1',
    }));
  });

  it('surfaces a decline and does not register', async () => {
    mockListPaymentMethods.mockResolvedValue({ paymentMethods: [{ type: 'card', last4: '4242' }] });
    mockProcess.mockResolvedValue({ success: false, declineReason: 'Card declined' });
    await renderModal();

    await page.getByText('Jane Doe').click();
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /Regular/ }).click();
    const checkbox = page.getByRole('checkbox');

    await expect.element(checkbox).toBeInTheDocument();

    await checkbox.click();
    await page.getByRole('button', { name: 'Enroll & Charge' }).click();

    await expect.element(page.getByText('Card declined')).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('filters the member list by search query', async () => {
    await renderModal();

    await expect.element(page.getByText('John Smith')).toBeInTheDocument();

    await userEvent.fill(page.getByPlaceholder('Search by name or email…'), 'jane');

    await expect.element(page.getByText('Jane Doe')).toBeInTheDocument();
    await expect.element(page.getByText('John Smith')).not.toBeInTheDocument();
  });
});
