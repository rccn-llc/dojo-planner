import { auth } from '@clerk/nextjs/server';

import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/libs/DB';
import { getAcademyOwner } from '@/services/ClerkRolesService';
import { hasActiveSubscription } from '@/services/SaasSubscriptionService';
import { isExemptOrg, isSuperAdmin } from '@/utils/SuperAdmins';
import { requireActiveSubscription } from './Auth';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  // Mimic Next's redirect by throwing so execution stops, like the runtime.
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('@/libs/DB', () => ({
  db: {
    query: {
      organizationSchema: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ _type: 'eq', value: val })),
}));

vi.mock('@/models/Schema', () => ({
  organizationSchema: { id: 'id' },
}));

vi.mock('@/services/ClerkRolesService', () => ({
  getAcademyOwner: vi.fn(),
}));

vi.mock('@/services/SaasSubscriptionService', () => ({
  hasActiveSubscription: vi.fn(),
}));

vi.mock('@/utils/SuperAdmins', () => ({
  isSuperAdmin: vi.fn(),
  isExemptOrg: vi.fn(),
}));

const mockAuth = vi.mocked(auth);
const mockRedirect = vi.mocked(redirect);
const mockFindFirst = vi.mocked(db.query.organizationSchema.findFirst);
const mockGetAcademyOwner = vi.mocked(getAcademyOwner);
const mockHasActiveSubscription = vi.mocked(hasActiveSubscription);
const mockIsSuperAdmin = vi.mocked(isSuperAdmin);
const mockIsExemptOrg = vi.mocked(isExemptOrg);

const owner = { clerkUserId: 'user-owner', email: 'o@e.com', firstName: 'O', lastName: 'E' };

function setAuth(orgId: string | null, username?: string, orgRole: string = 'org:front_desk') {
  mockAuth.mockResolvedValue({
    orgId,
    orgRole,
    sessionClaims: username ? { username } : {},
  } as any);
}

describe('requireActiveSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSuperAdmin.mockReturnValue(false);
    mockIsExemptOrg.mockReturnValue(false);
    mockFindFirst.mockResolvedValue({ id: 'org-1' } as any);
    mockHasActiveSubscription.mockResolvedValue(true);
    mockGetAcademyOwner.mockResolvedValue(owner);
  });

  it('passes through when active subscription and owner exist', async () => {
    setAuth('org-1');

    await expect(requireActiveSubscription('/en/dashboard/members')).resolves.toBeUndefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('skips enforcement on the subscription page', async () => {
    await requireActiveSubscription('/en/dashboard/subscription');

    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('skips enforcement on the subscription-expired page', async () => {
    await requireActiveSubscription('/en/dashboard/subscription-expired');

    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('does not enforce when there is no orgId', async () => {
    setAuth(null);

    await expect(requireActiveSubscription('/en/dashboard/members')).resolves.toBeUndefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('bypasses for super admins', async () => {
    setAuth('org-1', 'aguilanegra');
    mockIsSuperAdmin.mockReturnValue(true);

    await requireActiveSubscription('/en/dashboard/members');

    expect(mockHasActiveSubscription).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('bypasses for exempt orgs', async () => {
    setAuth('org-exempt');
    mockIsExemptOrg.mockReturnValue(true);

    await requireActiveSubscription('/en/dashboard/members');

    expect(mockHasActiveSubscription).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('does not enforce for a fresh org without a DB row', async () => {
    setAuth('org-fresh');
    mockFindFirst.mockResolvedValue(undefined as any);

    await requireActiveSubscription('/en/dashboard/members');

    expect(mockHasActiveSubscription).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects when the subscription is inactive', async () => {
    setAuth('org-1');
    mockHasActiveSubscription.mockResolvedValue(false);

    await expect(requireActiveSubscription('/en/dashboard/members')).rejects.toThrow('REDIRECT:/en/dashboard/subscription-expired');
    // Owner is not checked once the subscription is inactive.
    expect(mockGetAcademyOwner).not.toHaveBeenCalled();
  });

  it('redirects a non-admin when active but no academy owner exists', async () => {
    setAuth('org-1', undefined, 'org:front_desk');
    mockHasActiveSubscription.mockResolvedValue(true);
    mockGetAcademyOwner.mockResolvedValue(null);

    await expect(requireActiveSubscription('/en/dashboard/members')).rejects.toThrow('REDIRECT:/en/dashboard/subscription-expired');
  });

  it('lets an admin through even when no academy owner exists', async () => {
    setAuth('org-1', undefined, 'org:admin');
    mockHasActiveSubscription.mockResolvedValue(true);
    mockGetAcademyOwner.mockResolvedValue(null);

    await expect(requireActiveSubscription('/en/dashboard/members')).resolves.toBeUndefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('still redirects an admin when the subscription is inactive', async () => {
    setAuth('org-1', undefined, 'org:admin');
    mockHasActiveSubscription.mockResolvedValue(false);

    await expect(requireActiveSubscription('/en/dashboard/members')).rejects.toThrow('REDIRECT:/en/dashboard/subscription-expired');
  });

  it('handles the default-locale path with no locale prefix', async () => {
    setAuth('org-1');
    mockHasActiveSubscription.mockResolvedValue(false);

    await expect(requireActiveSubscription('/dashboard/members')).rejects.toThrow('REDIRECT:/dashboard/subscription-expired');
  });
});
