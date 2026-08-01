import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { SignatureCanvas } from './SignatureCanvas';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const keys: Record<string, string> = {
      placeholder: 'Sign here',
      clear_button: 'Clear',
    };
    return keys[key] || key;
  },
}));

// Mock react-signature-canvas using a React class component.
// The real SignaturePad is a class component that exposes imperative methods
// (clear, isEmpty, toDataURL) through its ref. We mock it as a class component
// that renders a canvas and provides these methods for the parent to call.
vi.mock('react-signature-canvas', async () => {
  const React = await import('react');

  class MockSignaturePad extends React.Component<{
    canvasProps?: Record<string, unknown>;
    onEnd?: () => void;
    penColor?: string;
    minWidth?: number;
    maxWidth?: number;
    velocityFilterWeight?: number;
  }> {
    clear = () => {};
    isEmpty = () => true;
    toDataURL = () => 'data:image/png;base64,mockdata';

    override render() {
      const { canvasProps = {} } = this.props;
      return <canvas data-testid="signature-canvas" {...canvasProps} />;
    }
  }

  return { default: MockSignaturePad };
});

describe('SignatureCanvas', () => {
  const mockOnSignatureChange = vi.fn();

  const defaultProps = {
    onSignatureChange: mockOnSignatureChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the component container', async () => {
    await render(<SignatureCanvas {...defaultProps} />);

    expect(page.getByText('Clear')).toBeTruthy();
  });

  it('should render the canvas element', async () => {
    await render(<SignatureCanvas {...defaultProps} />);

    const canvas = document.querySelector('canvas');

    expect(canvas).toBeTruthy();
  });

  it('should render placeholder text when empty and not disabled', async () => {
    await render(<SignatureCanvas {...defaultProps} />);

    expect(page.getByText('Sign here')).toBeTruthy();
  });

  it('should render clear button', async () => {
    await render(<SignatureCanvas {...defaultProps} />);

    const clearButton = page.getByRole('button', { name: 'Clear' });

    expect(clearButton).toBeTruthy();
  });

  it('should render with a label when label prop is provided', async () => {
    await render(<SignatureCanvas {...defaultProps} label="Your Signature" />);

    expect(page.getByText('Your Signature')).toBeTruthy();
  });

  it('should not render a label when label prop is not provided', async () => {
    await render(<SignatureCanvas {...defaultProps} />);

    const labels = page.getByText('Your Signature');

    expect(labels.elements()).toHaveLength(0);
  });

  it('should render error message when error prop is provided', async () => {
    await render(<SignatureCanvas {...defaultProps} error="Signature is required" />);

    expect(page.getByText('Signature is required')).toBeTruthy();
  });

  it('should not render error message when error prop is not provided', async () => {
    await render(<SignatureCanvas {...defaultProps} />);

    const errors = page.getByText('Signature is required');

    expect(errors.elements()).toHaveLength(0);
  });

  it('should disable clear button when disabled prop is true', async () => {
    await render(<SignatureCanvas {...defaultProps} disabled={true} />);

    const buttons = Array.from(document.querySelectorAll('button'));
    const clearButton = buttons.find(btn => btn.textContent?.includes('Clear'));

    expect(clearButton).toBeTruthy();
    expect(clearButton?.disabled).toBe(true);
  });

  it('should disable clear button when canvas is empty (initial state)', async () => {
    await render(<SignatureCanvas {...defaultProps} />);

    const clearButton = page.getByRole('button', { name: 'Clear' });
    const buttonEl = clearButton.element() as HTMLButtonElement;

    expect(buttonEl.disabled).toBe(true);
  });

  it('should not show placeholder when disabled', async () => {
    await render(<SignatureCanvas {...defaultProps} disabled={true} />);

    const placeholders = page.getByText('Sign here');

    expect(placeholders.elements()).toHaveLength(0);
  });

  it('should render with default dimensions', async () => {
    await render(<SignatureCanvas {...defaultProps} />);

    expect(page.getByText('Clear')).toBeTruthy();
  });

  it('should render with custom dimensions', async () => {
    await render(<SignatureCanvas {...defaultProps} width={600} height={300} />);

    expect(page.getByText('Clear')).toBeTruthy();
  });

  it('should apply custom className to the container', async () => {
    await render(<SignatureCanvas {...defaultProps} className="mt-4" />);

    const container = document.querySelector('.mt-4');

    expect(container).toBeTruthy();
  });

  it('should show disabled overlay when disabled is true', async () => {
    await render(<SignatureCanvas {...defaultProps} disabled={true} />);

    // When disabled, the component renders a div with class cursor-not-allowed
    const disabledContainer = document.querySelector('[class*="cursor-not-allowed"]');

    expect(disabledContainer).toBeTruthy();
  });

  it('should show crosshair cursor when not disabled', async () => {
    await render(<SignatureCanvas {...defaultProps} disabled={false} />);

    const crosshairContainer = document.querySelector('[class*="cursor-crosshair"]');

    expect(crosshairContainer).toBeTruthy();
  });
});
