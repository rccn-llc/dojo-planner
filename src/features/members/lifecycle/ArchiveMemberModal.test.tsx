import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { ArchiveMemberModal } from './ArchiveMemberModal';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

const remove = vi.fn();
const restore = vi.fn();
vi.mock('@/libs/Orpc', () => ({
  client: {
    member: {
      remove: (...args: unknown[]) => remove(...args),
      restore: (...args: unknown[]) => restore(...args),
    },
  },
}));

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  memberId: 'member-1',
  memberName: 'John Doe',
  onSuccess: vi.fn(),
};

describe('ArchiveMemberModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remove.mockResolvedValue({});
    restore.mockResolvedValue({});
  });

  it('does not render when closed', () => {
    render(<ArchiveMemberModal {...baseProps} mode="archive" isOpen={false} />);

    expect(page.getByText('archive_title').elements()).toHaveLength(0);
  });

  it('shows the archive title + notice in archive mode', async () => {
    render(<ArchiveMemberModal {...baseProps} mode="archive" />);

    await expect.element(page.getByText('archive_title')).toBeInTheDocument();
    await expect.element(page.getByText('archive_notice')).toBeInTheDocument();
  });

  it('shows the restore title + notice in restore mode', async () => {
    render(<ArchiveMemberModal {...baseProps} mode="restore" />);

    await expect.element(page.getByText('restore_title')).toBeInTheDocument();
    await expect.element(page.getByText('restore_notice')).toBeInTheDocument();
  });

  it('calls member.remove and fires success when archiving', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<ArchiveMemberModal {...baseProps} mode="archive" onSuccess={onSuccess} onClose={onClose} />);

    await userEvent.click(page.getByText('archive_confirm_button'));

    expect(remove).toHaveBeenCalledWith({ id: 'member-1' });
    expect(restore).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('calls member.restore and fires success when restoring', async () => {
    const onSuccess = vi.fn();
    render(<ArchiveMemberModal {...baseProps} mode="restore" onSuccess={onSuccess} />);

    await userEvent.click(page.getByText('restore_confirm_button'));

    expect(restore).toHaveBeenCalledWith({ id: 'member-1' });
    expect(remove).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('surfaces an error and keeps the modal open on failure', async () => {
    const onClose = vi.fn();
    remove.mockRejectedValue(new Error('boom'));
    render(<ArchiveMemberModal {...baseProps} mode="archive" onClose={onClose} />);

    await userEvent.click(page.getByText('archive_confirm_button'));

    await expect.element(page.getByText('boom')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
