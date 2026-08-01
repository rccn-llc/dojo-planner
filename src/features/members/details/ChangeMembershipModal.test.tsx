import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { ChangeMembershipModal } from './ChangeMembershipModal';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

const mockListMembershipPlans = vi.fn();
const mockAddMembership = vi.fn();
const mockChangeMembership = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    member: {
      listMembershipPlans: () => mockListMembershipPlans(),
      addMembership: (params: { memberId: string; membershipPlanId: string }) => mockAddMembership(params),
      changeMembership: (params: { memberId: string; newMembershipPlanId: string }) => mockChangeMembership(params),
    },
  },
}));

vi.mock('@/hooks/useMembersCache', () => ({
  invalidateMembersCache: vi.fn(),
}));

const mockMembershipPlans = [
  {
    id: 'plan-1',
    name: '12 Month Commitment (Gold)',
    slug: '12_month_commitment_gold',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 150,
    signupFee: 0,
    frequency: 'Monthly',
    contractLength: '12 Months',
    accessLevel: 'Unlimited',
    description: '12 month contract with unlimited access',
    isTrial: false,
    isActive: true,
  },
  {
    id: 'plan-2',
    name: 'Month to Month (Gold)',
    slug: 'month_to_month_gold',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 170,
    signupFee: 0,
    frequency: 'Monthly',
    contractLength: 'Month-to-Month',
    accessLevel: 'Unlimited',
    description: 'No commitment, month-to-month with unlimited access',
    isTrial: false,
    isActive: true,
  },
  {
    id: 'plan-3',
    name: '7-Day Free Trial',
    slug: '7_day_free_trial',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 0,
    signupFee: 0,
    frequency: 'None',
    contractLength: '7 Days',
    accessLevel: '3 Classes',
    description: '7-day trial with 3 classes',
    isTrial: true,
    isActive: true,
  },
];

