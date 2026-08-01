import type { AddMemberWizardData } from '@/hooks/useAddMemberWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { HOHSelectionStep } from './HOHSelectionStep';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

const searchHOH = vi.fn();
const getHOHPaymentMethods = vi.fn();
vi.mock('@/libs/Orpc', () => ({
  client: {
    member: {
      searchHOH: (...args: unknown[]) => searchHOH(...args),
      getHOHPaymentMethods: (...args: unknown[]) => getHOHPaymentMethods(...args),
    },
  },
}));

const hoh = {
  id: 'hoh-1',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
  phone: null,
  photoUrl: null,
  status: 'active',
};

async function renderStep(overrides?: Partial<AddMemberWizardData>) {
  const onUpdate = vi.fn();
  const props = {
    data: { hohMemberId: undefined, ...overrides } as AddMemberWizardData,
    onUpdate,
    onNext: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
  };
  await render(<HOHSelectionStep {...props} />);
  return { onUpdate, props };
}

describe('HOHSelectionStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchHOH.mockResolvedValue({ members: [hoh] });
    getHOHPaymentMethods.mockResolvedValue({ paymentMethods: [] });
  });

  it('fetches and renders HOH members on mount', async () => {
    await renderStep();

    await expect.element(page.getByText('Jane Smith')).toBeInTheDocument();
    expect(searchHOH).toHaveBeenCalled();
  });

  it('shows the empty state when no HOH members exist', async () => {
    searchHOH.mockResolvedValue({ members: [] });
    await renderStep();

    await expect.element(page.getByText('no_hoh_found')).toBeInTheDocument();
  });

  it('filters the list by search query', async () => {
    searchHOH.mockResolvedValue({ members: [hoh, { ...hoh, id: 'hoh-2', firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com' }] });
    await renderStep();

    await expect.element(page.getByText('Jane Smith')).toBeInTheDocument();

    await userEvent.fill(page.getByPlaceholder('search_placeholder'), 'bob');

    await expect.element(page.getByText('Bob Jones')).toBeInTheDocument();
    expect(page.getByText('Jane Smith').elements()).toHaveLength(0);
  });

  it('selecting an HOH updates selection and fetches their payment method', async () => {
    getHOHPaymentMethods.mockResolvedValue({ paymentMethods: [{ last4: '4242', type: 'card' }] });
    const { onUpdate } = await renderStep();

    await userEvent.click(page.getByText('Jane Smith'));

    expect(getHOHPaymentMethods).toHaveBeenCalledWith({ hohMemberId: 'hoh-1' });

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ hohHasPaymentMethod: true, hohPaymentMethodLast4: '4242', hohPaymentMethodType: 'card' }),
    ));
  });

  it('marks HOH as having no payment method when none returned', async () => {
    const { onUpdate } = await renderStep();

    await userEvent.click(page.getByText('Jane Smith'));

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ hohHasPaymentMethod: false }),
    ));
  });
});
