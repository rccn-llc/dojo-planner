import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@clerk/nextjs', () => ({
  useOrganization: vi.fn(),
}));

describe('useHasRole', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should return true when user has the exact required role', async () => {
    const { useOrganization } = await import('@clerk/nextjs');
    vi.mocked(useOrganization).mockReturnValue({
      membership: { role: ORG_ROLE.FRONT_DESK },
    } as any);

    const { useHasRole } = await import('./useHasRole');

    expect(useHasRole(ORG_ROLE.FRONT_DESK)).toBe(true);
  });

  it('should return true when user has a higher role than required', async () => {
    const { useOrganization } = await import('@clerk/nextjs');
    vi.mocked(useOrganization).mockReturnValue({
      membership: { role: ORG_ROLE.ADMIN },
    } as any);

    const { useHasRole } = await import('./useHasRole');

    expect(useHasRole(ORG_ROLE.FRONT_DESK)).toBe(true);
  });

  it('should return true when academy_owner checks for front_desk', async () => {
    const { useOrganization } = await import('@clerk/nextjs');
    vi.mocked(useOrganization).mockReturnValue({
      membership: { role: ORG_ROLE.ACADEMY_OWNER },
    } as any);

    const { useHasRole } = await import('./useHasRole');

    expect(useHasRole(ORG_ROLE.FRONT_DESK)).toBe(true);
  });

  it('should return false when user has a lower role than required', async () => {
    const { useOrganization } = await import('@clerk/nextjs');
    vi.mocked(useOrganization).mockReturnValue({
      membership: { role: ORG_ROLE.FRONT_DESK },
    } as any);

    const { useHasRole } = await import('./useHasRole');

    expect(useHasRole(ORG_ROLE.ACADEMY_OWNER)).toBe(false);
  });

  it('should return false when user has member role and academy_owner is required', async () => {
    const { useOrganization } = await import('@clerk/nextjs');
    vi.mocked(useOrganization).mockReturnValue({
      membership: { role: ORG_ROLE.MEMBER },
    } as any);

    const { useHasRole } = await import('./useHasRole');

    expect(useHasRole(ORG_ROLE.ACADEMY_OWNER)).toBe(false);
  });

  it('should return false when membership is undefined', async () => {
    const { useOrganization } = await import('@clerk/nextjs');
    vi.mocked(useOrganization).mockReturnValue({
      membership: undefined,
    } as any);

    const { useHasRole } = await import('./useHasRole');

    expect(useHasRole(ORG_ROLE.FRONT_DESK)).toBe(false);
  });

  it('should return false when membership is null', async () => {
    const { useOrganization } = await import('@clerk/nextjs');
    vi.mocked(useOrganization).mockReturnValue({
      membership: null,
    } as any);

    const { useHasRole } = await import('./useHasRole');

    expect(useHasRole(ORG_ROLE.FRONT_DESK)).toBe(false);
  });

  it('should return false when role is not in hierarchy', async () => {
    const { useOrganization } = await import('@clerk/nextjs');
    vi.mocked(useOrganization).mockReturnValue({
      membership: { role: 'org:unknown_role' },
    } as any);

    const { useHasRole } = await import('./useHasRole');

    expect(useHasRole(ORG_ROLE.FRONT_DESK)).toBe(false);
  });
});