describe('ChangeMembershipModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListMembershipPlans.mockResolvedValue({ plans: mockMembershipPlans });
    mockAddMembership.mockResolvedValue({ id: 'membership-1' });
    mockChangeMembership.mockResolvedValue({ id: 'membership-2' });
  });

  describe('Modal visibility', () => {
    it('should not render when isOpen is false', async () => {
      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={false}
            onClose={vi.fn()}
            memberId="member-1"
            mode="add"
          />
        </I18nWrapper>,
      );

      expect(page.getByRole('heading', { name: 'Add Membership' })).not.toBeInTheDocument();
    });
  });

  describe('Add mode', () => {
    it('should render add title and description', async () => {
      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={vi.fn()}
            memberId="member-1"
            mode="add"
          />
        </I18nWrapper>,
      );

      await expect.element(page.getByRole('heading', { name: 'Add Membership' })).toBeInTheDocument();
      await expect.element(page.getByText('Select a membership plan for this member.')).toBeInTheDocument();
    });

    it('should display membership plans after loading', async () => {
      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={vi.fn()}
            memberId="member-1"
            mode="add"
          />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('12 Month Commitment (Gold)')).toBeInTheDocument();
      await expect.element(page.getByText('Month to Month (Gold)')).toBeInTheDocument();
      await expect.element(page.getByText('7-Day Free Trial')).toBeInTheDocument();
    });

    it('should display prices correctly', async () => {
      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={vi.fn()}
            memberId="member-1"
            mode="add"
          />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('$150.00/mo')).toBeInTheDocument();
      await expect.element(page.getByText('$170.00/mo')).toBeInTheDocument();
      await expect.element(page.getByText('Free', { exact: true })).toBeInTheDocument();
    });

    it('should disable submit button when no plan selected', async () => {
      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={vi.fn()}
            memberId="member-1"
            mode="add"
          />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('12 Month Commitment (Gold)')).toBeInTheDocument();

      const addButton = page.getByRole('button', { name: 'Add Membership' });

      expect(addButton.element()).toBeDisabled();
    });

    it('should enable submit button when plan selected', async () => {
      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={vi.fn()}
            memberId="member-1"
            mode="add"
          />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('12 Month Commitment (Gold)')).toBeInTheDocument();

      const planCard = page.getByLabelText('Select 12 Month Commitment (Gold) membership');
      await planCard.click();

      const addButton = page.getByRole('button', { name: 'Add Membership' });

      expect(addButton.element()).not.toBeDisabled();
    });

    it('should call addMembership when submitting', async () => {
      const onClose = vi.fn();

      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={onClose}
            memberId="member-1"
            mode="add"
          />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('12 Month Commitment (Gold)')).toBeInTheDocument();

      const planCard = page.getByLabelText('Select 12 Month Commitment (Gold) membership');
      await planCard.click();

      const addButton = page.getByRole('button', { name: 'Add Membership' });
      await addButton.click();

      await vi.waitFor(() => {
        expect(mockAddMembership).toHaveBeenCalledWith({
          memberId: 'member-1',
          membershipPlanId: 'plan-1',
        });
      });
    });
  });

  describe('Change mode', () => {
    it('should render change title and description', async () => {
      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={vi.fn()}
            memberId="member-1"
            currentMembershipPlanId="plan-1"
            mode="change"
          />
        </I18nWrapper>,
      );

      await expect.element(page.getByRole('heading', { name: 'Change Membership' })).toBeInTheDocument();
      await expect.element(page.getByText('Select a new membership plan. The current plan will be marked as converted.')).toBeInTheDocument();
    });

    it('should filter out current membership plan', async () => {
      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={vi.fn()}
            memberId="member-1"
            currentMembershipPlanId="plan-1"
            mode="change"
          />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Month to Month (Gold)')).toBeInTheDocument();
      await expect.element(page.getByText('7-Day Free Trial')).toBeInTheDocument();
      expect(page.getByText('12 Month Commitment (Gold)')).not.toBeInTheDocument();
    });

    it('should call changeMembership when submitting', async () => {
      const onClose = vi.fn();

      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={onClose}
            memberId="member-1"
            currentMembershipPlanId="plan-1"
            mode="change"
          />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Month to Month (Gold)')).toBeInTheDocument();

      const planCard = page.getByLabelText('Select Month to Month (Gold) membership');
      await planCard.click();

      const changeButton = page.getByRole('button', { name: 'Change Membership' });
      await changeButton.click();

      await vi.waitFor(() => {
        expect(mockChangeMembership).toHaveBeenCalledWith({
          memberId: 'member-1',
          newMembershipPlanId: 'plan-2',
        });
      });
    });
  });

  describe('Actions', () => {
    it('should call onClose when cancel clicked', async () => {
      const onClose = vi.fn();

      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={onClose}
            memberId="member-1"
            mode="add"
          />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('12 Month Commitment (Gold)')).toBeInTheDocument();

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Fallback behavior', () => {
    it('should show mock plans when fetch fails', async () => {
      mockListMembershipPlans.mockRejectedValue(new Error('Network error'));

      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={vi.fn()}
            memberId="member-1"
            mode="add"
          />
        </I18nWrapper>,
      );

      // Should fall back to mock plans instead of showing error
      await expect.element(page.getByText('12 Month Commitment (Gold)')).toBeInTheDocument();
      await expect.element(page.getByText('Month to Month (Gold)')).toBeInTheDocument();
    });

    it('should show mock plans when API returns empty list', async () => {
      mockListMembershipPlans.mockResolvedValue({ plans: [] });

      await render(
        <I18nWrapper>
          <ChangeMembershipModal
            isOpen={true}
            onClose={vi.fn()}
            memberId="member-1"
            mode="add"
          />
        </I18nWrapper>,
      );

      // Should fall back to mock plans instead of showing empty state
      await expect.element(page.getByText('12 Month Commitment (Gold)')).toBeInTheDocument();
      await expect.element(page.getByText('Month to Month (Gold)')).toBeInTheDocument();
    });
  });
});
