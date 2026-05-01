import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { DeleteTagAlertDialog } from './DeleteTagAlertDialog';

describe('DeleteTagAlertDialog', () => {
  const defaultProps = {
    isOpen: true,
    tagName: 'Beginner',
    onCloseAction: vi.fn(),
    onConfirmAction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and tag-name interpolated description', () => {
    render(
      <I18nWrapper>
        <DeleteTagAlertDialog {...defaultProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('heading', { name: 'Are you absolutely sure?' })).toBeInTheDocument();
    expect(page.getByText(/Beginner/)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <I18nWrapper>
        <DeleteTagAlertDialog {...defaultProps} isOpen={false} />
      </I18nWrapper>,
    );

    expect(page.getByRole('heading', { name: 'Are you absolutely sure?' }).elements().length).toBe(0);
  });

  it('calls onCloseAction when cancel is clicked', async () => {
    const onCloseAction = vi.fn();
    render(
      <I18nWrapper>
        <DeleteTagAlertDialog {...defaultProps} onCloseAction={onCloseAction} />
      </I18nWrapper>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    expect(onCloseAction).toHaveBeenCalled();
  });

  it('calls onConfirmAction when delete is clicked', async () => {
    const onConfirmAction = vi.fn();
    render(
      <I18nWrapper>
        <DeleteTagAlertDialog {...defaultProps} onConfirmAction={onConfirmAction} />
      </I18nWrapper>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Delete' }));

    expect(onConfirmAction).toHaveBeenCalled();
  });

  it('exposes the alertdialog role', () => {
    render(
      <I18nWrapper>
        <DeleteTagAlertDialog {...defaultProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('alertdialog')).toBeInTheDocument();
  });
});
