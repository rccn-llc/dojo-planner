import type { Buffer } from 'node:buffer';
import { Resend } from 'resend';
import { logger } from '@/libs/Logger';

// Initialize Resend client only if API key is configured
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@dojoplanner.com';

/**
 * Check if email sending is enabled (Resend API key configured).
 */
export function isEmailEnabled(): boolean {
  return resend !== null;
}

export type MemberConfirmationEmailParams = {
  memberEmail: string;
  memberName: string;
  membershipPlanName?: string;
  membershipPlanPrice?: number;
  membershipPlanFrequency?: string;
  memberType?: 'individual' | 'family-member' | 'head-of-household';
  hohName?: string;
  /** Waiver PDF as a Buffer for email attachment */
  waiverPdfBuffer?: Buffer;
  /** Filename for the waiver PDF attachment */
  waiverPdfFilename?: string;
};

/**
 * Send a confirmation email to a newly added member.
 * Includes membership details and optional waiver PDF attachment.
 * Fails silently if email is not configured — logs error but does not throw.
 */
export async function sendMemberConfirmationEmail(params: MemberConfirmationEmailParams): Promise<boolean> {
  if (!resend) {
    logger.info('[Email] Email sending skipped — RESEND_API_KEY not configured');
    return false;
  }

  try {
    const html = buildConfirmationEmailHtml(params);
    const attachments: Array<{ filename: string; content: Buffer }> = [];

    if (params.waiverPdfBuffer && params.waiverPdfFilename) {
      attachments.push({
        filename: params.waiverPdfFilename,
        content: params.waiverPdfBuffer,
      });
    }

    await resend.emails.send({
      from: fromEmail,
      to: params.memberEmail,
      subject: 'Welcome — Your Membership Confirmation',
      html,
      ...(attachments.length > 0 && { attachments }),
    });

    logger.info('[Email] Confirmation email sent', { to: params.memberEmail });
    return true;
  } catch (error) {
    logger.error('[Email] Failed to send confirmation email', {
      error: error instanceof Error ? error.message : 'Unknown error',
      to: params.memberEmail,
    });
    return false;
  }
}

// ===== Itemized payment receipt =====

export type PaymentReceiptLineItem = {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
};

export type PaymentReceiptEmailParams = {
  toEmail: string;
  firstName: string;
  lastName: string;
  lineItems: PaymentReceiptLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxPct: number;
  serviceFeeAmount: number;
  serviceFeePct: number;
  total: number;
  transactionId?: string;
  /** When true, adds a "future billing cycles" note (recurring memberships). */
  isRecurring?: boolean;
  /** Optional waiver PDF — included on membership-signup receipts. */
  waiverPdfBuffer?: Buffer;
  waiverPdfFilename?: string;
};

/**
 * Send an itemized receipt email after a successful payment. Mirrors the
 * kiosk's `sendStoreOrderReceipt` and `sendMembershipConfirmation` HTML —
 * fee-breakdown block (Base / Tax / Service fee / Total) plus per-line-item
 * detail. Tax row is hidden when taxAmount is 0 (memberships).
 *
 * Should be called ONLY on approved transactions. Fails silently if Resend
 * is not configured.
 */
