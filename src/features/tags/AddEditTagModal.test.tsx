import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { AddEditTagModal } from './AddEditTagModal';

describe('AddEditTagModal', () => {
  const baseProps = {
    isOpen: true,
    mode: 'create' as const,
    onCloseAction: vi.fn(),
    onSubmitAction: vi.fn(async () => undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the create-mode title', () => {
    render(
      <I18nWrapper>
        <AddEditTagModal {...baseProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('heading', { name: /add.*tag/i })).toBeInTheDocument();
  });

  it('renders the edit-mode title and pre-fills the inputs', () => {
    render(
      <I18nWrapper>
        <AddEditTagModal
          {...baseProps}
          mode="edit"
          initialName="Beginner"
          initialColor="#abcdef"
        />
      </I18nWrapper>,
    );

    expect(page.getByRole('heading', { name: /edit.*tag/i })).toBeInTheDocument();

    const nameInput = page.getByRole('textbox', { name: /name/i });

    expect(nameInput).toHaveValue('Beginner');
  });

  it('disables save when name is empty', () => {
    render(
      <I18nWrapper>
        <AddEditTagModal {...baseProps} />
      </I18nWrapper>,
    );

    const saveButton = page.getByRole('button', { name: /save/i });

    expect(saveButton).toBeDisabled();
  });

  it('calls onSubmitAction with trimmed name and chosen color', async () => {
    const onSubmitAction = vi.fn(async () => undefined);
    render(
      <I18nWrapper>
        <AddEditTagModal {...baseProps} onSubmitAction={onSubmitAction} />
      </I18nWrapper>,
    );

    const nameInput = page.getByRole('textbox', { name: /name/i });
    await userEvent.type(nameInput, '  Beginner  ');

    const saveButton = page.getByRole('button', { name: /save/i });
    await saveButton.click();

    expect(onSubmitAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Beginner' }),
    );
  });

  it('renders the server error message and stays open when onSubmitAction returns one', async () => {
    const onSubmitAction = vi.fn(async () => 'A tag named "Beginner" already exists for this entity type.');
    const onCloseAction = vi.fn();

    render(
      <I18nWrapper>
        <AddEditTagModal
          {...baseProps}
          onSubmitAction={onSubmitAction}
          onCloseAction={onCloseAction}
        />
      </I18nWrapper>,
    );

    const nameInput = page.getByRole('textbox', { name: /name/i });
    await userEvent.type(nameInput, 'Beginner');
    await page.getByRole('button', { name: /save/i }).click();

    expect(page.getByText(/already exists/i)).toBeInTheDocument();
    expect(onCloseAction).not.toHaveBeenCalled();
  });

  it('closes itself via onCloseAction on successful submit', async () => {
    const onSubmitAction = vi.fn(async () => undefined);
    const onCloseAction = vi.fn();

    render(
      <I18nWrapper>
        <AddEditTagModal
          {...baseProps}
          onSubmitAction={onSubmitAction}
          onCloseAction={onCloseAction}
        />
      </I18nWrapper>,
    );

    const nameInput = page.getByRole('textbox', { name: /name/i });
    await userEvent.type(nameInput, 'Beginner');
    await page.getByRole('button', { name: /save/i }).click();

    expect(onCloseAction).toHaveBeenCalled();
  });

  it('does not render when isOpen is false', () => {
    render(
      <I18nWrapper>
        <AddEditTagModal {...baseProps} isOpen={false} />
      </I18nWrapper>,
    );

    expect(page.getByRole('heading', { name: /add.*tag/i }).elements().length).toBe(0);
  });
});
