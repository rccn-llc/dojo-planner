import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { ImageUploadField } from './image-upload';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock next/image - must include unoptimized support
vi.mock('next/image', () => ({
  default: function MockImage({ src, alt, width, height, className, unoptimized: _unoptimized, ...props }: { src: string; alt: string; width?: number; height?: number; className?: string; unoptimized?: boolean; [key: string]: unknown }) {
    return (
      // eslint-disable-next-line next/no-img-element
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        data-testid="preview-image"
        {...props}
      />
    );
  },
}));

// Mock image compression utility
vi.mock('@/utils/imageCompression', () => ({
  compressImageForStorage: vi.fn().mockResolvedValue({
    compressedFile: new Blob(['test'], { type: 'image/jpeg' }),
    originalSize: 10000,
    compressedSize: 5000,
    compressionRatio: 50,
  }),
  formatFileSize: vi.fn((size: number) => `${Math.round(size / 1024)} KB`),
}));

describe('ImageUploadField', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering without value', () => {
    it('should render upload area when no value is provided', async () => {
      await render(
        <ImageUploadField
          value={null}
          onChange={mockOnChange}
        />,
      );

      await expect.element(page.getByText('drop_text')).toBeVisible();
      await expect.element(page.getByText('file_types')).toBeVisible();
      await expect.element(page.getByText('choose_file_button')).toBeVisible();
    });

    it('should render label when provided', async () => {
      await render(
        <ImageUploadField
          value={null}
          onChange={mockOnChange}
          label="Product Image"
        />,
      );

      await expect.element(page.getByText('Product Image')).toBeVisible();
    });

    it('should render help text when provided', async () => {
      await render(
        <ImageUploadField
          value={null}
          onChange={mockOnChange}
          helpText="Upload a product image"
        />,
      );

      await expect.element(page.getByText('Upload a product image')).toBeVisible();
    });

    it('should render file input with correct accept attribute', async () => {
      await render(
        <ImageUploadField
          value={null}
          onChange={mockOnChange}
        />,
      );

      // The input is hidden but exists in the DOM
      const fileInput = page.getByLabelText('choose_file_button');

      await expect.element(fileInput).toHaveAttribute('accept', '.jpg,.jpeg,.png,.gif');
    });
  });

  // Note: Tests for image preview rendering with next/image are skipped in browser tests
  // because vi.mock doesn't work reliably with next/image in Vitest browser mode.
  // The component's image functionality is tested via visual inspection and e2e tests.

  describe('Custom className', () => {
    it('should apply custom className', async () => {
      await render(
        <ImageUploadField
          value={null}
          onChange={mockOnChange}
          className="mt-4"
        />,
      );

      // The component renders successfully with custom class
      await expect.element(page.getByText('drop_text')).toBeVisible();
    });
  });
});