export async function sendPaymentReceiptEmail(params: PaymentReceiptEmailParams): Promise<boolean> {
  if (!resend) {
    logger.info('[Email] Receipt skipped — RESEND_API_KEY not configured');
    return false;
  }

  try {
    const html = buildReceiptHtml(params);
    const attachments: Array<{ filename: string; content: Buffer }> = [];
    if (params.waiverPdfBuffer && params.waiverPdfFilename) {
      attachments.push({
        filename: params.waiverPdfFilename,
        content: params.waiverPdfBuffer,
      });
    }

    await resend.emails.send({
      from: fromEmail,
      to: params.toEmail,
      subject: 'Your payment receipt',
      html,
      ...(attachments.length > 0 && { attachments }),
    });

    logger.info('[Email] Payment receipt sent', {
      to: params.toEmail,
      transactionId: params.transactionId,
    });
    return true;
  } catch (error) {
    logger.error('[Email] Failed to send payment receipt', {
      error: error instanceof Error ? error.message : 'Unknown error',
      to: params.toEmail,
    });
    return false;
  }
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function feeRow(label: string, amount: number): string {
  if (!amount || amount <= 0) {
    return '';
  }
  return `<tr>
    <td colspan="2" style="padding: 4px 0; color: #6b7280; font-size: 14px;">${label}</td>
    <td style="padding: 4px 0; color: #6b7280; font-size: 14px; text-align: right;">${formatCurrency(amount)}</td>
  </tr>`;
}

function buildReceiptHtml(params: PaymentReceiptEmailParams): string {
  const itemRows = params.lineItems.map((item) => {
    const lineTotal = (item.unitPrice * item.quantity) - (item.discount ?? 0);
    const label = item.description && item.description !== item.name
      ? `${item.name} — ${item.description}`
      : item.name;
    return `
    <tr>
      <td style="padding: 8px 0; color: #374151; border-bottom: 1px solid #f3f4f6;">
        ${label}
      </td>
      <td style="padding: 8px 0; color: #374151; border-bottom: 1px solid #f3f4f6; text-align: center;">
        ${item.quantity}
      </td>
      <td style="padding: 8px 0; color: #374151; border-bottom: 1px solid #f3f4f6; text-align: right;">
        ${formatCurrency(lineTotal)}
      </td>
    </tr>`;
  }).join('');

  const discountRow = params.discountAmount > 0
    ? `<tr>
        <td colspan="2" style="padding: 4px 0; color: #16a34a;">Discount</td>
        <td style="padding: 4px 0; color: #16a34a; text-align: right;">-${formatCurrency(params.discountAmount)}</td>
      </tr>`
    : '';

  const transactionNote = params.transactionId
    ? `<p style="margin: 0 0 4px; color: #9ca3af; font-size: 12px;">Transaction ID: ${params.transactionId}</p>`
    : '';

  const recurringNote = params.isRecurring
    ? `<p style="margin: 12px 0 0; color: #9ca3af; font-size: 12px;">Future billing cycles will include applicable fees and tax at that time's rate.</p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 32px;">

        <h1 style="margin: 0 0 4px; font-size: 24px; color: #111827;">Payment Confirmed</h1>
        <p style="margin: 0 0 32px; color: #6b7280; font-size: 16px;">
          Thanks, ${params.firstName}! Here's your receipt.
        </p>

        <!-- Item table -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
          <thead>
            <tr>
              <th style="padding: 0 0 8px; text-align: left; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Item</th>
              <th style="padding: 0 0 8px; text-align: center; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Qty</th>
              <th style="padding: 0 0 8px; text-align: right; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <!-- Totals -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
          <tr>
            <td colspan="2" style="padding: 4px 0; color: #374151;">Subtotal</td>
            <td style="padding: 4px 0; color: #374151; text-align: right;">${formatCurrency(params.subtotal)}</td>
          </tr>
          ${discountRow}
          ${feeRow(`Tax (${params.taxPct}%)`, params.taxAmount)}
          ${feeRow(`Service fee (${params.serviceFeePct}%)`, params.serviceFeeAmount)}
          <tr>
            <td colspan="2" style="padding: 12px 0 0; color: #111827; font-size: 18px; font-weight: 700; border-top: 2px solid #111827;">Total</td>
            <td style="padding: 12px 0 0; color: #111827; font-size: 18px; font-weight: 700; text-align: right; border-top: 2px solid #111827;">${formatCurrency(params.total)}</td>
          </tr>
        </table>

        ${recurringNote}

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 24px 0 0; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
              ${transactionNote}
              <p style="margin: 0;">This is an automated receipt. Please do not reply to this email.</p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildConfirmationEmailHtml(params: MemberConfirmationEmailParams): string {
  const membershipSection = params.membershipPlanName
    ? `
      <tr>
        <td style="padding: 20px 0; border-top: 1px solid #e5e7eb;">
          <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Membership Details</h2>
          <p style="margin: 0 0 4px; color: #374151;"><strong>Plan:</strong> ${params.membershipPlanName}</p>
          ${params.membershipPlanPrice !== undefined ? `<p style="margin: 0 0 4px; color: #374151;"><strong>Price:</strong> $${params.membershipPlanPrice.toFixed(2)}${params.membershipPlanFrequency && params.membershipPlanFrequency !== 'None' ? `/${params.membershipPlanFrequency.toLowerCase()}` : ''}</p>` : ''}
        </td>
      </tr>`
    : '';

  const hohNotice = params.memberType === 'head-of-household'
    ? `
      <tr>
        <td style="padding: 16px; background-color: #eff6ff; border-radius: 8px; margin-top: 16px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px;">
            <strong>Head of Household Notice:</strong> If family members are added to your account in the future, their membership fees will be charged to your payment method on the date they join, with recurring billing based on their join date.
          </p>
        </td>
      </tr>`
    : '';

  const familyNotice = params.memberType === 'family-member' && params.hohName
    ? `
      <tr>
        <td style="padding: 16px; background-color: #eff6ff; border-radius: 8px; margin-top: 16px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px;">
            Your membership billing is managed by <strong>${params.hohName}</strong> (Head of Household).
          </p>
        </td>
      </tr>`
    : '';

  const waiverNotice = params.waiverPdfBuffer
    ? `
      <tr>
        <td style="padding: 16px; background-color: #f0fdf4; border-radius: 8px; margin-top: 16px;">
          <p style="margin: 0; color: #166534; font-size: 14px;">
            A copy of your signed waiver is attached to this email for your records.
          </p>
        </td>
      </tr>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 32px;">
        <h1 style="margin: 0 0 8px; font-size: 24px; color: #111827;">Welcome, ${params.memberName}!</h1>
        <p style="margin: 0 0 24px; color: #6b7280; font-size: 16px;">You have been successfully added as a member.</p>
        ${membershipSection}
        ${hohNotice}
        ${familyNotice}
        ${waiverNotice}
        <tr>
          <td style="padding: 24px 0 0; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
            <p style="margin: 0;">This is an automated confirmation email. Please do not reply.</p>
          </td>
        </tr>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
