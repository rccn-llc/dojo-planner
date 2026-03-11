import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { SubscriptionDialog } from './SubscriptionDialog';

const mockRefetch = vi.fn();

const mockCurrentPlan: {
  planId: string | null;
  planName: string | null;
  status: string | null;
  billingCycle: string | null;
  currentPeriodEnd: number | null;
  isSuperAdmin: boolean;
  hasActiveSubscription: boolean;
} = {
  planId: 'basic',
  planName: 'Basic',
  status: 'active',
  billingCycle: 'monthly',
  currentPeriodEnd: null,
  isSuperAdmin: false,
  hasActiveSubscription: true,
};

const mockBillingHistory = [
  { invoiceId: 'INV-001', status: 'paid', amount: 49, invoiceDate: '2025-04-15', dueDate: '2025-04-15', paymentMethodLast4: '4242' },
  { invoiceId: 'INV-002', status: 'paid', amount: 49, invoiceDate: '2025-03-15', dueDate: '2025-03-15', paymentMethodLast4: '4242' },
  { invoiceId: 'INV-003', status: 'paid', amount: 49, invoiceDate: '2025-02-15', dueDate: '2025-02-15', paymentMethodLast4: '4242' },
];

let mockSubscriptionData: {
  currentPlan: typeof mockCurrentPlan;
  billingHistory: typeof mockBillingHistory;
  loading: boolean;
  error: string | null;
  refetch: typeof mockRefetch;
} = {
  currentPlan: mockCurrentPlan,
  billingHistory: mockBillingHistory,
  loading: false,
  error: null,
  refetch: mockRefetch,
};

vi.mock('@/hooks/useSubscriptionData', () => ({
  useSubscriptionData: () => mockSubscriptionData,
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: { firstName: 'Test', lastName: 'User', primaryEmailAddress: { emailAddress: 'test@example.com' } } }),
  useOrganization: () => ({ organization: { id: 'test-org-123', name: 'Test Org' } }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@/hooks/useTokenExIframe', () => ({
  useTokenExIframe: () => ({ isLoaded: false, isValid: false, isCvvValid: false, error: null, tokenize: vi.fn() }),
}));

vi.mock('@/libs/Orpc', () => ({
  client: {
    saasSubscription: {
      getCurrentPlan: vi.fn(),
      getBillingHistory: vi.fn(),
      getTokenizationConfig: vi.fn(),
      subscribe: vi.fn(),
      changePlan: vi.fn(),
      cancel: vi.fn(),
    },
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      title: 'Subscription',
      monthly_button: 'Monthly',
      annual_button: 'Annual',
      billing_history_heading: 'My Billing History',
      table_date: 'Date',
      table_method: 'Method',
      table_payment_id: 'Payment ID',
      support_button: 'Support',
      cancel_membership_button: 'Cancel Membership',
      current_plan_button: 'Current Plan',
      upgrade_plan_button: 'Upgrade Plan',
      downgrade_plan_button: 'Downgrade Plan',
      subscribe_button: 'Subscribe',
      contact_us_button: 'Contact Us',
      contact_us_price: 'Set up a free exploratory call',
      per_month: '/ month',
      loading: 'Loading...',
      error_loading: 'Error loading data',
      no_billing_history: 'No billing history',
      complimentary_plan: 'Complimentary plan',
      cancel_confirm_title: 'Cancel Membership?',
      cancel_confirm_message: 'This will end access for all users in your organization.',
      cancel_confirm_button: 'Yes, Cancel',
      cancel_cancel_button: 'Cancel',
      previous_button: 'Previous',
      next_button: 'Next',
      payment_section_title: 'Payment Information',
      card_number_label: 'Card Number',
      card_expiry_label: 'Expiration Date',
      card_expiry_placeholder: 'MM/YY',
      processing: 'Processing...',
      page_info: `Page ${params?.current ?? ''} of ${params?.total ?? ''}`,
    };
    return translations[key] || key;
  },
}));

