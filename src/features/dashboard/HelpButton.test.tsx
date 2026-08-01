import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { HelpButton } from './HelpButton';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      HelpButton: {
        button_aria_label: 'Get help',
        popover_title: 'Need help?',
        email_option: 'Email support',
        phone_option: 'Call support',
      },
      EmailSupportModal: {
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
      },
      PhoneSupportModal: {
        title: 'Call Support',
        description: 'Speak with a support representative.',
        phone_label: 'Support Phone Number',
        availability_message: 'Available Monday - Friday, 9am - 5pm EST',
        call_button: 'Call Now',
        close_button: 'Close',
      },
    };
    return translations[namespace]?.[key] || key;
  },
}));

describe('HelpButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the help button with correct aria label', async () => {
      await render(<HelpButton />);

      const button = page.getByRole('button', { name: 'Get help' });

      expect(button).toBeInTheDocument();
    });

    it('should not show popover content initially', async () => {
      await render(<HelpButton />);

      expect(page.getByText('Need help?').elements()).toHaveLength(0);
    });
  });

  describe('Popover Interaction', () => {
    it('should open popover when help button is clicked', async () => {
      await render(<HelpButton />);

      const button = page.getByRole('button', { name: 'Get help' });
      await userEvent.click(button.element());

      expect(page.getByText('Need help?')).toBeInTheDocument();
    });

    it('should show email and phone options in popover', async () => {
      await render(<HelpButton />);

      const button = page.getByRole('button', { name: 'Get help' });
      await userEvent.click(button.element());

      expect(page.getByText('Email support')).toBeInTheDocument();
      expect(page.getByText('Call support')).toBeInTheDocument();
    });

    it('should close popover and open email modal when email option is clicked', async () => {
      await render(<HelpButton />);

      const button = page.getByRole('button', { name: 'Get help' });
      await userEvent.click(button.element());

      const emailOption = page.getByText('Email support');
      await userEvent.click(emailOption.element());

      // Popover should be closed
      expect(page.getByText('Need help?').elements()).toHaveLength(0);
      // Email modal should be open
      expect(page.getByText('Email Support')).toBeInTheDocument();
    });

    it('should close popover and open phone modal when phone option is clicked', async () => {
      await render(<HelpButton />);

      const button = page.getByRole('button', { name: 'Get help' });
      await userEvent.click(button.element());

      const phoneOption = page.getByText('Call support');
      await userEvent.click(phoneOption.element());

      // Popover should be closed
      expect(page.getByText('Need help?').elements()).toHaveLength(0);
      // Phone modal should be open
      expect(page.getByText('Call Support')).toBeInTheDocument();
    });
  });

  describe('Modal Integration', () => {
    it('should close email modal when close button is clicked', async () => {
      await render(<HelpButton />);

      // Open popover and click email option
      const button = page.getByRole('button', { name: 'Get help' });
      await userEvent.click(button.element());
      await userEvent.click(page.getByText('Email support').element());

      // Click cancel button in modal
      const cancelButton = page.getByRole('button', { name: /cancel/i });
      await userEvent.click(cancelButton.element());

      // Modal should be closed
      expect(page.getByText('Email Support').elements()).toHaveLength(0);
    });

    it('should close phone modal when close button is clicked', async () => {
      await render(<HelpButton />);

      // Open popover and click phone option
      const button = page.getByRole('button', { name: 'Get help' });
      await userEvent.click(button.element());
      await userEvent.click(page.getByText('Call support').element());

      // Click close button in modal - use first() to get the text-based Close button
      const closeButton = page.getByRole('button', { name: 'Close', exact: true }).first();
      await userEvent.click(closeButton.element());

      // Modal should be closed
      expect(page.getByText('Call Support').elements()).toHaveLength(0);
    });
  });
});
