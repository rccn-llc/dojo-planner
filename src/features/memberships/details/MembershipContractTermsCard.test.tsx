import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MembershipContractTermsCard } from './MembershipContractTermsCard';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  title: 'Contract Terms',
  edit_button: 'Edit',
  contract_length_label: 'Contract Length',
  contract_month_to_month: 'Month-to-Month',
  contract_3_months: '3 Months',
  contract_6_months: '6 Months',
  contract_12_months: '12 Months',
  auto_renewal_label: 'Auto-Renewal',
  renewal_none: 'No auto-renewal',
  renewal_month_to_month: 'Month-to-Month after contract',
  renewal_same_term: 'Same term renewal',
  cancellation_fee_label: 'Cancellation Fee',
  no_fee: 'No fee',
  hold_limit_label: 'Hold Limit',
  hold_limit_value: '{count} holds per year',
  no_holds: 'No holds allowed',
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

describe('MembershipContractTermsCard', () => {
  const mockOnEdit = vi.fn();

  const defaultProps = {
    contractLength: '12-months' as const,
    autoRenewal: 'month-to-month' as const,
    onEdit: mockOnEdit,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the card with title', () => {
    render(<MembershipContractTermsCard {...defaultProps} />);

    const heading = page.getByText('Contract Terms');

    expect(heading).toBeTruthy();
  });

  it('should render Edit button', () => {
    render(<MembershipContractTermsCard {...defaultProps} />);

    const editButton = page.getByRole('button');

    expect(editButton).toBeTruthy();
  });

  it('should call onEdit when Edit button is clicked', async () => {
    render(<MembershipContractTermsCard {...defaultProps} />);

    const editButton = page.getByRole('button');
    await userEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledTimes(1);
  });

  it('should render contract length label and value', () => {
    render(<MembershipContractTermsCard {...defaultProps} />);

    const contractLengthLabel = page.getByText('Contract Length');
    const contractLengthValue = page.getByText('12 Months');

    expect(contractLengthLabel).toBeTruthy();
    expect(contractLengthValue).toBeTruthy();
  });

  it('should render Month-to-Month contract length', () => {
    render(
      <MembershipContractTermsCard
        {...defaultProps}
        contractLength="month-to-month"
      />,
    );

    const contractLengthValue = page.getByText('Month-to-Month');

    expect(contractLengthValue).toBeTruthy();
  });

  it('should render auto-renewal label and value', () => {
    render(<MembershipContractTermsCard {...defaultProps} />);

    const autoRenewalLabel = page.getByText('Auto-Renewal');
    const autoRenewalValue = page.getByText('Month-to-Month after contract');

    expect(autoRenewalLabel).toBeTruthy();
    expect(autoRenewalValue).toBeTruthy();
  });

  it('should render No auto-renewal option', () => {
    render(
      <MembershipContractTermsCard
        {...defaultProps}
        autoRenewal="none"
      />,
    );

    const autoRenewalValue = page.getByText('No auto-renewal');

    expect(autoRenewalValue).toBeTruthy();
  });

  it('should render Same term renewal option', () => {
    render(
      <MembershipContractTermsCard
        {...defaultProps}
        autoRenewal="same-term"
      />,
    );

    const autoRenewalValue = page.getByText('Same term renewal');

    expect(autoRenewalValue).toBeTruthy();
  });

  it('should NOT render Cancellation Fee (moved to Payments and Fees card)', () => {
    render(<MembershipContractTermsCard {...defaultProps} />);

    const cancellationFeeLabels = Array.from(document.querySelectorAll('span')).filter(
      el => el.textContent === 'Cancellation Fee',
    );

    expect(cancellationFeeLabels.length).toBe(0);
  });

  it('should NOT render Hold Limit (moved to Payments and Fees card)', () => {
    render(<MembershipContractTermsCard {...defaultProps} />);

    const holdLimitLabels = Array.from(document.querySelectorAll('span')).filter(
      el => el.textContent === 'Hold Limit',
    );

    expect(holdLimitLabels.length).toBe(0);
  });

  it('should NOT render Hold Fee (moved to Payments and Fees card)', () => {
    render(<MembershipContractTermsCard {...defaultProps} />);

    const holdFeeLabels = Array.from(document.querySelectorAll('span')).filter(
      el => el.textContent === 'Hold Fee',
    );

    expect(holdFeeLabels.length).toBe(0);
  });

  it('should render 3 Months contract length', () => {
    render(
      <MembershipContractTermsCard
        {...defaultProps}
        contractLength="3-months"
      />,
    );

    const contractLengthValue = page.getByText('3 Months');

    expect(contractLengthValue).toBeTruthy();
  });

  it('should render 6 Months contract length', () => {
    render(
      <MembershipContractTermsCard
        {...defaultProps}
        contractLength="6-months"
      />,
    );

    const contractLengthValue = page.getByText('6 Months');

    expect(contractLengthValue).toBeTruthy();
  });
});
