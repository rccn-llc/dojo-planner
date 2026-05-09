import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the resend package — Resend is used as a constructor (`new Resend(...)`)
const mockSend = vi.fn();

class MockResend {
  emails = { send: mockSend };
}

vi.mock('resend', () => ({
  Resend: MockResend,
}));

// Mock the logger to suppress output during tests
vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('EmailService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  describe('isEmailEnabled', () => {
    it('returns false when RESEND_API_KEY is not set', async () => {
      const { isEmailEnabled } = await import('./EmailService');

      expect(isEmailEnabled()).toBe(false);
    });

    it('returns true when RESEND_API_KEY is set', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret

      const { isEmailEnabled } = await import('./EmailService');

      expect(isEmailEnabled()).toBe(true);
    });
  });

  describe('sendMemberConfirmationEmail', () => {
    const baseParams = {
      memberEmail: 'john@example.com',
      memberName: 'John Doe',
    };

    it('returns false when email is not configured', async () => {
      const { sendMemberConfirmationEmail } = await import('./EmailService');
      const { logger } = await import('@/libs/Logger');

      const result = await sendMemberConfirmationEmail(baseParams);

      expect(result).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('RESEND_API_KEY not configured'),
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends email with correct params', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'test-email-id' });

      const { sendMemberConfirmationEmail } = await import('./EmailService');

      const result = await sendMemberConfirmationEmail(baseParams);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@dojoplanner.com',
          to: 'john@example.com',
          subject: 'Welcome — Your Membership Confirmation',
          html: expect.any(String),
        }),
      );
      // No attachments key when no PDF provided
      expect(mockSend).toHaveBeenCalledWith(
        expect.not.objectContaining({ attachments: expect.anything() }),
      );
    });

    it('includes PDF attachment when waiverPdfBuffer is provided', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'test-email-id' });

      const { sendMemberConfirmationEmail } = await import('./EmailService');
      const pdfBuffer = Buffer.from('fake-pdf-content');

      const result = await sendMemberConfirmationEmail({
        ...baseParams,
        waiverPdfBuffer: pdfBuffer,
        waiverPdfFilename: 'waiver-john-doe.pdf',
      });

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: 'waiver-john-doe.pdf',
              content: pdfBuffer,
            },
          ],
        }),
      );
    });

    it('handles Resend API error gracefully and returns false', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockRejectedValue(new Error('Resend API rate limited'));

      const { sendMemberConfirmationEmail } = await import('./EmailService');
      const { logger } = await import('@/libs/Logger');

      const result = await sendMemberConfirmationEmail(baseParams);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send confirmation email'),
        expect.objectContaining({
          error: 'Resend API rate limited',
          to: 'john@example.com',
        }),
      );
    });

    it('builds correct HTML with member name', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'test-email-id' });

      const { sendMemberConfirmationEmail } = await import('./EmailService');

      await sendMemberConfirmationEmail({
        ...baseParams,
        memberName: 'Jane Smith',
      });

      const html = mockSend.mock.calls[0]![0].html as string;

      expect(html).toContain('Welcome, Jane Smith!');
      expect(html).toContain('You have been successfully added as a member.');
    });

    it('includes HOH notice for head-of-household memberType', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'test-email-id' });

      const { sendMemberConfirmationEmail } = await import('./EmailService');

      await sendMemberConfirmationEmail({
        ...baseParams,
        memberType: 'head-of-household',
      });

      const html = mockSend.mock.calls[0]![0].html as string;

      expect(html).toContain('Head of Household Notice:');
      expect(html).toContain('family members are added to your account');
    });

    it('includes family notice for family-member memberType with hohName', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'test-email-id' });

      const { sendMemberConfirmationEmail } = await import('./EmailService');

      await sendMemberConfirmationEmail({
        ...baseParams,
        memberType: 'family-member',
        hohName: 'Robert Doe',
      });

      const html = mockSend.mock.calls[0]![0].html as string;

      expect(html).toContain('Robert Doe');
      expect(html).toContain('Head of Household');
    });

    it('includes waiver notice when PDF is attached', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'test-email-id' });

      const { sendMemberConfirmationEmail } = await import('./EmailService');

      await sendMemberConfirmationEmail({
        ...baseParams,
        waiverPdfBuffer: Buffer.from('fake-pdf'),
        waiverPdfFilename: 'waiver.pdf',
      });

      const html = mockSend.mock.calls[0]![0].html as string;

      expect(html).toContain('signed waiver is attached to this email');
    });

    it('includes membership details when plan name is provided', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'test-email-id' });

      const { sendMemberConfirmationEmail } = await import('./EmailService');

      await sendMemberConfirmationEmail({
        ...baseParams,
        membershipPlanName: 'Adult BJJ Monthly',
        membershipPlanPrice: 149.99,
        membershipPlanFrequency: 'Monthly',
      });

      const html = mockSend.mock.calls[0]![0].html as string;

      expect(html).toContain('Membership Details');
      expect(html).toContain('Adult BJJ Monthly');
      expect(html).toContain('$149.99');
      expect(html).toContain('/monthly');
    });

    it('uses custom RESEND_FROM_EMAIL when configured', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      process.env.RESEND_FROM_EMAIL = 'custom@mydojo.com';
      mockSend.mockResolvedValue({ id: 'test-email-id' });

      const { sendMemberConfirmationEmail } = await import('./EmailService');

      await sendMemberConfirmationEmail(baseParams);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'custom@mydojo.com',
        }),
      );
    });
  });

  describe('sendPaymentReceiptEmail', () => {
    const baseReceipt = {
      toEmail: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      lineItems: [
        { name: 'Adult BJJ', description: 'Monthly membership', quantity: 1, unitPrice: 100, discount: 0 },
      ],
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 0,
      taxPct: 0,
      serviceFeeAmount: 3.75,
      serviceFeePct: 3.75,
      total: 103.75,
      transactionId: 'tx-001',
    };

    it('returns false when email is not configured', async () => {
      const { sendPaymentReceiptEmail } = await import('./EmailService');
      const result = await sendPaymentReceiptEmail(baseReceipt);

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends with itemized HTML when configured', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'email-id' });
      const { sendPaymentReceiptEmail } = await import('./EmailService');

      const result = await sendPaymentReceiptEmail(baseReceipt);

      expect(result).toBe(true);

      const sendArgs = mockSend.mock.calls[0]![0];

      expect(sendArgs.to).toBe('jane@example.com');
      expect(sendArgs.subject).toBe('Your payment receipt');
      expect(sendArgs.html).toContain('Adult BJJ');
      expect(sendArgs.html).toContain('Monthly membership');
      expect(sendArgs.html).toContain('Service fee (3.75%)');
      expect(sendArgs.html).toContain('$103.75');
      expect(sendArgs.html).toContain('Transaction ID: tx-001');
    });

    it('hides the tax row when taxAmount is 0 (memberships)', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'email-id' });
      const { sendPaymentReceiptEmail } = await import('./EmailService');

      await sendPaymentReceiptEmail({ ...baseReceipt, taxAmount: 0, taxPct: 0 });
      const html = mockSend.mock.calls[0]![0].html as string;

      expect(html).not.toContain('Tax (');
    });

    it('shows the tax row when taxAmount > 0 (events/store)', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'email-id' });
      const { sendPaymentReceiptEmail } = await import('./EmailService');

      await sendPaymentReceiptEmail({
        ...baseReceipt,
        taxAmount: 3.75,
        taxPct: 3.75,
        total: 107.5,
      });
      const html = mockSend.mock.calls[0]![0].html as string;

      expect(html).toContain('Tax (3.75%)');
      expect(html).toContain('$3.75');
    });

    it('shows the discount row when discountAmount > 0', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'email-id' });
      const { sendPaymentReceiptEmail } = await import('./EmailService');

      await sendPaymentReceiptEmail({ ...baseReceipt, discountAmount: 25 });
      const html = mockSend.mock.calls[0]![0].html as string;

      expect(html).toContain('Discount');
      expect(html).toContain('-$25.00');
    });

    it('adds the recurring billing note when isRecurring is true', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'email-id' });
      const { sendPaymentReceiptEmail } = await import('./EmailService');

      await sendPaymentReceiptEmail({ ...baseReceipt, isRecurring: true });
      const html = mockSend.mock.calls[0]![0].html as string;

      expect(html).toContain('Future billing cycles');
    });

    it('attaches a waiver PDF when provided', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockResolvedValue({ id: 'email-id' });
      const { sendPaymentReceiptEmail } = await import('./EmailService');

      const pdfBuffer = Buffer.from('fake-pdf-content');
      await sendPaymentReceiptEmail({
        ...baseReceipt,
        waiverPdfBuffer: pdfBuffer,
        waiverPdfFilename: 'waiver.pdf',
      });

      const sendArgs = mockSend.mock.calls[0]![0];

      expect(sendArgs.attachments).toEqual([
        { filename: 'waiver.pdf', content: pdfBuffer },
      ]);
    });

    it('returns false when Resend send throws', async () => {
      process.env.RESEND_API_KEY = 'test_resend_key_not_real'; // nosecret
      mockSend.mockRejectedValue(new Error('Resend down'));
      const { sendPaymentReceiptEmail } = await import('./EmailService');

      const result = await sendPaymentReceiptEmail(baseReceipt);

      expect(result).toBe(false);
    });
  });
});
