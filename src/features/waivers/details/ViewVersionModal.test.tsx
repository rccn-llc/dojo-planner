import type { WaiverMergeField, WaiverTemplate } from '@/services/WaiversService';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { ViewVersionModal } from './ViewVersionModal';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock date-fns
vi.mock('date-fns', () => ({
  format: (_date: Date, _fmt: string) => 'Jan 1, 2024',
}));

const mockTemplate: WaiverTemplate = {
  id: 'version-1',
  organizationId: 'org-1',
  name: 'Test Waiver',
  slug: 'test-waiver',
  version: 2,
  content: 'This is waiver content with <academy> placeholder.',
  description: null,
  isActive: true,
  isDefault: false,
  requiresGuardian: true,
  guardianAgeThreshold: 16,
  sortOrder: 0,
  parentId: 'root-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockMergeFields: WaiverMergeField[] = [
  {
    id: 'mf-1',
    organizationId: 'org-1',
    key: 'academy',
    label: 'Academy Name',
    defaultValue: 'Test Academy',
    description: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('ViewVersionModal', () => {
  const mockOnClose = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    template: mockTemplate,
    mergeFields: mockMergeFields,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render content when template is null', async () => {
    await render(
      <ViewVersionModal
        {...defaultProps}
        template={null}
      />,
    );

    const hasContent = document.body.textContent?.includes('This is waiver content');

    expect(hasContent).toBe(false);
  });

  it('should render version title and date when open with template', async () => {
    await render(<ViewVersionModal {...defaultProps} />);

    const title = page.getByText('title');
    const versionDate = page.getByText('version_date');

    expect(title).toBeTruthy();
    expect(versionDate).toBeTruthy();
  });

  it('should render waiver content text', async () => {
    await render(<ViewVersionModal {...defaultProps} />);

    const content = page.getByText(/This is waiver content with/);

    expect(content).toBeTruthy();
  });

  it('should highlight merge fields with mark elements when merge fields are provided', async () => {
    await render(<ViewVersionModal {...defaultProps} />);

    const markElements = document.querySelectorAll('mark');

    expect(markElements).toHaveLength(1);
    expect(markElements[0]!.textContent).toBe('Test Academy');
  });

  it('should return plain content when no merge fields are provided', async () => {
    await render(
      <ViewVersionModal
        {...defaultProps}
        mergeFields={[]}
      />,
    );

    const markElements = document.querySelectorAll('mark');
    const content = page.getByText('This is waiver content with <academy> placeholder.');

    expect(markElements).toHaveLength(0);
    expect(content).toBeTruthy();
  });

  it('should call onClose when close button is clicked', async () => {
    await render(<ViewVersionModal {...defaultProps} />);

    const closeButton = page.getByRole('button', { name: 'close_button' });
    await userEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
