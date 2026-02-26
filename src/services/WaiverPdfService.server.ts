import type { WaiverPdfInput } from './WaiverPdfService';

import { Buffer } from 'node:buffer';

import { jsPDF as JsPDF } from 'jspdf';

/**
 * Generate a PDF for a signed waiver as a Node.js Buffer (server-side).
 * Same logic as generateWaiverPdf but returns a Buffer instead of a Blob
 * for use in email attachments and other server-side contexts.
 *
 * @param input - The waiver data to include in the PDF
 * @returns A Buffer containing the PDF data
 */
export function generateWaiverPdfBuffer(input: WaiverPdfInput): Buffer {
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

  const addText = (text: string, fontSize: number, isBold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      if (yPosition > pageHeight - margin - 10) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin, yPosition);
      yPosition += fontSize * 0.4;
    }
    yPosition += 2;
  };

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(input.organizationName, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 10;
  doc.setFontSize(14);
  doc.text(input.waiverName, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 8;
  doc.setDrawColor(200);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 8;

  // Member info
  addText('MEMBER INFORMATION', 12, true);
  yPosition += 2;
  addText(`Name: ${input.memberFirstName} ${input.memberLastName}`, 10);
  addText(`Email: ${input.memberEmail}`, 10);
  yPosition += 5;

  // Membership details
  if (input.membershipPlanName) {
    addText('MEMBERSHIP DETAILS', 12, true);
    yPosition += 2;
    addText(`Plan: ${input.membershipPlanName}`, 10);
    if (input.membershipPlanIsTrial) {
      addText('Type: Free Trial', 10);
    }
    if (input.membershipPlanPrice !== null && input.membershipPlanPrice !== undefined) {
      const priceStr = input.membershipPlanPrice === 0 ? 'Free' : `$${input.membershipPlanPrice.toFixed(2)}`;
      addText(`Price: ${priceStr}`, 10);
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

  // Waiver content
  addText('WAIVER AND RELEASE OF LIABILITY', 12, true);
  yPosition += 3;
  // Remove HTML tags — loop until stable to prevent nested tag bypass
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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  for (const paragraph of cleanContent.split(/\n{2,}/)) {
    if (paragraph.trim()) {
      addText(paragraph.trim(), 10);
      yPosition += 3;
    }
  }
  yPosition += 5;

  // Signature
  if (yPosition > pageHeight - 80) {
    doc.addPage();
    yPosition = margin;
  }
  addText('SIGNATURE', 12, true);
  yPosition += 3;
  const signerInfo = input.signedByRelationship
    ? `Signed by: ${input.signedByName} (${input.signedByRelationship})`
    : `Signed by: ${input.signedByName}`;
  addText(signerInfo, 10);
  const signedDate = input.signedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  addText(`Date: ${signedDate}`, 10);
  yPosition += 5;

  try {
    if (input.signatureDataUrl.startsWith('data:image/')) {
      const signatureWidth = 80;
      const signatureHeight = 30;
      doc.setDrawColor(200);
      doc.rect(margin, yPosition, signatureWidth + 4, signatureHeight + 4);
      doc.addImage(input.signatureDataUrl, 'PNG', margin + 2, yPosition + 2, signatureWidth, signatureHeight);
      yPosition += signatureHeight + 10;
    }
  } catch {
    addText('[Signature on file]', 10);
    yPosition += 10;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text(`Waiver version: v${input.waiverVersion}`, pageWidth / 2, pageHeight - 14, { align: 'center' });
  doc.text(`Document generated on ${new Date().toLocaleString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

  // Return as Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
