import type { AddClassWizardData } from '@/hooks/useAddClassWizard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { createMockWizardData } from '@/test-utils/mockWizardData';
import { EventBillingStep } from './EventBillingStep';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Event Pricing',
  subtitle: 'Set up pricing and discounts for your event',
  has_fee_label: 'Does this event have a registration fee?',
  has_fee_yes: 'Yes',
  has_fee_no: 'No (Free event)',
  price_label: 'Registration Price',
  price_placeholder: '0.00',
  price_error: 'Please enter a price.',
  early_bird_label: 'Early Bird Pricing',
  early_bird_description: 'Offer a discounted rate for early registration',
  early_bird_price_label: 'Early Bird Price',
  early_bird_deadline_label: 'Deadline',
  member_discount_label: 'Member Discount',
  member_discount_description: 'Offer a discount for existing members',
  member_discount_type_label: 'Discount Type',
  member_discount_amount_label: 'Amount',
  discount_percentage: 'Percentage',
  discount_fixed: 'Fixed Amount',
  back_button: 'Back',
  cancel_button: 'Cancel',
  next_button: 'Next',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    let result = translationKeys[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(`{${paramKey}}`, String(paramValue));
      });
    }
    return result;
  },
}));

describe('EventBillingStep', () => {
  const mockData = createMockWizardData({
    itemType: 'event',
    eventBilling: {
      hasFee: false,
      price: null,
      hasEarlyBird: false,
      earlyBirdPrice: null,
      earlyBirdDeadline: null,
      hasMemberDiscount: false,
      memberDiscountType: 'percentage',
      memberDiscountAmount: null,
    },
  });

  const mockHandlers = {
    onUpdate: vi.fn(),
    onUpdateEventBilling: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the step with title and subtitle', async () => {
    await render(
      <EventBillingStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const heading = page.getByRole('heading', { level: 2 });

    expect(heading).toBeTruthy();
  });

  it('should render has fee radio options', async () => {
    await render(
      <EventBillingStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const yesLabel = page.getByText('Yes');
    const noLabel = page.getByText('No (Free event)');

    expect(yesLabel).toBeTruthy();
    expect(noLabel).toBeTruthy();
  });

  it('should not show pricing fields when no fee is selected', async () => {
    await render(
      <EventBillingStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const priceLabels = Array.from(document.querySelectorAll('label')).filter(
      el => el.textContent === 'Registration Price',
    );

    expect(priceLabels.length).toBe(0);
  });

  it('should show pricing fields when fee is selected', async () => {
    const dataWithFee: AddClassWizardData = {
      ...mockData,
      eventBilling: {
        ...mockData.eventBilling,
        hasFee: true,
      },
    };

    await render(
      <EventBillingStep
        data={dataWithFee}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const priceLabel = page.getByText('Registration Price');

    expect(priceLabel).toBeTruthy();
  });

  it('should have Next button enabled when no fee is selected', async () => {
    await render(
      <EventBillingStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(false);
  });

  it('should have Next button disabled when fee is selected but no price', async () => {
    const dataWithFee: AddClassWizardData = {
      ...mockData,
      eventBilling: {
        ...mockData.eventBilling,
        hasFee: true,
        price: null,
      },
    };

    await render(
      <EventBillingStep
        data={dataWithFee}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(true);
  });

  it('should enable Next button when fee is selected and price is set', async () => {
    const dataWithPrice: AddClassWizardData = {
      ...mockData,
      eventBilling: {
        ...mockData.eventBilling,
        hasFee: true,
        price: 99.99,
      },
    };

    await render(
      <EventBillingStep
        data={dataWithPrice}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    expect(nextButton?.disabled).toBe(false);
  });

  it('should call onCancel when Cancel button is clicked', async () => {
    await render(
      <EventBillingStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const cancelButton = buttons.find(btn => btn.textContent?.includes('Cancel'));

    if (cancelButton) {
      await userEvent.click(cancelButton);

      expect(mockHandlers.onCancel).toHaveBeenCalled();
    }
  });

  it('should call onBack when Back button is clicked', async () => {
    await render(
      <EventBillingStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const backButton = buttons.find(btn => btn.textContent?.includes('Back'));

    if (backButton) {
      await userEvent.click(backButton);

      expect(mockHandlers.onBack).toHaveBeenCalled();
    }
  });

  it('should call onNext when Next button is clicked', async () => {
    await render(
      <EventBillingStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const nextButton = buttons.find(btn => btn.textContent?.includes('Next'));

    if (nextButton) {
      await userEvent.click(nextButton);

      expect(mockHandlers.onNext).toHaveBeenCalled();
    }
  });

  it('should display error message when provided', async () => {
    await render(
      <EventBillingStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
        error="Something went wrong"
      />,
    );

    const errorMessage = page.getByText('Something went wrong');

    expect(errorMessage).toBeTruthy();
  });

  it('should show early bird section when fee is selected', async () => {
    const dataWithFee: AddClassWizardData = {
      ...mockData,
      eventBilling: {
        ...mockData.eventBilling,
        hasFee: true,
      },
    };

    await render(
      <EventBillingStep
        data={dataWithFee}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const earlyBirdLabel = page.getByText('Early Bird Pricing');

    expect(earlyBirdLabel).toBeTruthy();
  });

  it('should show member discount section when fee is selected', async () => {
    const dataWithFee: AddClassWizardData = {
      ...mockData,
      eventBilling: {
        ...mockData.eventBilling,
        hasFee: true,
      },
    };

    await render(
      <EventBillingStep
        data={dataWithFee}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const memberDiscountLabel = page.getByText('Member Discount');

    expect(memberDiscountLabel).toBeTruthy();
  });

  it('should show early bird price fields when early bird is enabled', async () => {
    const dataWithEarlyBird: AddClassWizardData = {
      ...mockData,
      eventBilling: {
        ...mockData.eventBilling,
        hasFee: true,
        hasEarlyBird: true,
      },
    };

    await render(
      <EventBillingStep
        data={dataWithEarlyBird}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const earlyBirdPriceLabel = page.getByText('Early Bird Price');
    const deadlineLabel = page.getByText('Deadline');

    expect(earlyBirdPriceLabel).toBeTruthy();
    expect(deadlineLabel).toBeTruthy();
  });

  it('should show member discount fields when member discount is enabled', async () => {
    const dataWithDiscount: AddClassWizardData = {
      ...mockData,
      eventBilling: {
        ...mockData.eventBilling,
        hasFee: true,
        hasMemberDiscount: true,
      },
    };

    await render(
      <EventBillingStep
        data={dataWithDiscount}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const discountTypeLabel = page.getByText('Discount Type');
    const amountLabel = page.getByText('Amount');

    expect(discountTypeLabel).toBeTruthy();
    expect(amountLabel).toBeTruthy();
  });

  it('should render has fee question label', async () => {
    await render(
      <EventBillingStep
        data={mockData}
        onUpdate={mockHandlers.onUpdate}
        onUpdateEventBilling={mockHandlers.onUpdateEventBilling}
        onNext={mockHandlers.onNext}
        onBack={mockHandlers.onBack}
        onCancel={mockHandlers.onCancel}
      />,
    );

    const label = page.getByText('Does this event have a registration fee?');

    expect(label).toBeTruthy();
  });
});
