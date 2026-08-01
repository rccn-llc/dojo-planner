import type { WaiverTemplateWithStats } from '@/services/WaiversService';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import WaiversPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

const listTemplatesMock = vi.fn();
const getDashboardStatsMock = vi.fn(() =>
  Promise.resolve({ signedThisMonth: 0, membershipsUsing: 0 }));

vi.mock('@/libs/Orpc', () => ({
  client: {
    waivers: {
      listTemplates: () => listTemplatesMock(),
      getDashboardStats: () => getDashboardStatsMock(),
      // The page also calls listMergeFields when opening the merge fields sheet —
      // not exercised in these tests but the import must exist.
      listMergeFields: () => Promise.resolve({ mergeFields: [] }),
      createTemplate: vi.fn(),
    },
  },
}));

const baseTimestamp = new Date('2026-01-15T12:00:00Z');

function makeWaiver(overrides: Partial<WaiverTemplateWithStats> = {}): WaiverTemplateWithStats {
  return {
    id: 'w-1',
    organizationId: 'org-1',
    name: 'Standard Adult Waiver',
    slug: 'standard-adult-waiver',
    version: 1,
    content: 'This is the waiver content for testing purposes.',
    description: 'A waiver for adult members.',
    isActive: true,
    isDefault: false,
    requiresGuardian: false,
    guardianAgeThreshold: 16,
    sortOrder: 0,
    parentId: null,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    signedCount: 0,
    membershipCount: 0,
    ...overrides,
  };
}

describe('WaiversPage status filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTemplatesMock.mockResolvedValue({
      templates: [
        makeWaiver({ id: 'w-active-1', name: 'Standard Adult Waiver', isActive: true }),
        makeWaiver({ id: 'w-active-2', name: 'Kids Program Waiver', isActive: true }),
        makeWaiver({ id: 'w-inactive-1', name: 'Legacy Liability Waiver', isActive: false }),
      ],
    });
  });

  it('renders all waivers by default', async () => {
    await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    await expect.poll(() => page.getByText('Standard Adult Waiver').elements().length).toBeGreaterThan(0);
    expect(page.getByText('Kids Program Waiver').first()).toBeInTheDocument();
    expect(page.getByText('Legacy Liability Waiver').first()).toBeInTheDocument();
  });

  it('renders the status filter Select with all three options', async () => {
    await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    await expect.poll(() => page.getByText('Standard Adult Waiver').elements().length).toBeGreaterThan(0);

    const statusFilter = page.getByLabelText('Status');

    expect(statusFilter).toBeInTheDocument();
  });

  it('filters to only active waivers when status=active', async () => {
    await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    await expect.poll(() => page.getByText('Standard Adult Waiver').elements().length).toBeGreaterThan(0);

    await userEvent.click(page.getByLabelText('Status'));
    await userEvent.click(page.getByRole('option', { name: 'Active', exact: true }));

    expect(page.getByText('Standard Adult Waiver').first()).toBeInTheDocument();
    expect(page.getByText('Kids Program Waiver').first()).toBeInTheDocument();
    expect(page.getByText('Legacy Liability Waiver').elements().length).toBe(0);
  });

  it('filters to only inactive waivers when status=inactive', async () => {
    await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    await expect.poll(() => page.getByText('Standard Adult Waiver').elements().length).toBeGreaterThan(0);

    await userEvent.click(page.getByLabelText('Status'));
    await userEvent.click(page.getByRole('option', { name: 'Inactive' }));

    expect(page.getByText('Legacy Liability Waiver').first()).toBeInTheDocument();
    expect(page.getByText('Standard Adult Waiver').elements().length).toBe(0);
    expect(page.getByText('Kids Program Waiver').elements().length).toBe(0);
  });

  it('combines search and status filters with AND logic', async () => {
    await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    await expect.poll(() => page.getByText('Standard Adult Waiver').elements().length).toBeGreaterThan(0);

    // Filter by active
    await userEvent.click(page.getByLabelText('Status'));
    await userEvent.click(page.getByRole('option', { name: 'Active', exact: true }));

    // Type a search query that only matches one of the active waivers
    const search = page.getByPlaceholder('Search waivers...');
    await userEvent.type(search, 'Kids');

    expect(page.getByText('Kids Program Waiver').first()).toBeInTheDocument();
    expect(page.getByText('Standard Adult Waiver').elements().length).toBe(0);
    expect(page.getByText('Legacy Liability Waiver').elements().length).toBe(0);
  });

  it('shows the no-results message when filters exclude everything', async () => {
    await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    await expect.poll(() => page.getByText('Standard Adult Waiver').elements().length).toBeGreaterThan(0);

    await userEvent.click(page.getByLabelText('Status'));
    await userEvent.click(page.getByRole('option', { name: 'Inactive' }));

    const search = page.getByPlaceholder('Search waivers...');
    await userEvent.type(search, 'nonexistent xyz');

    expect(page.getByText('No waivers match your filters')).toBeInTheDocument();
  });
});

