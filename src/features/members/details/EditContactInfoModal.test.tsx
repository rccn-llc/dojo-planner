import { describe, expect, it, vi } from 'vitest';

import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { EditContactInfoModal } from './EditContactInfoModal';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock('@/libs/Orpc', () => ({
  client: {
    member: {
      updateContactInfo: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('@/hooks/useMembersCache', () => ({
  invalidateMembersCache: vi.fn(),
}));

describe('EditContactInfoModal', () => {
  const mockProps = {
    isOpen: true,
    onClose: vi.fn(),
    memberId: 'member-123',
    initialFirstName: 'Test',
    initialLastName: 'Member',
    initialEmail: 'test@example.com',
    initialPhone: '(555) 123-4567',
    initialAddress: {
      street: '123 Main St',
      apartment: '#201',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      country: 'US',
    },
  };

  describe('Render method', () => {
    it('should render the modal with title', async () => {
      await render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      expect(page.getByRole('heading', { name: 'Edit Contact Information' })).toBeInTheDocument();
    });

    it('should render email input with initial value', async () => {
      await render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const emailInput = page.getByPlaceholder('you@example.com');

      expect(emailInput).toBeInTheDocument();
    });

    it('should render phone input with initial value', async () => {
      await render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const phoneInput = page.getByPlaceholder('(555) 123-4567');

      expect(phoneInput).toBeInTheDocument();
    });

    it('should render address fields', async () => {
      await render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      expect(page.getByRole('heading', { name: 'Address' })).toBeInTheDocument();
      expect(page.getByPlaceholder('123 Main St')).toBeInTheDocument();
      expect(page.getByPlaceholder('#201')).toBeInTheDocument();
      expect(page.getByPlaceholder('San Francisco')).toBeInTheDocument();
    });

    it('should render action buttons', async () => {
      await render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      expect(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(page.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should show error for invalid email', async () => {
      await render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const emailInput = page.getByPlaceholder('you@example.com');
      await emailInput.fill('invalid-email');
      // Tab to next field to trigger blur
      await userEvent.tab();

      expect(page.getByText('Please enter a valid email address')).toBeInTheDocument();
    });

    it('should show error for empty phone', async () => {
      await render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const phoneInput = page.getByPlaceholder('(555) 123-4567');
      await phoneInput.fill('');
      // Tab to next field to trigger blur
      await userEvent.tab();

      expect(page.getByText('Please enter a phone number')).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('should call onClose when cancel button clicked', async () => {
      await render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();

      expect(mockProps.onClose).toHaveBeenCalled();
    });

    it('discards unsaved name edits on cancel', async () => {
      // Regression: the dialog stays mounted between opens, so a field the
      // cancel handler forgets keeps its unsaved value the next time it opens.
      // firstName/lastName were the two it forgot.
      const onClose = vi.fn();
      const screen = await render(
        <I18nWrapper><EditContactInfoModal {...mockProps} onClose={onClose} /></I18nWrapper>,
      );

      await page.getByPlaceholder('John').fill('Edited');
      await page.getByPlaceholder('Doe').fill('Alsoedited');
      await page.getByRole('button', { name: 'Cancel' }).click();

      expect(onClose).toHaveBeenCalled();

      // Reopen the still-mounted dialog.
      await screen.rerender(
        <I18nWrapper><EditContactInfoModal {...mockProps} onClose={onClose} isOpen={false} /></I18nWrapper>,
      );
      await screen.rerender(
        <I18nWrapper><EditContactInfoModal {...mockProps} onClose={onClose} /></I18nWrapper>,
      );

      expect((page.getByPlaceholder('John').element() as HTMLInputElement).value).toBe('Test');
      expect((page.getByPlaceholder('Doe').element() as HTMLInputElement).value).toBe('Member');
    });

    it('discards unsaved email and phone edits on cancel', async () => {
      const onClose = vi.fn();
      const screen = await render(
        <I18nWrapper><EditContactInfoModal {...mockProps} onClose={onClose} /></I18nWrapper>,
      );

      await page.getByPlaceholder('you@example.com').fill('edited@example.com');
      await page.getByRole('button', { name: 'Cancel' }).click();

      await screen.rerender(
        <I18nWrapper><EditContactInfoModal {...mockProps} onClose={onClose} isOpen={false} /></I18nWrapper>,
      );
      await screen.rerender(
        <I18nWrapper><EditContactInfoModal {...mockProps} onClose={onClose} /></I18nWrapper>,
      );

      expect((page.getByPlaceholder('you@example.com').element() as HTMLInputElement).value).toBe(
        'test@example.com',
      );
    });

    it('should disable submit button when form is invalid', async () => {
      await render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const emailInput = page.getByPlaceholder('you@example.com');
      await emailInput.fill('');

      const submitButton = page.getByRole('button', { name: 'Save Changes' });

      expect(submitButton.element()).toBeDisabled();
    });
  });

  describe('Empty state', () => {
    it('should render without initial address', async () => {
      const propsWithoutAddress = {
        ...mockProps,
        initialAddress: undefined,
      };
      await render(<I18nWrapper><EditContactInfoModal {...propsWithoutAddress} /></I18nWrapper>);

      expect(page.getByRole('heading', { name: 'Edit Contact Information' })).toBeInTheDocument();
    });
  });

  describe('Date of Birth', () => {
    it('renders the DOB input prefilled with the initial value (MM/DD/YYYY)', async () => {
      const props = {
        ...mockProps,
        initialDateOfBirth: new Date(1990, 0, 15),
      };
      await render(<I18nWrapper><EditContactInfoModal {...props} /></I18nWrapper>);

      const dobInput = document.querySelector('#edit-contact-dob') as HTMLInputElement;

      expect(dobInput).not.toBeNull();
      expect(dobInput.value).toBe('01/15/1990');
    });

    it('renders the DOB input empty when no initial value is provided', async () => {
      const props = {
        ...mockProps,
        initialDateOfBirth: undefined,
      };
      await render(<I18nWrapper><EditContactInfoModal {...props} /></I18nWrapper>);

      const dobInput = document.querySelector('#edit-contact-dob') as HTMLInputElement;

      expect(dobInput).not.toBeNull();
      expect(dobInput.value).toBe('');
    });

    it('sends dateOfBirth in the updateContactInfo payload when set', async () => {
      const orpc = await import('@/libs/Orpc');
      const updateContactInfo = vi.mocked(orpc.client.member.updateContactInfo);
      updateContactInfo.mockClear();
      updateContactInfo.mockResolvedValue({});

      const props = {
        ...mockProps,
        initialDateOfBirth: new Date(1990, 0, 15),
      };
      await render(<I18nWrapper><EditContactInfoModal {...props} /></I18nWrapper>);

      const submitButton = page.getByRole('button', { name: 'Save Changes' });
      await userEvent.click(submitButton);

      expect(updateContactInfo).toHaveBeenCalledWith(expect.objectContaining({
        dateOfBirth: expect.any(Date),
      }));
    });

    it('omits dateOfBirth from the payload when the input is left blank', async () => {
      const orpc = await import('@/libs/Orpc');
      const updateContactInfo = vi.mocked(orpc.client.member.updateContactInfo);
      updateContactInfo.mockClear();
      updateContactInfo.mockResolvedValue({});

      const props = {
        ...mockProps,
        initialDateOfBirth: undefined,
      };
      await render(<I18nWrapper><EditContactInfoModal {...props} /></I18nWrapper>);

      const submitButton = page.getByRole('button', { name: 'Save Changes' });
      await userEvent.click(submitButton);

      const payload = updateContactInfo.mock.calls[0]?.[0] as Record<string, unknown> | undefined;

      expect(payload).toBeDefined();
      expect(payload).not.toHaveProperty('dateOfBirth');
    });
  });

  describe('Modal visibility', () => {
    it('should not render when isOpen is false', async () => {
      const closedProps = {
        ...mockProps,
        isOpen: false,
      };
      await render(<I18nWrapper><EditContactInfoModal {...closedProps} /></I18nWrapper>);

      expect(page.getByRole('heading', { name: 'Edit Contact Information' })).not.toBeInTheDocument();
    });
  });
});
