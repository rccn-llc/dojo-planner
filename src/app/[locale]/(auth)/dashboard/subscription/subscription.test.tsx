import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import SubscriptionPage from './page';

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

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('Subscription Page', () => {
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

  it('renders subscription header', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const heading = page.getByRole('heading', { name: /Subscription/i });

    expect(heading).toBeInTheDocument();
  });

  it('renders billing cycle toggle buttons', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const monthlyButton = page.getByRole('button', { name: /Monthly/i });
    const annualButton = page.getByRole('button', { name: /Annual/i });

    expect(monthlyButton).toBeInTheDocument();
    expect(annualButton).toBeInTheDocument();
  });

  it('renders pricing cards', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const basicCard = page.getByRole('heading', { name: 'Basic' });
    const growthCard = page.getByRole('heading', { name: 'Growth' });

    expect(basicCard).toBeInTheDocument();
    expect(growthCard).toBeInTheDocument();
  });

  it('renders monthly pricing by default', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const basicPrice = page.getByText(/\$49 \/ month/);
    const growthPrice = page.getByText(/\$125 \/ month/);

    expect(basicPrice).toBeInTheDocument();
    expect(growthPrice).toBeInTheDocument();
  });

  it('renders annual pricing when annual tab is selected', async () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const annualButton = page.getByRole('button', { name: /Annual/i });
    await annualButton.click();

    const basicPrice = page.getByText(/\$29 \/ month/);
    const growthPrice = page.getByText(/\$99 \/ month/);

    expect(basicPrice).toBeInTheDocument();
    expect(growthPrice).toBeInTheDocument();
  });

  it('switches prices when toggling between monthly and annual', async () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    expect(page.getByText(/\$49 \/ month/)).toBeInTheDocument();
    expect(page.getByText(/\$125 \/ month/)).toBeInTheDocument();

    const annualButton = page.getByRole('button', { name: /Annual/i });
    await annualButton.click();

    expect(page.getByText(/\$29 \/ month/)).toBeInTheDocument();
    expect(page.getByText(/\$99 \/ month/)).toBeInTheDocument();

    const monthlyButton = page.getByRole('button', { name: /Monthly/i });
    await monthlyButton.click();

    expect(page.getByText(/\$49 \/ month/)).toBeInTheDocument();
    expect(page.getByText(/\$125 \/ month/)).toBeInTheDocument();
  });

  it('renders plan buttons with Current Plan for Basic Monthly', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const currentPlanButton = page.getByRole('button', { name: /Current Plan/i });
    const upgradePlanButton = page.getByRole('button', { name: /Upgrade Plan/i });

    expect(currentPlanButton).toBeInTheDocument();
    expect(upgradePlanButton).toBeInTheDocument();
  });

  it('shows Upgrade Plan for Basic when Annual is selected', async () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    expect(page.getByRole('button', { name: /Current Plan/i })).toBeInTheDocument();

    const annualButton = page.getByRole('button', { name: /Annual/i });
    await annualButton.click();

    const currentPlanButtons = page.getByRole('button', { name: /Current Plan/i }).elements();

    expect(currentPlanButtons.length).toBe(0);
  });

  it('renders features list', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const feature1 = page.getByText(/Unlimited students & classes/).first();
    const feature2 = page.getByText(/Digital attendance & student profiles/).first();

    expect(feature1).toBeInTheDocument();
    expect(feature2).toBeInTheDocument();
  });

  it('renders billing history heading', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const billingHeading = page.getByText(/My Billing History/);

    expect(billingHeading).toBeInTheDocument();
  });

  it('renders billing history table headers', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const dateHeader = page.getByText('Date').first();
    const methodHeader = page.getByText('Method').first();
    const paymentIdHeader = page.getByText('Payment ID').first();

    expect(dateHeader).toBeInTheDocument();
    expect(methodHeader).toBeInTheDocument();
    expect(paymentIdHeader).toBeInTheDocument();
  });

  it('renders billing history data', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const methodElement = page.getByText(/Card ending/).first();

    expect(methodElement).toBeInTheDocument();
  });

  it('renders bottom action buttons', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const cancelButton = page.getByRole('button', { name: /Cancel Membership/i });

    expect(cancelButton).toBeInTheDocument();
  });

  it('renders payment method information', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const paymentMethod = page.getByText(/Card ending/).first();

    expect(paymentMethod).toBeInTheDocument();
  });

  it('renders invoice IDs in billing history', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const invoiceIds = page.getByText(/INV-001/).elements();

    expect(invoiceIds.length).toBeGreaterThan(0);
  });

  it('renders plan descriptions', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const basicDescription = page.getByText(/Full access to Dojo Planner CRM/);
    const growthDescription = page.getByText(/Everything in Basic plus additional web presence/);

    expect(basicDescription).toBeInTheDocument();
    expect(growthDescription).toBeInTheDocument();
  });

  it('has Current Plan button disabled', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const currentPlanButton = page.getByRole('button', { name: /Current Plan/i });

    expect(currentPlanButton.element().hasAttribute('disabled')).toBe(true);
  });

  it('has Upgrade Plan button enabled', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const upgradePlanButton = page.getByRole('button', { name: /Upgrade Plan/i });

    expect(upgradePlanButton.element().hasAttribute('disabled')).toBe(false);
  });

  it('renders Growth plan features', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const everythingInBasic = page.getByText(/Everything in Basic/).first();
    const customWebsite = page.getByText(/Custom branded website/).first();

    expect(everythingInBasic).toBeInTheDocument();
    expect(customWebsite).toBeInTheDocument();
  });

  it('has green background on active subscription card', () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const basicCard = page.getByRole('heading', { name: 'Basic' }).element().closest('[class*="bg-green"]');

    expect(basicCard).toBeTruthy();
  });

  it('removes green background from Basic when Annual is selected', async () => {
    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    let basicCard = page.getByRole('heading', { name: 'Basic' }).element().closest('[class*="bg-green"]');

    expect(basicCard).toBeTruthy();

    const annualButton = page.getByRole('button', { name: /Annual/i });
    await annualButton.click();

    basicCard = page.getByRole('heading', { name: 'Basic' }).element().closest('[class*="bg-green"]');

    expect(basicCard).toBeNull();
  });

  it('shows loading state', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      loading: true,
    };

    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    expect(page.getByText(/Loading/)).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      loading: false,
      error: 'Something went wrong',
    };

    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    expect(page.getByText(/Failed to load subscription data/i)).toBeInTheDocument();
  });

  it('does not show cancel button for super admins', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      currentPlan: { ...mockCurrentPlan, isSuperAdmin: true },
    };

    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const cancelButtons = page.getByRole('button', { name: /Cancel Membership/i }).elements();

    expect(cancelButtons.length).toBe(0);
  });

  it('shows no billing history message when empty', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      billingHistory: [],
    };

    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    expect(page.getByText(/No billing history/i)).toBeInTheDocument();
  });

  it('shows Subscribe buttons when no active subscription', () => {
    mockSubscriptionData = {
      ...mockSubscriptionData,
      currentPlan: { ...mockCurrentPlan, hasActiveSubscription: false, planId: null, planName: null },
    };

    render(<I18nWrapper><SubscriptionPage /></I18nWrapper>);

    const subscribeButtons = page.getByRole('button', { name: /Subscribe/i }).elements();

    expect(subscribeButtons.length).toBe(2);
  });
});