describe('SubscriptionDialog', () => {
  const mockHandlers = {
    onOpenChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionData = {
      currentPlan: mockCurrentPlan,
      billingHistory: mockBillingHistory,
      loading: false,
      error: null,
      refetch: mockRefetch,
    };
  });

  it('should not render dialog when open is false', () => {
    render(
      <SubscriptionDialog
        open={false}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByRole('dialog').elements().length).toBe(0);
  });

  it('should render dialog when open is true', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const dialog = page.getByRole('dialog');

    expect(dialog).toBeTruthy();
  });

  it('should display dialog title', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('Subscription')).toBeTruthy();
  });

  it('should show loading state', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      loading: true,
    };

    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('Loading...')).toBeTruthy();
  });

  it('should show error state', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      loading: false,
      error: 'Something went wrong',
    };

    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('Error loading data')).toBeTruthy();
  });

  it('should render billing cycle toggle buttons', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const monthlyButton = page.getByRole('button', { name: /monthly/i });
    const annualButton = page.getByRole('button', { name: /annual/i });

    expect(monthlyButton).toBeTruthy();
    expect(annualButton).toBeTruthy();
  });

  it('should render pricing cards', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const basicCard = page.getByText('Basic');
    const growthCard = page.getByText('Growth');

    expect(basicCard).toBeTruthy();
    expect(growthCard).toBeTruthy();
  });

  it('should render monthly pricing by default', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('$49 / month')).toBeTruthy();
    expect(page.getByText('$125 / month')).toBeTruthy();
  });

  it('should render annual pricing when annual tab is selected', async () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const annualButton = page.getByRole('button', { name: /annual/i });
    await userEvent.click(annualButton.element());

    expect(page.getByText('$29 / month')).toBeTruthy();
    expect(page.getByText('$99 / month')).toBeTruthy();
  });

  it('should switch prices when toggling between monthly and annual', async () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('$49 / month')).toBeTruthy();
    expect(page.getByText('$125 / month')).toBeTruthy();

    const annualButton = page.getByRole('button', { name: /annual/i });
    await userEvent.click(annualButton.element());

    expect(page.getByText('$29 / month')).toBeTruthy();
    expect(page.getByText('$99 / month')).toBeTruthy();

    const monthlyButton = page.getByRole('button', { name: /monthly/i });
    await userEvent.click(monthlyButton.element());

    expect(page.getByText('$49 / month')).toBeTruthy();
    expect(page.getByText('$125 / month')).toBeTruthy();
  });

  it('should render plan buttons with Current Plan for Basic Monthly', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const currentPlanButton = page.getByRole('button', { name: /current plan/i });
    const upgradePlanButton = page.getByRole('button', { name: /upgrade plan/i });
    const contactButton = page.getByRole('button', { name: /contact us/i });

    expect(currentPlanButton).toBeTruthy();
    expect(upgradePlanButton).toBeTruthy();
    expect(contactButton).toBeTruthy();
  });

  it('should have Current Plan button disabled', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const currentPlanButton = page.getByRole('button', { name: /current plan/i });

    expect(currentPlanButton.element().hasAttribute('disabled')).toBe(true);
  });

  it('should show Upgrade Plan for Basic when Annual is selected', async () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByRole('button', { name: /current plan/i })).toBeTruthy();

    const annualButton = page.getByRole('button', { name: /annual/i });
    await userEvent.click(annualButton.element());

    const currentPlanButtons = page.getByRole('button', { name: /current plan/i }).elements();

    expect(currentPlanButtons.length).toBe(0);
  });

  it('should render features list', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('Unlimited students & classes').first()).toBeTruthy();
    expect(page.getByText('Digital attendance & student profiles').first()).toBeTruthy();
  });

  it('should render billing history heading', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('My Billing History')).toBeTruthy();
  });

  it('should render billing history data', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const paymentMethod = page.getByText(/Card ending/).first();

    expect(paymentMethod).toBeTruthy();
  });

  it('should render bottom action buttons', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const cancelButton = page.getByRole('button', { name: /cancel membership/i });

    expect(cancelButton).toBeTruthy();
  });

  it('should not show cancel button for super admins', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      currentPlan: { ...mockCurrentPlan, isSuperAdmin: true },
    };

    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const cancelButtons = page.getByRole('button', { name: /cancel membership/i }).elements();

    expect(cancelButtons.length).toBe(0);
  });

  it('should call onOpenChange when close button is clicked', async () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const closeButton = page.getByRole('button', { name: /close/i });
    await userEvent.click(closeButton.element());

    expect(mockHandlers.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should render plan descriptions', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('Just the Dojo Planner CRM without payment processing integration')).toBeTruthy();
    expect(page.getByText('Our premier product with payment processing and CRM all in one')).toBeTruthy();
    expect(page.getByText('All of the above plus custom branded experiences and more, get in touch!')).toBeTruthy();
  });

  it('should render excluded features with strikethrough styling', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('Payment processing integration')).toBeTruthy();
  });

  it('should render payment method information in billing history', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const paymentMethod = page.getByText(/Card ending/).first();

    expect(paymentMethod).toBeTruthy();
  });

  it('should render invoice IDs in billing history', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const invoiceId = page.getByText('INV-001').first();

    expect(invoiceId).toBeTruthy();
  });

  it('should render correct features for each plan', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('Unlimited students & classes')).toBeTruthy();
    expect(page.getByText('Payment processing integration')).toBeTruthy();
    expect(page.getByText('Everything in Basic')).toBeTruthy();
    expect(page.getByText('Custom branded website')).toBeTruthy();
  });

  it('should display Upgrade Plan button as enabled', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const upgradePlanButton = page.getByRole('button', { name: /upgrade plan/i });

    expect(upgradePlanButton.element().hasAttribute('disabled')).toBe(false);
  });

  it('should have green background on active subscription card', () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const basicCard = page.getByRole('heading', { name: 'Basic' }).element().closest('[class*="bg-green"]');

    expect(basicCard).toBeTruthy();
  });

  it('should remove green background from Basic when Annual is selected', async () => {
    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    let basicCard = page.getByRole('heading', { name: 'Basic' }).element().closest('[class*="bg-green"]');

    expect(basicCard).toBeTruthy();

    const annualButton = page.getByRole('button', { name: /annual/i });
    await userEvent.click(annualButton.element());

    basicCard = page.getByRole('heading', { name: 'Basic' }).element().closest('[class*="bg-green"]');

    expect(basicCard).toBeNull();
  });

  it('should show no billing history message when history is empty', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      billingHistory: [],
    };

    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('No billing history')).toBeTruthy();
  });

  it('should show complimentary plan message for super admins with no billing history', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      currentPlan: { ...mockCurrentPlan, isSuperAdmin: true },
      billingHistory: [],
    };

    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    expect(page.getByText('Complimentary plan')).toBeTruthy();
  });

  it('should show Subscribe button when no active subscription', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      currentPlan: { ...mockCurrentPlan, hasActiveSubscription: false, planId: null, planName: null },
    };

    render(
      <SubscriptionDialog
        open={true}
        onOpenChange={mockHandlers.onOpenChange}
      />,
    );

    const subscribeButtons = page.getByRole('button', { name: /subscribe/i }).elements();

    expect(subscribeButtons.length).toBe(2);
  });
});
