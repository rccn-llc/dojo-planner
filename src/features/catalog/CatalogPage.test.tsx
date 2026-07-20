import type { CatalogItem } from './types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { CatalogPage } from './CatalogPage';

// Mock next-intl — return the key (or key + params) so assertions can target literals.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key}: ${JSON.stringify(params)}`;
    }
    return key;
  },
}));

// Mock next/image (vi.mock of next/image is unreliable in browser mode otherwise).
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

// Mutable cache-hook return values — tests set `mockItems` before rendering.
let mockItems: CatalogItem[] = [];

vi.mock('@/hooks/useCatalogCache', () => ({
  useCatalogCache: () => ({
    items: mockItems,
    loading: false,
    revalidating: false,
    error: null,
    revalidate: vi.fn(),
  }),
  useCatalogCategoriesCache: () => ({
    categories: [],
    loading: false,
    revalidate: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEventsCache', () => ({
  useEventsCache: () => ({
    events: [],
    loading: false,
  }),
}));

vi.mock('@/libs/Orpc', () => ({
  client: {
    catalog: {
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      imageCreate: vi.fn(),
      imageRemove: vi.fn(),
      categoryCreate: vi.fn(),
      categoryUpdate: vi.fn(),
      categoryRemove: vi.fn(),
    },
  },
}));

const makeItem = (overrides: Partial<CatalogItem> = {}): CatalogItem => ({
  id: 'item-0',
  type: 'merchandise',
  name: 'Item 0',
  slug: 'item-0',
  description: null,
  shortDescription: null,
  sku: null,
  basePrice: 10,
  compareAtPrice: null,
  eventId: null,
  maxPerOrder: 10,
  trackInventory: false,
  lowStockThreshold: 5,
  sortOrder: 0,
  isActive: true,
  isFeatured: false,
  showOnKiosk: false,
  variants: [],
  images: [],
  categories: [],
  totalStock: 0,
  ...overrides,
});

const makeItems = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    makeItem({ id: `item-${i}`, name: `Item ${String(i).padStart(2, '0')}`, slug: `item-${i}` }));

describe('CatalogPage', () => {
  beforeEach(() => {
    mockItems = [];
    vi.clearAllMocks();
  });

  it('renders empty state when there are no items', async () => {
    mockItems = [];

    render(<CatalogPage organizationId="test-org-123" />);

    await expect.element(page.getByText('no_items_found')).toBeVisible();
  });

  it('renders only the first page of items (default page size 10)', async () => {
    mockItems = makeItems(25);

    render(<CatalogPage organizationId="test-org-123" />);

    // First 10 items are rendered.
    await expect.element(page.getByText('Item 00')).toBeVisible();
    await expect.element(page.getByText('Item 09')).toBeVisible();

    // Item 10 is on page 2 — not in the DOM yet.
    expect(page.getByText('Item 10').elements()).toHaveLength(0);
  });

  it('shows pagination controls when there are more items than one page', async () => {
    mockItems = makeItems(25);

    render(<CatalogPage organizationId="test-org-123" />);

    expect(page.getByRole('button', { name: /Previous/i }).elements().length).toBeGreaterThan(0);
    expect(page.getByRole('button', { name: 'Next', exact: true }).elements().length).toBeGreaterThan(0);
  });

  it('navigates to the second page when clicking Next', async () => {
    mockItems = makeItems(25);

    render(<CatalogPage organizationId="test-org-123" />);

    const nextButton = page.getByRole('button', { name: 'Next', exact: true });
    await nextButton.click();

    // Page 2 shows items 10-19.
    await expect.element(page.getByText('Item 10')).toBeVisible();
    expect(page.getByText('Item 00').elements()).toHaveLength(0);
  });

  it('renders more items after choosing a larger page size', async () => {
    mockItems = makeItems(30);

    render(<CatalogPage organizationId="test-org-123" />);

    // Item 10 is on page 2 with the default page size.
    expect(page.getByText('Item 10').elements()).toHaveLength(0);

    await page.getByLabelText('Rows per page').click();
    await page.getByRole('option', { name: '25' }).click();

    // Now Item 10 fits within the first (25-row) page.
    await expect.element(page.getByText('Item 10')).toBeVisible();
  });

  it('exposes a rows-per-page selector', async () => {
    mockItems = makeItems(15);

    render(<CatalogPage organizationId="test-org-123" />);

    await expect.element(page.getByLabelText('Rows per page')).toBeInTheDocument();
  });
});
