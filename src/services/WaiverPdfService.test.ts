import type { WaiverPdfInput } from './WaiverPdfService';
import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock jsPDF instance methods
const mockText = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetFont = vi.fn();
const mockSetDrawColor = vi.fn();
const mockSetTextColor = vi.fn();
const mockLine = vi.fn();
const mockRect = vi.fn();
const mockAddImage = vi.fn();
const mockAddPage = vi.fn();
const mockSetLineWidth = vi.fn();
const mockGetTextWidth = vi.fn(() => 20);
const mockSplitTextToSize = vi.fn((text: string) => [text]);
const mockOutput = vi.fn(() => new Blob(['mock-pdf-data'], { type: 'application/pdf' }));

// Use a class mock so `new JsPDF(...)` works correctly
vi.mock('jspdf', () => {
  class MockJsPDF {
    internal = {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    };

    text = mockText;
    setFontSize = mockSetFontSize;
    setFont = mockSetFont;
    setDrawColor = mockSetDrawColor;
    setTextColor = mockSetTextColor;
    line = mockLine;
    rect = mockRect;
    addImage = mockAddImage;
    addPage = mockAddPage;
    setLineWidth = mockSetLineWidth;
    getTextWidth = mockGetTextWidth;
    splitTextToSize = mockSplitTextToSize;
    output = mockOutput;
  }

  return { jsPDF: MockJsPDF };
});