describe('WaiversPage status filter visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the status filter when only active waivers exist', async () => {
    listTemplatesMock.mockResolvedValue({
      templates: [
        makeWaiver({ id: 'w-1', name: 'Standard Adult Waiver', isActive: true }),
        makeWaiver({ id: 'w-2', name: 'Kids Program Waiver', isActive: true }),
      ],
    });

    await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    await expect.poll(() => page.getByText('Standard Adult Waiver').elements().length).toBeGreaterThan(0);

    expect(page.getByLabelText('Status').elements().length).toBe(0);
  });

  it('hides the status filter when only inactive waivers exist', async () => {
    listTemplatesMock.mockResolvedValue({
      templates: [
        makeWaiver({ id: 'w-1', name: 'Legacy Waiver', isActive: false }),
      ],
    });

    await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    await expect.poll(() => page.getByText('Legacy Waiver').elements().length).toBeGreaterThan(0);

    expect(page.getByLabelText('Status').elements().length).toBe(0);
  });

  it('hides the status filter when there are no waivers at all', async () => {
    listTemplatesMock.mockResolvedValue({ templates: [] });

    await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    await expect.poll(() => page.getByText('No waivers found').elements().length).toBeGreaterThan(0);

    expect(page.getByLabelText('Status').elements().length).toBe(0);
  });

  it('shows the status filter only when both active and inactive waivers exist', async () => {
    listTemplatesMock.mockResolvedValue({
      templates: [
        makeWaiver({ id: 'w-1', name: 'Active Waiver', isActive: true }),
        makeWaiver({ id: 'w-2', name: 'Inactive Waiver', isActive: false }),
      ],
    });

    await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    await expect.poll(() => page.getByText('Active Waiver').elements().length).toBeGreaterThan(0);

    expect(page.getByLabelText('Status')).toBeInTheDocument();
  });
});

// React double-invokes effects in development (StrictMode), which showed up as
// two `listTemplates` and two `getDashboardStats` requests on every page load.
// Both fetches are de-duped so simultaneous mounts share one request.
describe('WaiversPage request de-duplication', () => {
  beforeEach(() => {
    listTemplatesMock.mockReset();
    getDashboardStatsMock.mockReset();
    getDashboardStatsMock.mockResolvedValue({ signedThisMonth: 0, membershipsUsing: 0 });
  });

  it('issues one request per endpoint when mounted twice concurrently', async () => {
    // Hold both endpoints pending so the second mount lands while the first
    // request is still in flight — the situation StrictMode's double-invoke
    // creates. A settled request releases its slot, which is why both must
    // stay open for this assertion to be meaningful.
    let releaseTemplates: ((value: { templates: WaiverTemplateWithStats[] }) => void) | undefined;
    let releaseStats: ((value: { signedThisMonth: number; membershipsUsing: number }) => void) | undefined;

    listTemplatesMock.mockReturnValue(new Promise((resolve) => {
      releaseTemplates = resolve;
    }));
    getDashboardStatsMock.mockReturnValue(new Promise((resolve) => {
      releaseStats = resolve;
    }));

    const first = await render(<I18nWrapper><WaiversPage /></I18nWrapper>);
    const second = await render(<I18nWrapper><WaiversPage /></I18nWrapper>);

    expect(listTemplatesMock).toHaveBeenCalledTimes(1);
    expect(getDashboardStatsMock).toHaveBeenCalledTimes(1);

    releaseTemplates?.({ templates: [makeWaiver({ name: 'Shared Waiver' })] });
    releaseStats?.({ signedThisMonth: 0, membershipsUsing: 0 });

    await expect
      .poll(() => page.getByText('Shared Waiver').elements().length)
      .toBeGreaterThan(0);

    await first.unmount();
    await second.unmount();
  });
});
