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
