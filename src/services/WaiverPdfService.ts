import type { SignedWaiver } from './WaiversService';

// jsPDF is intentionally lowercase per the library's design

import { jsPDF as JsPDF } from 'jspdf';

/**
 * Input data for generating a waiver PDF
 */
export type WaiverPdfInput = {
  /** Organization/academy name */
  organizationName: string;
  /** Waiver template name */
  waiverName: string;
  /** Version of the waiver template */
  waiverVersion: number;
  /** Full rendered waiver content (with placeholders resolved) */
  renderedContent: string;
  /** Member's first name */
  memberFirstName: string;
  /** Member's last name */
  memberLastName: string;
  /** Member's email */
  memberEmail: string;
  /** Base64 signature data URL */
  signatureDataUrl: string;
  /** Name of the person who signed */
  signedByName: string;
  /** Relationship to member (null = self) */
  signedByRelationship?: string | null;
  /** Date when the waiver was signed */
  signedAt: Date;
  /** IP address at signing (optional) */
  ipAddress?: string | null;
  /** Membership plan name at time of signing */
  membershipPlanName?: string | null;
  /** Membership plan price */
  membershipPlanPrice?: number | null;
  /** Membership plan payment frequency */
  membershipPlanFrequency?: string | null;
  /** Membership plan contract length */
  membershipPlanContractLength?: string | null;
  /** Membership plan signup fee */
  membershipPlanSignupFee?: number | null;
  /** Whether the membership plan is a trial */
  membershipPlanIsTrial?: boolean | null;
  /** Coupon code applied at signing */
  couponCode?: string | null;
  /** Coupon discount type */
  couponType?: string | null;
  /** Coupon discount amount (display string, e.g., '15%', '$50') */
  couponAmount?: string | null;
  /** Final discounted price after coupon */
  couponDiscountedPrice?: number | null;
};

/**
 * Generate a PDF for a signed waiver on-demand.
 * The PDF is generated client-side using jsPDF - no server storage needed.
 *
 * @param input - The waiver data to include in the PDF
 * @returns A Blob containing the PDF data
 */
