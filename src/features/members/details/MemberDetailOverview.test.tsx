import { describe, expect, it, vi } from 'vitest';

import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { MemberDetailOverview } from './MemberDetailOverview';

describe('MemberDetailOverview', () => {
  const mockProps = {
    memberId: '1',
    memberName: 'Anika Smith',
    photoUrl: 'https://example.com/photo.jpg',
    billingContactRole: 'Billing Contact',
    membershipBadge: 'Monthly Member',
    amountOverdue: '$45 Overdue',
    contactInfo: {
      address: '1234 S Side Road, San Francisco CA 94125',
      phone: '(415) 223-4123',
      email: 'email@example.com',
    },
    subscriptionDetails: {
      membershipType: 'Monthly Membership',
      status: 'active' as const,
      amount: 160,
      pastDuePayments: 0,
      lastPayment: 'Last payment: Sep 1, 2025',
    },
    familyMembers: [
      {
        id: '2',
        name: 'John Smith',
        relationship: 'Family Member',
        membershipType: 'Monthly Membership',
        status: 'active' as const,
        amount: 160,
      },
      {
        id: '3',
        name: 'Emma Smith',
        relationship: 'Family Member',
        membershipType: 'Youth Membership',
        status: 'active' as const,
        amount: 80,
      },
    ],
    onEditDetails: vi.fn(),
    onAddFamilyMember: vi.fn(),
    onChangeMembership: vi.fn(),
    onHoldMembership: vi.fn(),
  };

  describe('Render method', () => {
    it('should render member header with name', async () => {
      await render(<I18nWrapper><MemberDetailOverview {...mockProps} /></I18nWrapper>);

      expect(page.getByRole('heading', { name: 'Anika Smith' })).toBeInTheDocument();
    });

    it('should render member badges', async () => {
      await render(<I18nWrapper><MemberDetailOverview {...mockProps} /></I18nWrapper>);

      expect(page.getByText('Billing Contact')).toBeInTheDocument();
    });

    it('should render contact information section', async () => {
      await render(<I18nWrapper><MemberDetailOverview {...mockProps} /></I18nWrapper>);

      expect(page.getByText('Contact Information')).toBeInTheDocument();
      expect(page.getByText('1234 S Side Road, San Francisco CA 94125')).toBeInTheDocument();
    });

    it('should render family members section', async () => {
      await render(<I18nWrapper><MemberDetailOverview {...mockProps} /></I18nWrapper>);

      expect(page.getByText('John Smith')).toBeInTheDocument();
    });

    it('should render action buttons', async () => {
      await render(<I18nWrapper><MemberDetailOverview {...mockProps} /></I18nWrapper>);

      expect(page.getByRole('button', { name: 'Edit Details' }).first()).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('should call onEditDetails when edit button clicked', async () => {
      await render(<I18nWrapper><MemberDetailOverview {...mockProps} /></I18nWrapper>);
      const editButton = page.getByRole('button', { name: 'Edit Details' }).first();
      await editButton.click();

      expect(mockProps.onEditDetails).toHaveBeenCalled();
    });

    it('should call onAddFamilyMember when add family clicked', async () => {
      await render(<I18nWrapper><MemberDetailOverview {...mockProps} /></I18nWrapper>);
      const addButton = page.getByRole('button', { name: 'Add Family Member' });
      await addButton.click();

      expect(mockProps.onAddFamilyMember).toHaveBeenCalled();
    });

    it('should call onChangeMembership', async () => {
      await render(<I18nWrapper><MemberDetailOverview {...mockProps} /></I18nWrapper>);
      const changeButton = page.getByRole('button', { name: 'Change Membership' }).first();
      await changeButton.click();

      expect(mockProps.onChangeMembership).toHaveBeenCalled();
    });

    it('should call onHoldMembership', async () => {
      await render(<I18nWrapper><MemberDetailOverview {...mockProps} /></I18nWrapper>);
      const holdButton = page.getByRole('button', { name: 'Hold' });
      await holdButton.click();

      expect(mockProps.onHoldMembership).toHaveBeenCalled();
    });
  });

  describe('Empty states', () => {
    it('should render empty family members list with add button', async () => {
      const propsWithoutFamily = {
        ...mockProps,
        familyMembers: [],
      };
      await render(<I18nWrapper><MemberDetailOverview {...propsWithoutFamily} /></I18nWrapper>);

      expect(page.getByRole('button', { name: 'Add Family Member' })).toBeInTheDocument();
    });
  });

  describe('Avatar rendering', () => {
    it('should render avatar with initials when no photo', async () => {
      const propsWithoutPhoto = {
        ...mockProps,
        photoUrl: undefined,
      };
      await render(<I18nWrapper><MemberDetailOverview {...propsWithoutPhoto} /></I18nWrapper>);

      expect(page.getByText('AS').first()).toBeInTheDocument();
    });
  });
});
