import { describe, expect, it, vi } from 'vitest';

import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { MemberDetailFinancial } from './MemberDetailFinancial';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('MemberDetailFinancial', () => {
  const mockProps = {
    memberId: '1',
    memberName: 'Anika Smith',
    photoUrl: 'https://example.com/photo.jpg',
    billingContactRole: 'Billing Contact',
    membershipBadge: 'Monthly Member',
    amountOverdue: '$45 Overdue',
    membershipDetails: {
      status: 'active' as const,
      program: 'Caio Terra Academy Palo Alto (Adults)',
      membershipType: 'Month-to-Month',
      membershipFee: 300,
      paymentFrequency: 'Monthly',
      registrationDate: 'Sep 01, 2025',
      startDate: 'Sep 01, 2025',
      nextPaymentDate: 'Oct 01, 2025',
      nextPaymentAmount: 300,
    },
    paymentMethod: {
      last4: '0046',
      brand: 'Visa',
      isDefault: true,
    },
    agreement: {
      signedDate: 'Sep 01, 2025',
      status: 'signed' as const,
    },
    billingHistory: [
      {
        id: '1',
        date: 'Apr 15, 2025',
        member: 'Family Membership',
        amount: 480,
        purpose: 'Monthly Family Dues',
        method: 'Card ending •••• 1234',
        groupType: 'family' as const,
        children: [],
      },
    ],
    onChangeMembership: vi.fn(),
    onSendSecureLink: vi.fn(),
    onDownloadAgreement: vi.fn(),
    onRefund: vi.fn(),
  };

  describe('Render method', () => {
    it('should render member header with name', async () => {
      await render(<MemberDetailFinancial {...mockProps} />);

      expect(page.getByRole('heading', { name: 'Anika Smith' })).toBeInTheDocument();
    });

    it('should render membership details', async () => {
      await render(<MemberDetailFinancial {...mockProps} />);

      expect(page.getByRole('heading', { name: 'membership_details' })).toBeInTheDocument();
    });

    it('should render program information', async () => {
      await render(<MemberDetailFinancial {...mockProps} />);

      expect(page.getByText('Caio Terra Academy Palo Alto (Adults)')).toBeInTheDocument();
    });

    it('should render payment method section', async () => {
      await render(<MemberDetailFinancial {...mockProps} />);

      expect(page.getByRole('heading', { name: 'payment_method' })).toBeInTheDocument();
    });

    it('should render agreement section', async () => {
      await render(<MemberDetailFinancial {...mockProps} />);

      expect(page.getByText('agreement_waiver')).toBeInTheDocument();
    });

    it('should render billing history', async () => {
      await render(<MemberDetailFinancial {...mockProps} />);

      expect(page.getByText('billing_history')).toBeInTheDocument();
    });

    it('should render action buttons', async () => {
      await render(<MemberDetailFinancial {...mockProps} />);

      expect(page.getByRole('button', { name: 'change_membership_button' })).toBeInTheDocument();
      expect(page.getByRole('button', { name: 'download_button' })).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('should call onChangeMembership when change membership button is clicked', async () => {
      await render(<MemberDetailFinancial {...mockProps} />);
      const changeButton = page.getByRole('button', { name: 'change_membership_button' });
      await changeButton.click();

      expect(mockProps.onChangeMembership).toHaveBeenCalled();
    });

    it('should call onDownloadAgreement when download button is clicked', async () => {
      await render(<MemberDetailFinancial {...mockProps} />);
      const downloadButton = page.getByRole('button', { name: 'download_button' });
      await downloadButton.click();

      expect(mockProps.onDownloadAgreement).toHaveBeenCalled();
    });
  });

  describe('Status rendering', () => {
    it('should render active status', async () => {
      await render(<MemberDetailFinancial {...mockProps} />);

      expect(page.getByText('Active').first()).toBeInTheDocument();
    });

    it('should render on-hold status', async () => {
      const propsWithHold = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          status: 'on-hold' as const,
        },
      };
      await render(<MemberDetailFinancial {...propsWithHold} />);

      expect(page.getByText('On Hold')).toBeInTheDocument();
    });
  });

  describe('Billing type and autopay functionality', () => {
    it('should render billing type label when billing type is provided', async () => {
      const propsWithBillingType = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: 'autopay' as const,
        },
      };
      await render(<MemberDetailFinancial {...propsWithBillingType} />);

      expect(page.getByText('billing_type_label')).toBeInTheDocument();
    });

    it('should render autopay badge when billing type is autopay', async () => {
      const propsWithAutopay = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: 'autopay' as const,
        },
      };
      await render(<MemberDetailFinancial {...propsWithAutopay} />);

      expect(page.getByText('billing_type_autopay')).toBeInTheDocument();
    });

    it('should render one-time badge when billing type is one-time', async () => {
      const propsWithOneTime = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: 'one-time' as const,
        },
      };
      await render(<MemberDetailFinancial {...propsWithOneTime} />);

      expect(page.getByText('billing_type_onetime')).toBeInTheDocument();
    });

    it('should not render billing type section when billing type is not provided', async () => {
      const propsWithoutBillingType = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: undefined,
        },
      };
      await render(<MemberDetailFinancial {...propsWithoutBillingType} />);

      // Check that the billing type label is not in the document
      const billingTypeLabel = Array.from(document.querySelectorAll('p')).find(el => el.textContent === 'billing_type_label');

      expect(billingTypeLabel).toBeFalsy();
    });

    it('should not render billing type section when payment frequency is N/A', async () => {
      const propsWithNoFrequency = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: 'autopay' as const,
          paymentFrequency: 'N/A',
        },
      };
      await render(<MemberDetailFinancial {...propsWithNoFrequency} />);

      // Check that the billing type label is not in the document
      const billingTypeLabel = Array.from(document.querySelectorAll('p')).find(el => el.textContent === 'billing_type_label');

      expect(billingTypeLabel).toBeFalsy();
    });

    it('should render first payment date when provided', async () => {
      const propsWithFirstPayment = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          firstPaymentDate: 'Sep 01, 2025',
        },
      };
      await render(<MemberDetailFinancial {...propsWithFirstPayment} />);

      expect(page.getByText('first_payment_date_label')).toBeInTheDocument();
      expect(page.getByText('Sep 01, 2025').last()).toBeInTheDocument();
    });

    it('should not render first payment date when not provided', async () => {
      const propsWithoutFirstPayment = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          firstPaymentDate: undefined,
        },
      };
      await render(<MemberDetailFinancial {...propsWithoutFirstPayment} />);

      // Check that the first payment date label is not in the document
      const firstPaymentLabel = Array.from(document.querySelectorAll('p')).find(el => el.textContent === 'first_payment_date_label');

      expect(firstPaymentLabel).toBeFalsy();
    });

    it('should render next payment date only when billing type is autopay', async () => {
      const propsWithAutopay = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: 'autopay' as const,
          nextPaymentDate: 'Oct 01, 2025',
        },
      };
      await render(<MemberDetailFinancial {...propsWithAutopay} />);

      expect(page.getByText('next_payment_date_label')).toBeInTheDocument();
    });

    it('should not render next payment date when billing type is one-time', async () => {
      const propsWithOneTime = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: 'one-time' as const,
          nextPaymentDate: 'Oct 01, 2025',
        },
      };
      await render(<MemberDetailFinancial {...propsWithOneTime} />);

      // Check that the next payment date label is not in the document (for one-time billing)
      const nextPaymentLabel = Array.from(document.querySelectorAll('p')).find(el => el.textContent === 'next_payment_date_label');

      expect(nextPaymentLabel).toBeFalsy();
    });

    it('should render next payment amount only when billing type is autopay', async () => {
      const propsWithAutopay = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: 'autopay' as const,
          nextPaymentAmount: 300,
        },
      };
      await render(<MemberDetailFinancial {...propsWithAutopay} />);

      expect(page.getByText('next_payment_amount_label')).toBeInTheDocument();
    });

    it('should not render next payment amount when billing type is one-time', async () => {
      const propsWithOneTime = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: 'one-time' as const,
          nextPaymentAmount: 300,
        },
      };
      await render(<MemberDetailFinancial {...propsWithOneTime} />);

      // Check that the next payment amount label is not in the document (for one-time billing)
      const nextPaymentAmountLabel = Array.from(document.querySelectorAll('p')).find(el => el.textContent === 'next_payment_amount_label');

      expect(nextPaymentAmountLabel).toBeFalsy();
    });

    it('should show both first payment date and next payment date for autopay', async () => {
      const propsWithAutopay = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: 'autopay' as const,
          firstPaymentDate: 'Sep 01, 2025',
          nextPaymentDate: 'Oct 01, 2025',
        },
      };
      await render(<MemberDetailFinancial {...propsWithAutopay} />);

      expect(page.getByText('first_payment_date_label')).toBeInTheDocument();
      expect(page.getByText('next_payment_date_label')).toBeInTheDocument();
    });

    it('should only show first payment date for one-time billing', async () => {
      const propsWithOneTime = {
        ...mockProps,
        membershipDetails: {
          ...mockProps.membershipDetails,
          billingType: 'one-time' as const,
          firstPaymentDate: 'Sep 01, 2025',
          nextPaymentDate: 'Oct 01, 2025',
        },
      };
      await render(<MemberDetailFinancial {...propsWithOneTime} />);

      expect(page.getByText('first_payment_date_label')).toBeInTheDocument();

      // Next payment date should NOT be shown for one-time billing
      const nextPaymentLabel = Array.from(document.querySelectorAll('p')).find(el => el.textContent === 'next_payment_date_label');

      expect(nextPaymentLabel).toBeFalsy();
    });
  });
});