export function generateWaiverPdf(input: WaiverPdfInput): Blob {
  // Create new PDF document (A4 size)
  const doc = new JsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);
  let yPosition = margin;

  // Helper to add text with auto-wrap and page breaks
  const addText = (text: string, fontSize: number, isBold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');

    const lines = doc.splitTextToSize(text, contentWidth);

    for (const line of lines) {
      // Check if we need a new page
      if (yPosition > pageHeight - margin - 10) {
        doc.addPage();
        yPosition = margin;
      }

      doc.text(line, margin, yPosition);
      yPosition += fontSize * 0.4; // Line height based on font size
    }

    yPosition += 2; // Small gap after text block
  };

  // ========================================
  // HEADER SECTION
  // ========================================

  // Organization name (centered)
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(input.organizationName, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 10;

  // Waiver title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(input.waiverName, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 8;

  // Horizontal line
  doc.setDrawColor(200);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 8;

  // ========================================
  // MEMBER INFORMATION
  // ========================================

  addText('MEMBER INFORMATION', 12, true);
  yPosition += 2;

  const memberName = `${input.memberFirstName} ${input.memberLastName}`;
  addText(`Name: ${memberName}`, 10);
  addText(`Email: ${input.memberEmail}`, 10);

  yPosition += 5;

  // ========================================
  // MEMBERSHIP DETAILS (conditional)
  // ========================================

  if (input.membershipPlanName) {
    addText('MEMBERSHIP DETAILS', 12, true);
    yPosition += 2;

    addText(`Plan: ${input.membershipPlanName}`, 10);

    if (input.membershipPlanIsTrial) {
      addText('Type: Free Trial', 10);
    }

    if (input.membershipPlanPrice !== null && input.membershipPlanPrice !== undefined) {
      const hasCoupon = input.couponCode
        && input.couponDiscountedPrice !== null
        && input.couponDiscountedPrice !== undefined
        && input.membershipPlanPrice > 0;

      if (hasCoupon) {
        // Show original price with strikethrough and discounted price
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const labelText = 'Price: ';
        const labelWidth = doc.getTextWidth(labelText);

        // Check page break
        if (yPosition > pageHeight - margin - 10) {
          doc.addPage();
          yPosition = margin;
        }

        // Draw label
        doc.text(labelText, margin, yPosition);

        // Draw original price in gray with strikethrough
        const originalPriceStr = `$${input.membershipPlanPrice.toFixed(2)}`;
        doc.setTextColor(150);
        doc.text(originalPriceStr, margin + labelWidth, yPosition);
        const priceWidth = doc.getTextWidth(originalPriceStr);

        // Draw strikethrough line
        const lineY = yPosition - 1.2;
        doc.setDrawColor(150);
        doc.setLineWidth(0.3);
        doc.line(margin + labelWidth, lineY, margin + labelWidth + priceWidth, lineY);

        // Draw discounted price in black
        doc.setTextColor(0);
        const discountedPrice = input.couponDiscountedPrice!;
        const discountedPriceStr = discountedPrice === 0
          ? 'Free'
          : `$${discountedPrice.toFixed(2)}`;
        doc.text(`  ${discountedPriceStr}`, margin + labelWidth + priceWidth, yPosition);

        yPosition += 10 * 0.4 + 2;

        // Reset draw state
        doc.setDrawColor(200);
        doc.setLineWidth(0.2);

        // Show discount info
        const discountLabel = input.couponType === 'Free Trial'
          ? `Discount: ${input.couponCode} (${input.couponAmount})`
          : `Discount: ${input.couponCode} (${input.couponAmount} off)`;
        addText(discountLabel, 10);
      } else {
        const priceStr = input.membershipPlanPrice === 0
          ? 'Free'
          : `$${input.membershipPlanPrice.toFixed(2)}`;
        addText(`Price: ${priceStr}`, 10);
      }
    }

    if (input.membershipPlanFrequency && input.membershipPlanFrequency !== 'None') {
      addText(`Payment Schedule: ${input.membershipPlanFrequency}`, 10);
    }

    if (input.membershipPlanContractLength) {
      addText(`Contract Length: ${input.membershipPlanContractLength}`, 10);
    }

    if (input.membershipPlanSignupFee !== null && input.membershipPlanSignupFee !== undefined && input.membershipPlanSignupFee > 0) {
      addText(`Signup Fee: $${input.membershipPlanSignupFee.toFixed(2)}`, 10);
    }

    yPosition += 5;
  }

  // ========================================
  // WAIVER CONTENT
  // ========================================

  addText('WAIVER AND RELEASE OF LIABILITY', 12, true);
  yPosition += 3;

  // Split content into paragraphs and render
  // Remove HTML tags if present — loop until stable to prevent nested tag bypass
  let cleanContent = input.renderedContent
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n');
  let prev = '';
  while (prev !== cleanContent) {
    prev = cleanContent;
    cleanContent = cleanContent.replace(/<[^>]*>/g, '');
  }
  cleanContent = cleanContent
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

  const paragraphs = cleanContent.split(/\n{2,}/);

  for (const paragraph of paragraphs) {
    if (paragraph.trim()) {
      addText(paragraph.trim(), 10);
      yPosition += 3;
    }
  }

  yPosition += 5;

  // ========================================
  // SIGNATURE SECTION
  // ========================================

  // Ensure we have space for signature section
  if (yPosition > pageHeight - 80) {
    doc.addPage();
    yPosition = margin;
  }

  addText('SIGNATURE', 12, true);
  yPosition += 3;

  // Signed by info
  const signerInfo = input.signedByRelationship
    ? `Signed by: ${input.signedByName} (${input.signedByRelationship})`
    : `Signed by: ${input.signedByName}`;
  addText(signerInfo, 10);

  // Date signed
  const signedDate = input.signedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  addText(`Date: ${signedDate}`, 10);

  if (input.ipAddress) {
    addText(`IP Address: ${input.ipAddress}`, 9);
  }

  yPosition += 5;

  // Add signature image
  try {
    // The signatureDataUrl should be a base64 PNG
    if (input.signatureDataUrl.startsWith('data:image/')) {
      const signatureWidth = 80;
      const signatureHeight = 30;

      // Border around signature
      doc.setDrawColor(200);
      doc.rect(margin, yPosition, signatureWidth + 4, signatureHeight + 4);

      // Add signature image
      doc.addImage(
        input.signatureDataUrl,
        'PNG',
        margin + 2,
        yPosition + 2,
        signatureWidth,
        signatureHeight,
      );

      yPosition += signatureHeight + 10;
    }
  } catch (error) {
    // If signature image fails, add placeholder text
    console.error('Failed to add signature image to PDF:', error);
    addText('[Signature on file]', 10);
    yPosition += 10;
  }

  // ========================================
  // FOOTER
  // ========================================

  // Add footer with version and generation info
  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text(`Waiver version: v${input.waiverVersion}`, pageWidth / 2, pageHeight - 14, { align: 'center' });
  doc.text(`Document generated on ${new Date().toLocaleString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

  // Return as Blob
  return doc.output('blob');
}

/**
 * Generate a PDF filename for a signed waiver
 */
export function generatePdfFilename(signedWaiver: Pick<SignedWaiver, 'memberFirstName' | 'memberLastName' | 'signedAt'>): string {
  const date = signedWaiver.signedAt.toISOString().split('T')[0];
  const name = `${signedWaiver.memberLastName}_${signedWaiver.memberFirstName}`.replace(/\s+/g, '_');
  return `waiver_${name}_${date}.pdf`;
}

/**
 * Trigger a download of the generated PDF
 */
export function downloadWaiverPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate and immediately download a waiver PDF
 */
export function generateAndDownloadWaiverPdf(input: WaiverPdfInput, filename?: string): void {
  const blob = generateWaiverPdf(input);
  const defaultFilename = `waiver_${input.memberLastName}_${input.memberFirstName}_${input.signedAt.toISOString().split('T')[0]}.pdf`;
  downloadWaiverPdf(blob, filename ?? defaultFilename);
}