describe('WaiverPdfService', () => {
  const mockInput: WaiverPdfInput = {
    organizationName: 'Iron Fist Dojo',
    waiverName: 'Standard Adult Waiver',
    waiverVersion: 1,
    renderedContent: 'I hereby acknowledge the risks of martial arts training and voluntarily participate.',
    memberFirstName: 'John',
    memberLastName: 'Doe',
    memberEmail: 'john.doe@example.com',
    signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
    signedByName: 'John Doe',
    signedAt: new Date('2024-06-15T10:30:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSplitTextToSize.mockImplementation((text: string) => [text]);
  });

  // ===========================================================================
  // generateWaiverPdf
  // ===========================================================================

  describe('generateWaiverPdf', () => {
    it('should create a PDF document and return a Blob', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      const result = generateWaiverPdf(mockInput);

      expect(result).toBeInstanceOf(Blob);
    });

    it('should set organization name in the header', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockText).toHaveBeenCalledWith(
        'Iron Fist Dojo',
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ align: 'center' }),
      );
    });

    it('should set waiver title in the header without version', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockText).toHaveBeenCalledWith(
        'Standard Adult Waiver',
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ align: 'center' }),
      );
    });

    it('should include waiver version in the footer', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockText).toHaveBeenCalledWith(
        'Waiver version: v1',
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ align: 'center' }),
      );
    });

    it('should include member name in the PDF', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'Name: John Doe',
        expect.any(Number),
      );
    });

    it('should include member email in the PDF', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'Email: john.doe@example.com',
        expect.any(Number),
      );
    });

    it('should include waiver content in the PDF', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'I hereby acknowledge the risks of martial arts training and voluntarily participate.',
        expect.any(Number),
      );
    });

    it('should strip HTML tags from rendered content', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        renderedContent: '<p>This is a <strong>test</strong> waiver.</p>',
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'This is a test waiver.',
        expect.any(Number),
      );
    });

    it('should convert HTML entities in content', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        renderedContent: 'Terms &amp; Conditions: &lt;important&gt;',
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'Terms & Conditions: <important>',
        expect.any(Number),
      );
    });

    it('should convert &nbsp; to spaces', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        renderedContent: 'Hello&nbsp;World',
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'Hello World',
        expect.any(Number),
      );
    });

    it('should include signer name without relationship when signedByRelationship is not set', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'Signed by: John Doe',
        expect.any(Number),
      );
    });

    it('should include signer name with relationship when signedByRelationship is set', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        signedByName: 'Jane Doe',
        signedByRelationship: 'Parent',
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'Signed by: Jane Doe (Parent)',
        expect.any(Number),
      );
    });

    it('should include IP address when provided', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        ipAddress: '192.168.1.100',
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'IP Address: 192.168.1.100',
        expect.any(Number),
      );
    });

    it('should not include IP address when not provided', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      const ipCalls = mockSplitTextToSize.mock.calls.filter(
        (call: string[]) => typeof call[0] === 'string' && call[0].includes('IP Address'),
      );

      expect(ipCalls).toHaveLength(0);
    });

    it('should add signature image when signatureDataUrl is a valid data URL', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockAddImage).toHaveBeenCalledWith(
        mockInput.signatureDataUrl,
        'PNG',
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('should draw a border rectangle around the signature', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockRect).toHaveBeenCalled();
    });

    it('should handle signature image failure gracefully', async () => {
      mockAddImage.mockImplementation(() => {
        throw new Error('Failed to add image');
      });

      const { generateWaiverPdf } = await import('./WaiverPdfService');
      const result = generateWaiverPdf(mockInput);

      // Should still return a Blob even when the image fails
      expect(result).toBeInstanceOf(Blob);
      // Should add fallback text
      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        '[Signature on file]',
        expect.any(Number),
      );
    });

    it('should not add signature image when signatureDataUrl does not start with data:image/', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        signatureDataUrl: 'not-a-data-url',
      });

      expect(mockAddImage).not.toHaveBeenCalled();
    });

    it('should draw a horizontal line after the header', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockLine).toHaveBeenCalled();
    });

    it('should set draw color for the horizontal line', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockSetDrawColor).toHaveBeenCalledWith(200);
    });

    it('should call output with blob format', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockOutput).toHaveBeenCalledWith('blob');
    });

    it('should handle multi-paragraph content by splitting on double newlines', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        renderedContent: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith('First paragraph.', expect.any(Number));
      expect(mockSplitTextToSize).toHaveBeenCalledWith('Second paragraph.', expect.any(Number));
      expect(mockSplitTextToSize).toHaveBeenCalledWith('Third paragraph.', expect.any(Number));
    });

    it('should handle <br> tags by converting to newlines', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        renderedContent: 'Line one.<br>Line two.<br/>Line three.',
      });

      // After HTML processing, <br> becomes \n, paragraphs are split on \n{2,}
      // but single newlines result in a single paragraph
      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        expect.stringContaining('Line one.'),
        expect.any(Number),
      );
    });

    it('should handle </p> tags by converting to double newlines', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        renderedContent: '<p>Paragraph one.</p><p>Paragraph two.</p>',
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith('Paragraph one.', expect.any(Number));
      expect(mockSplitTextToSize).toHaveBeenCalledWith('Paragraph two.', expect.any(Number));
    });

    it('should add page break when content exceeds page height', async () => {
      // Make splitTextToSize return many lines to force page breaks
      mockSplitTextToSize.mockImplementation((text: string) => {
        // Return many lines to simulate long content
        return Array.from({ length: 80 }, () => text);
      });

      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      // With many lines, page breaks should have been added
      expect(mockAddPage).toHaveBeenCalled();
    });

    it('should include the MEMBER INFORMATION section header', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockSplitTextToSize).toHaveBeenCalledWith('MEMBER INFORMATION', expect.any(Number));
    });

    it('should include the WAIVER AND RELEASE OF LIABILITY section header', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockSplitTextToSize).toHaveBeenCalledWith('WAIVER AND RELEASE OF LIABILITY', expect.any(Number));
    });

    it('should include the SIGNATURE section header', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockSplitTextToSize).toHaveBeenCalledWith('SIGNATURE', expect.any(Number));
    });

    it('should set footer text color to gray', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      expect(mockSetTextColor).toHaveBeenCalledWith(128);
    });

    // =========================================================================
    // MEMBERSHIP DETAILS section
    // =========================================================================

    it('should include MEMBERSHIP DETAILS section when membershipPlanName is provided', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: '12 Month Commitment (Gold)',
        membershipPlanPrice: 150,
        membershipPlanFrequency: 'Monthly',
        membershipPlanContractLength: '12 Months',
        membershipPlanSignupFee: 35,
        membershipPlanIsTrial: false,
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith('MEMBERSHIP DETAILS', expect.any(Number));
      expect(mockSplitTextToSize).toHaveBeenCalledWith('Plan: 12 Month Commitment (Gold)', expect.any(Number));
    });

    it('should NOT include MEMBERSHIP DETAILS section when membershipPlanName is not provided', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf(mockInput);

      const membershipCalls = mockSplitTextToSize.mock.calls.filter(
        (call: string[]) => typeof call[0] === 'string' && call[0] === 'MEMBERSHIP DETAILS',
      );

      expect(membershipCalls).toHaveLength(0);
    });

    it('should show price as Free when membershipPlanPrice is 0', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: 'Free Trial',
        membershipPlanPrice: 0,
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith('Price: Free', expect.any(Number));
    });

    it('should format non-zero membership plan price', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: '12 Month Commitment (Gold)',
        membershipPlanPrice: 150,
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith('Price: $150.00', expect.any(Number));
    });

    it('should include payment schedule when frequency is not None', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: '12 Month Commitment (Gold)',
        membershipPlanFrequency: 'Monthly',
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith('Payment Schedule: Monthly', expect.any(Number));
    });

    it('should not include payment schedule when frequency is None', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: 'Free Trial',
        membershipPlanFrequency: 'None',
      });

      const scheduleCalls = mockSplitTextToSize.mock.calls.filter(
        (call: string[]) => typeof call[0] === 'string' && call[0].includes('Payment Schedule'),
      );

      expect(scheduleCalls).toHaveLength(0);
    });

    it('should include contract length', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: '12 Month Commitment (Gold)',
        membershipPlanContractLength: '12 Months',
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith('Contract Length: 12 Months', expect.any(Number));
    });

    it('should include signup fee when greater than 0', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: '12 Month Commitment (Gold)',
        membershipPlanSignupFee: 35,
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith('Signup Fee: $35.00', expect.any(Number));
    });

    it('should not include signup fee when 0', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: '12 Month Commitment (Gold)',
        membershipPlanSignupFee: 0,
      });

      const feeCalls = mockSplitTextToSize.mock.calls.filter(
        (call: string[]) => typeof call[0] === 'string' && call[0].includes('Signup Fee'),
      );

      expect(feeCalls).toHaveLength(0);
    });

    it('should show trial type badge when membershipPlanIsTrial is true', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: 'Free Trial',
        membershipPlanIsTrial: true,
      });

      expect(mockSplitTextToSize).toHaveBeenCalledWith('Type: Free Trial', expect.any(Number));
    });

    it('should not show trial type badge when membershipPlanIsTrial is false', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: '12 Month Commitment (Gold)',
        membershipPlanIsTrial: false,
      });

      const trialCalls = mockSplitTextToSize.mock.calls.filter(
        (call: string[]) => typeof call[0] === 'string' && call[0] === 'Type: Free Trial',
      );

      expect(trialCalls).toHaveLength(0);
    });

    // =========================================================================
    // COUPON DISCOUNT display
    // =========================================================================

    it('should render coupon discount with strikethrough price', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: '12 Month Commitment (Gold)',
        membershipPlanPrice: 150,
        membershipPlanFrequency: 'Monthly',
        couponCode: 'SAVE15',
        couponType: 'Percentage',
        couponAmount: '15%',
        couponDiscountedPrice: 127.5,
      });

      // Original price drawn in gray (150)
      expect(mockSetTextColor).toHaveBeenCalledWith(150);
      // Original price text
      expect(mockText).toHaveBeenCalledWith(
        '$150.00',
        expect.any(Number),
        expect.any(Number),
      );
      // Strikethrough line is drawn
      expect(mockLine).toHaveBeenCalled();
      // Discounted price drawn in black (0)
      expect(mockSetTextColor).toHaveBeenCalledWith(0);
      // Discounted price text (with leading spaces)
      expect(mockText).toHaveBeenCalledWith(
        '  $127.50',
        expect.any(Number),
        expect.any(Number),
      );
      // Discount info line rendered via addText -> splitTextToSize
      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'Discount: SAVE15 (15% off)',
        expect.any(Number),
      );
    });

    it('should render free trial coupon correctly', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: 'Monthly Plan',
        membershipPlanPrice: 99,
        couponCode: 'FREETRIAL',
        couponType: 'Free Trial',
        couponAmount: '7 Days',
        couponDiscountedPrice: 0,
      });

      // Discounted price of 0 shows as "Free" (not "$0.00")
      expect(mockText).toHaveBeenCalledWith(
        '  Free',
        expect.any(Number),
        expect.any(Number),
      );
      // Free Trial type does NOT have "off" suffix
      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'Discount: FREETRIAL (7 Days)',
        expect.any(Number),
      );
    });

    it('should not render coupon info when no coupon data', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: '12 Month Commitment (Gold)',
        membershipPlanPrice: 150,
      });

      // Should NOT use gray text color (150) for strikethrough rendering
      expect(mockSetTextColor).not.toHaveBeenCalledWith(150);
      // Normal price is rendered via addText -> splitTextToSize
      expect(mockSplitTextToSize).toHaveBeenCalledWith(
        'Price: $150.00',
        expect.any(Number),
      );
    });

    it('should reset text color after strikethrough rendering', async () => {
      const { generateWaiverPdf } = await import('./WaiverPdfService');
      generateWaiverPdf({
        ...mockInput,
        membershipPlanName: '12 Month Commitment (Gold)',
        membershipPlanPrice: 150,
        couponCode: 'SAVE15',
        couponType: 'Percentage',
        couponAmount: '15%',
        couponDiscountedPrice: 127.5,
      });

      // Find the indices of the gray (150) and black (0) calls
      const setTextColorCalls = mockSetTextColor.mock.calls.map(
        (call: number[]) => call[0],
      );
      const grayIndex = setTextColorCalls.indexOf(150);
      const blackAfterGray = setTextColorCalls.indexOf(0, grayIndex + 1);

      // Gray must have been called
      expect(grayIndex).toBeGreaterThanOrEqual(0);
      // Black must be called after gray to reset
      expect(blackAfterGray).toBeGreaterThan(grayIndex);
    });
  });

  // ===========================================================================
  // generateWaiverPdfBuffer
  // ===========================================================================

  describe('generateWaiverPdfBuffer', () => {
    it('should return a Buffer instead of a Blob', async () => {
      // The mock output fn returns a Blob by default, but generateWaiverPdfBuffer
      // calls doc.output('arraybuffer') and wraps with Buffer.from().
      // We need to mock output to return an ArrayBuffer when called with 'arraybuffer'.
      (mockOutput as ReturnType<typeof vi.fn>).mockImplementation((format: string) => {
        if (format === 'arraybuffer') {
          return new ArrayBuffer(16);
        }
        return new Blob(['mock-pdf-data'], { type: 'application/pdf' });
      });

      const { generateWaiverPdfBuffer } = await import('./WaiverPdfService');
      const result = generateWaiverPdfBuffer(mockInput);

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should call output with arraybuffer format', async () => {
      (mockOutput as ReturnType<typeof vi.fn>).mockImplementation((format: string) => {
        if (format === 'arraybuffer') {
          return new ArrayBuffer(16);
        }
        return new Blob(['mock-pdf-data'], { type: 'application/pdf' });
      });

      const { generateWaiverPdfBuffer } = await import('./WaiverPdfService');
      generateWaiverPdfBuffer(mockInput);

      expect(mockOutput).toHaveBeenCalledWith('arraybuffer');
    });

    it('should include the same content sections as generateWaiverPdf', async () => {
      (mockOutput as ReturnType<typeof vi.fn>).mockImplementation((format: string) => {
        if (format === 'arraybuffer') {
          return new ArrayBuffer(16);
        }
        return new Blob(['mock-pdf-data'], { type: 'application/pdf' });
      });

      const { generateWaiverPdfBuffer } = await import('./WaiverPdfService');
      generateWaiverPdfBuffer(mockInput);

      // Verify it includes key sections like the client-side version
      expect(mockSplitTextToSize).toHaveBeenCalledWith('MEMBER INFORMATION', expect.any(Number));
      expect(mockSplitTextToSize).toHaveBeenCalledWith('WAIVER AND RELEASE OF LIABILITY', expect.any(Number));
      expect(mockSplitTextToSize).toHaveBeenCalledWith('SIGNATURE', expect.any(Number));
    });
  });

  // ===========================================================================
  // generatePdfFilename
  // ===========================================================================

  describe('generatePdfFilename', () => {
    it('should generate filename with last_first format and date', async () => {
      const { generatePdfFilename } = await import('./WaiverPdfService');
      const result = generatePdfFilename({
        memberFirstName: 'John',
        memberLastName: 'Doe',
        signedAt: new Date('2024-06-15T10:30:00Z'),
      });

      expect(result).toBe('waiver_Doe_John_2024-06-15.pdf');
    });

    it('should handle names with spaces by replacing with underscores', async () => {
      const { generatePdfFilename } = await import('./WaiverPdfService');
      const result = generatePdfFilename({
        memberFirstName: 'John Paul',
        memberLastName: 'De La Cruz',
        signedAt: new Date('2024-12-25T00:00:00Z'),
      });

      expect(result).toBe('waiver_De_La_Cruz_John_Paul_2024-12-25.pdf');
    });

    it('should use ISO date format (YYYY-MM-DD)', async () => {
      const { generatePdfFilename } = await import('./WaiverPdfService');
      const result = generatePdfFilename({
        memberFirstName: 'Jane',
        memberLastName: 'Smith',
        signedAt: new Date('2025-01-01T23:59:59Z'),
      });

      expect(result).toBe('waiver_Smith_Jane_2025-01-01.pdf');
    });
  });

  // ===========================================================================
  // downloadWaiverPdf
  // ===========================================================================

  describe('downloadWaiverPdf', () => {
    it('should create a link element, set properties, and trigger download', async () => {
      // Provide minimal DOM stubs for the Node test environment
      const mockClick = vi.fn();
      const mockLink = { href: '', download: '', click: mockClick };

      const originalCreateObjectURL = globalThis.URL.createObjectURL;
      const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-url');
      globalThis.URL.revokeObjectURL = vi.fn();

      // Stub document (Node environment)
      const hasDocument = typeof globalThis.document !== 'undefined';

      if (!hasDocument) {
        (globalThis as any).document = {
          createElement: vi.fn(() => mockLink),
          body: {
            appendChild: vi.fn(),
            removeChild: vi.fn(),
          },
        };
      } else {
        vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
        vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn() as any);
        vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn() as any);
      }

      const { downloadWaiverPdf } = await import('./WaiverPdfService');
      const blob = new Blob(['test'], { type: 'application/pdf' });
      downloadWaiverPdf(blob, 'waiver_Doe_John_2024-06-15.pdf');

      expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(mockLink.download).toBe('waiver_Doe_John_2024-06-15.pdf');
      expect(mockLink.href).toBe('blob:http://localhost/mock-url');
      expect(mockClick).toHaveBeenCalled();
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/mock-url');

      // Restore
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
      if (hasDocument) {
        vi.restoreAllMocks();
      } else {
        delete (globalThis as any).document;
      }
    });
  });

  // ===========================================================================
  // generateAndDownloadWaiverPdf
  // ===========================================================================

  describe('generateAndDownloadWaiverPdf', () => {
    it('should generate PDF and trigger download with custom filename', async () => {
      const mockClick = vi.fn();
      const mockLink = { href: '', download: '', click: mockClick };

      const originalCreateObjectURL = globalThis.URL.createObjectURL;
      const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-url');
      globalThis.URL.revokeObjectURL = vi.fn();

      if (typeof globalThis.document === 'undefined') {
        (globalThis as any).document = {
          createElement: vi.fn(() => mockLink),
          body: {
            appendChild: vi.fn(),
            removeChild: vi.fn(),
          },
        };
      } else {
        vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
        vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn() as any);
        vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn() as any);
      }

      const { generateAndDownloadWaiverPdf } = await import('./WaiverPdfService');
      generateAndDownloadWaiverPdf(mockInput, 'custom_filename.pdf');

      expect(mockLink.download).toBe('custom_filename.pdf');
      expect(mockClick).toHaveBeenCalled();

      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
      if (typeof document !== 'undefined') {
        vi.restoreAllMocks();
      } else {
        delete (globalThis as any).document;
      }
    });

    it('should use default filename when custom filename not provided', async () => {
      const mockClick = vi.fn();
      const mockLink = { href: '', download: '', click: mockClick };

      const originalCreateObjectURL = globalThis.URL.createObjectURL;
      const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-url');
      globalThis.URL.revokeObjectURL = vi.fn();

      if (typeof globalThis.document === 'undefined') {
        (globalThis as any).document = {
          createElement: vi.fn(() => mockLink),
          body: {
            appendChild: vi.fn(),
            removeChild: vi.fn(),
          },
        };
      } else {
        vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
        vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn() as any);
        vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn() as any);
      }

      const { generateAndDownloadWaiverPdf } = await import('./WaiverPdfService');
      generateAndDownloadWaiverPdf(mockInput);

      expect(mockLink.download).toBe('waiver_Doe_John_2024-06-15.pdf');
      expect(mockClick).toHaveBeenCalled();

      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
      if (typeof document !== 'undefined') {
        vi.restoreAllMocks();
      } else {
        delete (globalThis as any).document;
      }
    });
  });
});
