import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EmailSupportModal } from './EmailSupportModal';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Email Support',
      description: 'Send us a message and we\'ll get back to you as soon as possible.',
      subject_label: 'Subject',
      subject_placeholder: 'What do you need help with?',
      subject_error: 'Please enter a subject.',
      message_label: 'Message',
      message_placeholder: 'Describe your issue or question in detail...',
      message_error: 'Please enter a message.',
      cancel_button: 'Cancel',
      send_button: 'Send Message',
      sending_button: 'Sending...',
    };
    return translations[key] || key;
  },
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
};

describe('EmailSupportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the modal title', async () => {
      await render(<EmailSupportModal {...defaultProps} />);

      expect(page.getByText('Email Support')).toBeInTheDocument();
    });

    it('should render the modal description', async () => {
      await render(<EmailSupportModal {...defaultProps} />);

      expect(page.getByText(/Send us a message/)).toBeInTheDocument();
    });

    it('should render subject and message form fields', async () => {
      await render(<EmailSupportModal {...defaultProps} />);

      expect(page.getByPlaceholder('What do you need help with?')).toBeInTheDocument();
      expect(page.getByPlaceholder('Describe your issue or question in detail...')).toBeInTheDocument();
    });

    it('should render cancel and send buttons', async () => {
      await render(<EmailSupportModal {...defaultProps} />);

      expect(page.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(page.getByRole('button', { name: /send message/i })).toBeInTheDocument();
    });

    it('should not render when isOpen is false', async () => {
      await render(<EmailSupportModal {...defaultProps} isOpen={false} />);

      expect(page.getByText('Email Support').elements()).toHaveLength(0);
    });
  });

  describe('Form Interaction', () => {
    it('should update subject field when typing', async () => {
      await render(<EmailSupportModal {...defaultProps} />);

      const subjectInput = page.getByPlaceholder('What do you need help with?');
      await userEvent.type(subjectInput.element(), 'Test Subject');

      expect(subjectInput.element()).toHaveProperty('value', 'Test Subject');
    });

    it('should update message field when typing', async () => {
      await render(<EmailSupportModal {...defaultProps} />);

      const messageInput = page.getByPlaceholder('Describe your issue or question in detail...');
      await userEvent.type(messageInput.element(), 'Test Message');

      expect(messageInput.element()).toHaveProperty('value', 'Test Message');
    });

    it('should call onClose when cancel button is clicked', async () => {
      const onClose = vi.fn();
      await render(<EmailSupportModal {...defaultProps} onClose={onClose} />);

      const cancelButton = page.getByRole('button', { name: /cancel/i });
      await userEvent.click(cancelButton.element());

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Validation', () => {
    it('should show error when submitting with empty subject', async () => {
      await render(<EmailSupportModal {...defaultProps} />);

      // Fill only message
      const messageInput = page.getByPlaceholder('Describe your issue or question in detail...');
      await userEvent.type(messageInput.element(), 'Test Message');

      const sendButton = page.getByRole('button', { name: /send message/i });
      await userEvent.click(sendButton.element());

      expect(page.getByText('Please enter a subject.')).toBeInTheDocument();
    });

    it('should show error when submitting with empty message', async () => {
      await render(<EmailSupportModal {...defaultProps} />);

      // Fill only subject
      const subjectInput = page.getByPlaceholder('What do you need help with?');
      await userEvent.type(subjectInput.element(), 'Test Subject');

      const sendButton = page.getByRole('button', { name: /send message/i });
      await userEvent.click(sendButton.element());

      expect(page.getByText('Please enter a message.')).toBeInTheDocument();
    });
  });

  describe('Submission', () => {
    it('should show sending state when form is submitted', async () => {
      await render(<EmailSupportModal {...defaultProps} />);

      // Fill form
      const subjectInput = page.getByPlaceholder('What do you need help with?');
      const messageInput = page.getByPlaceholder('Describe your issue or question in detail...');
      await userEvent.type(subjectInput.element(), 'Test Subject');
      await userEvent.type(messageInput.element(), 'Test Message');

      const sendButton = page.getByRole('button', { name: /send message/i });
      await userEvent.click(sendButton.element());

      expect(page.getByText('Sending...')).toBeInTheDocument();
    });

    it('should close modal and reset form after successful submission', async () => {
      const onClose = vi.fn();
      await render(<EmailSupportModal {...defaultProps} onClose={onClose} />);

      // Fill form
      const subjectInput = page.getByPlaceholder('What do you need help with?');
      const messageInput = page.getByPlaceholder('Describe your issue or question in detail...');
      await userEvent.type(subjectInput.element(), 'Test Subject');
      await userEvent.type(messageInput.element(), 'Test Message');

      const sendButton = page.getByRole('button', { name: /send message/i });
      await userEvent.click(sendButton.element());

      // Wait for async submission
      await vi.waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    it('should reset form when modal is closed via cancel', async () => {
      const onClose = vi.fn();
      await render(<EmailSupportModal {...defaultProps} onClose={onClose} />);

      // Fill form
      const subjectInput = page.getByPlaceholder('What do you need help with?');
      await userEvent.type(subjectInput.element(), 'Test Subject');

      // Cancel
      const cancelButton = page.getByRole('button', { name: /cancel/i });
      await userEvent.click(cancelButton.element());

      expect(onClose).toHaveBeenCalled();
    });
  });
});
