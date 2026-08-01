import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { HoldMembershipModal } from './HoldMembershipModal';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

const holdMembership = vi.fn();
vi.mock('@/libs/Orpc', () => ({
  client: {
    member: {
      holdMembership: (...args: unknown[]) => holdMembership(...args),
    },
  },
}));

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  memberId: 'member-1',
  memberMembershipId: 'mm-1',
  memberName: 'John Doe',
  planName: 'Monthly Unlimited',
  holdFeeAmount: 25,
  holdFeeFrequency: 'one-time' as string | null,
  onSuccess: vi.fn(),
};

describe('HoldMembershipModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holdMembership.mockResolvedValue({});
  });

  it('does not render when closed', async () => {
    await render(<HoldMembershipModal {...baseProps} isOpen={false} />);

    expect(page.getByText('title').elements()).toHaveLength(0);
  });

  it('shows the one-time fee notice for a one-time hold fee', async () => {
    await render(<HoldMembershipModal {...baseProps} holdFeeFrequency="one-time" />);

    await expect.element(page.getByText('one_time_fee_title')).toBeInTheDocument();
  });

  it('shows the recurring fee notice for a recurring hold fee', async () => {
    await render(<HoldMembershipModal {...baseProps} holdFeeFrequency="Monthly" />);

    await expect.element(page.getByText('recurring_fee_title')).toBeInTheDocument();
  });

  it('hides the fee notice when there is no hold fee', async () => {
    await render(<HoldMembershipModal {...baseProps} holdFeeAmount={0} holdFeeFrequency={null} />);

    expect(page.getByText('one_time_fee_title').elements()).toHaveLength(0);
    expect(page.getByText('recurring_fee_title').elements()).toHaveLength(0);
  });

  it('calls holdMembership and fires success on confirm', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    await render(<HoldMembershipModal {...baseProps} onSuccess={onSuccess} onClose={onClose} />);

    await userEvent.click(page.getByText('confirm_button'));

    expect(holdMembership).toHaveBeenCalledWith({
      memberId: 'member-1',
      memberMembershipId: 'mm-1',
    });

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces an error message when the hold call throws', async () => {
    holdMembership.mockRejectedValue(new Error('hold failed'));
    await render(<HoldMembershipModal {...baseProps} />);

    await userEvent.click(page.getByText('confirm_button'));

    await expect.element(page.getByText('hold failed')).toBeInTheDocument();
  });
});
