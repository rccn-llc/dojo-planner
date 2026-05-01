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
    it('should render the modal with title', () => {
      render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      expect(page.getByRole('heading', { name: 'Edit Contact Information' })).toBeInTheDocument();
    });

    it('should render email input with initial value', () => {
      render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const emailInput = page.getByPlaceholder('you@example.com');

      expect(emailInput).toBeInTheDocument();
    });

    it('should render phone input with initial value', () => {
      render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const phoneInput = page.getByPlaceholder('(555) 123-4567');

      expect(phoneInput).toBeInTheDocument();
    });

    it('should render address fields', () => {
      render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      expect(page.getByRole('heading', { name: 'Address' })).toBeInTheDocument();
      expect(page.getByPlaceholder('123 Main St')).toBeInTheDocument();
      expect(page.getByPlaceholder('#201')).toBeInTheDocument();
      expect(page.getByPlaceholder('San Francisco')).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      expect(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(page.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should show error for invalid email', async () => {
      render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const emailInput = page.getByPlaceholder('you@example.com');
      await emailInput.fill('invalid-email');
      // Tab to next field to trigger blur
      await userEvent.tab();

      expect(page.getByText('Please enter a valid email address')).toBeInTheDocument();
    });

    it('should show error for empty phone', async () => {
      render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const phoneInput = page.getByPlaceholder('(555) 123-4567');
      await phoneInput.fill('');
      // Tab to next field to trigger blur
      await userEvent.tab();

      expect(page.getByText('Please enter a phone number')).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('should call onClose when cancel button clicked', async () => {
      render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();

      expect(mockProps.onClose).toHaveBeenCalled();
    });

    it('should disable submit button when form is invalid', async () => {
      render(<I18nWrapper><EditContactInfoModal {...mockProps} /></I18nWrapper>);

      const emailInput = page.getByPlaceholder('you@example.com');
      await emailInput.fill('');

      const submitButton = page.getByRole('button', { name: 'Save Changes' });

      expect(submitButton.element()).toBeDisabled();
    });
  });

  describe('Empty state', () => {
    it('should render without initial address', () => {
      const propsWithoutAddress = {
        ...mockProps,
        initialAddress: undefined,
      };
      render(<I18nWrapper><EditContactInfoModal {...propsWithoutAddress} /></I18nWrapper>);

      expect(page.getByRole('heading', { name: 'Edit Contact Information' })).toBeInTheDocument();
    });
  });

  describe('Date of Birth', () => {
    it('renders the DOB input prefilled with the initial value (YYYY-MM-DD)', () => {
      const props = {
        ...mockProps,
        initialDateOfBirth: new Date(1990, 0, 15),
      };
      render(<I18nWrapper><EditContactInfoModal {...props} /></I18nWrapper>);

      const dobInput = document.querySelector('#edit-contact-dob') as HTMLInputElement;

      expect(dobInput).not.toBeNull();
      expect(dobInput.value).toBe('1990-01-15');
    });

    it('renders the DOB input empty when no initial value is provided', () => {
      const props = {
        ...mockProps,
        initialDateOfBirth: undefined,
      };
      render(<I18nWrapper><EditContactInfoModal {...props} /></I18nWrapper>);

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
      render(<I18nWrapper><EditContactInfoModal {...props} /></I18nWrapper>);

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
      render(<I18nWrapper><EditContactInfoModal {...props} /></I18nWrapper>);

      const submitButton = page.getByRole('button', { name: 'Save Changes' });
      await userEvent.click(submitButton);

      const payload = updateContactInfo.mock.calls[0]?.[0] as Record<string, unknown> | undefined;

      expect(payload).toBeDefined();
      expect(payload).not.toHaveProperty('dateOfBirth');
    });
  });

  describe('Modal visibility', () => {
    it('should not render when isOpen is false', () => {
      const closedProps = {
        ...mockProps,
        isOpen: false,
      };
      render(<I18nWrapper><EditContactInfoModal {...closedProps} /></I18nWrapper>);

      expect(page.getByRole('heading', { name: 'Edit Contact Information' })).not.toBeInTheDocument();
    });
  });
});
