import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { CancelMembershipModal } from './CancelMembershipModal';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

const cancelMembership = vi.fn();
vi.mock('@/libs/Orpc', () => ({
  client: {
    member: {
      cancelMembership: (...args: unknown[]) => cancelMembership(...args),
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
  cancellationFee: 50,
  onSuccess: vi.fn(),
};

describe('CancelMembershipModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelMembership.mockResolvedValue({});
  });

  it('does not render when closed', async () => {
    await render(<CancelMembershipModal {...baseProps} isOpen={false} />);

    expect(page.getByText('title').elements()).toHaveLength(0);
  });

  it('shows the fee notice and waive checkbox when a fee applies', async () => {
    await render(<CancelMembershipModal {...baseProps} />);

    await expect.element(page.getByText('fee_notice_title')).toBeInTheDocument();
    await expect.element(page.getByLabelText('waive_fee_label')).toBeInTheDocument();
  });

  it('hides the fee notice when there is no fee', async () => {
    await render(<CancelMembershipModal {...baseProps} cancellationFee={0} />);

    expect(page.getByText('fee_notice_title').elements()).toHaveLength(0);
  });

  it('calls cancelMembership with waiveFee=false by default and fires success', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    await render(<CancelMembershipModal {...baseProps} onSuccess={onSuccess} onClose={onClose} />);

    await userEvent.click(page.getByText('confirm_button'));

    expect(cancelMembership).toHaveBeenCalledWith({
      memberId: 'member-1',
      memberMembershipId: 'mm-1',
      waiveFee: false,
    });

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(onClose).toHaveBeenCalled();
  });

  it('passes waiveFee=true when the waive checkbox is ticked', async () => {
    await render(<CancelMembershipModal {...baseProps} />);

    await userEvent.click(page.getByLabelText('waive_fee_label'));
    await userEvent.click(page.getByText('confirm_button'));

    await vi.waitFor(() => expect(cancelMembership).toHaveBeenCalledWith(
      expect.objectContaining({ waiveFee: true }),
    ));
  });

  it('surfaces an error message when the cancel call throws', async () => {
    cancelMembership.mockRejectedValue(new Error('boom'));
    await render(<CancelMembershipModal {...baseProps} />);

    await userEvent.click(page.getByText('confirm_button'));

    await expect.element(page.getByText('boom')).toBeInTheDocument();
  });

  it('keeps the modal open with a warning when the fee charge fails (#240)', async () => {
    cancelMembership.mockResolvedValue({ feeChargeError: 'card declined' });
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    await render(<CancelMembershipModal {...baseProps} onSuccess={onSuccess} onClose={onClose} />);

    await userEvent.click(page.getByText('confirm_button'));

    // The cancellation still succeeded, so the parent is refreshed...
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());

    // ...but the modal stays open showing the partial-success warning (it used
    // to close instantly, so the warning was never seen), with a Done button.
    await expect.element(page.getByText(/partial_success/)).toBeInTheDocument();
    await expect.element(page.getByText('done_button')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Acknowledging via Done closes the modal.
    await userEvent.click(page.getByText('done_button'));

    expect(onClose).toHaveBeenCalled();
  });
});
