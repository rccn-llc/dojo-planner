import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG_ROLE } from '@/types/Auth';

// Mock Clerk auth
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('AuthGuards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('guardAuth', () => {
    it('should return userId, orgId, and has function when authenticated', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const mockHas = vi.fn().mockReturnValue(true);

      vi.mocked(auth).mockResolvedValue({
        userId: 'test-user-123',
        orgId: 'test-org-456',
        has: mockHas,
      } as any);

      const { guardAuth } = await import('./AuthGuards');
      const result = await guardAuth();

      expect(result.userId).toBe('test-user-123');
      expect(result.orgId).toBe('test-org-456');
      expect(typeof result.has).toBe('function');
    });

    it('should throw 401 when userId is missing', async () => {
      const { auth } = await import('@clerk/nextjs/server');

      vi.mocked(auth).mockResolvedValue({
        userId: null,
        orgId: 'test-org-456',
        has: vi.fn(),
      } as any);

      const { guardAuth } = await import('./AuthGuards');

      await expect(guardAuth()).rejects.toThrow(ORPCError);
      await expect(guardAuth()).rejects.toMatchObject({
        message: 'Unauthorized',
        status: 401,
      });
    });

    it('should throw 401 when orgId is missing', async () => {
      const { auth } = await import('@clerk/nextjs/server');

      vi.mocked(auth).mockResolvedValue({
        userId: 'test-user-123',
        orgId: null,
        has: vi.fn(),
      } as any);

      const { guardAuth } = await import('./AuthGuards');

      await expect(guardAuth()).rejects.toThrow(ORPCError);
      await expect(guardAuth()).rejects.toMatchObject({
        message: 'Unauthorized',
        status: 401,
      });
    });

    it('should throw 401 when both userId and orgId are missing', async () => {
      const { auth } = await import('@clerk/nextjs/server');

      vi.mocked(auth).mockResolvedValue({
        userId: null,
        orgId: null,
        has: vi.fn(),
      } as any);

      const { guardAuth } = await import('./AuthGuards');

      await expect(guardAuth()).rejects.toThrow(ORPCError);
    });
  });

  describe('guardRole', () => {
    it('should return AuditContext when user has required role', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const mockHas = vi.fn().mockReturnValue(true);

      vi.mocked(auth).mockResolvedValue({
        userId: 'test-user-123',
        orgId: 'test-org-456',
        has: mockHas,
      } as any);

      const { guardRole } = await import('./AuthGuards');
      const result = await guardRole(ORG_ROLE.ADMIN);

      expect(result.userId).toBe('test-user-123');
      expect(result.orgId).toBe('test-org-456');
      expect(result.role).toBe(ORG_ROLE.ADMIN);
    });

    it('should throw 403 when user lacks required role', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const mockHas = vi.fn().mockReturnValue(false);

      vi.mocked(auth).mockResolvedValue({
        userId: 'test-user-123',
        orgId: 'test-org-456',
        has: mockHas,
      } as any);

      const { guardRole } = await import('./AuthGuards');

      await expect(guardRole(ORG_ROLE.ADMIN)).rejects.toThrow(ORPCError);
      await expect(guardRole(ORG_ROLE.ADMIN)).rejects.toMatchObject({
        message: 'Forbidden',
        status: 403,
      });
    });

    it('should check roles in hierarchy order (admin first, then lower)', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      // Mock has to return false for ADMIN but true for ACADEMY_OWNER
      const mockHas = vi.fn().mockImplementation(({ role }) => role === ORG_ROLE.ACADEMY_OWNER);

      vi.mocked(auth).mockResolvedValue({
        userId: 'test-user-123',
        orgId: 'test-org-456',
        has: mockHas,
      } as any);

      const { guardRole } = await import('./AuthGuards');
      await guardRole(ORG_ROLE.ACADEMY_OWNER);

      // With role hierarchy, it should check ADMIN first, then ACADEMY_OWNER
      expect(mockHas).toHaveBeenCalledWith({ role: ORG_ROLE.ADMIN });
      expect(mockHas).toHaveBeenCalledWith({ role: ORG_ROLE.ACADEMY_OWNER });
    });

    it('should grant access if user has higher role than required', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      // User is ADMIN, requesting FRONT_DESK access
      const mockHas = vi.fn().mockImplementation(({ role }) => role === ORG_ROLE.ADMIN);

      vi.mocked(auth).mockResolvedValue({
        userId: 'test-user-123',
        orgId: 'test-org-456',
        has: mockHas,
      } as any);

      const { guardRole } = await import('./AuthGuards');
      const result = await guardRole(ORG_ROLE.FRONT_DESK);

      // Should succeed because ADMIN > FRONT_DESK
      expect(result.userId).toBe('test-user-123');
      expect(result.role).toBe(ORG_ROLE.FRONT_DESK);
    });

    it('should grant a FRONT_DESK-guarded endpoint to an ACADEMY_OWNER (payment/coupon access)', async () => {
      // Payment, coupon, and membership-lifecycle endpoints guard with
      // FRONT_DESK; ACADEMY_OWNER (and ADMIN) must inherit access.
      const { auth } = await import('@clerk/nextjs/server');
      const mockHas = vi.fn().mockImplementation(({ role }) => role === ORG_ROLE.ACADEMY_OWNER);

      vi.mocked(auth).mockResolvedValue({
        userId: 'owner-1',
        orgId: 'org-1',
        has: mockHas,
      } as any);

      const { guardRole } = await import('./AuthGuards');

      await expect(guardRole(ORG_ROLE.FRONT_DESK)).resolves.toMatchObject({ userId: 'owner-1' });
    });

    it('should throw 401 when not authenticated before checking role', async () => {
      const { auth } = await import('@clerk/nextjs/server');

      vi.mocked(auth).mockResolvedValue({
        userId: null,
        orgId: null,
        has: vi.fn(),
      } as any);

      const { guardRole } = await import('./AuthGuards');

      // Should throw 401 (from guardAuth) not 403
      await expect(guardRole(ORG_ROLE.ADMIN)).rejects.toMatchObject({
        status: 401,
      });
    });

    it('should place org:instructor between FRONT_DESK and MEMBER in the hierarchy', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      // User is ONLY an instructor.
      const mockHas = vi.fn().mockImplementation(({ role }) => role === ORG_ROLE.INSTRUCTOR);

      vi.mocked(auth).mockResolvedValue({
        userId: 'test-user-123',
        orgId: 'test-org-456',
        has: mockHas,
      } as any);

      const { guardRole } = await import('./AuthGuards');

      // An instructor satisfies INSTRUCTOR and the lower MEMBER role...
      const asMember = await guardRole(ORG_ROLE.MEMBER);

      expect(asMember.role).toBe(ORG_ROLE.MEMBER);

      const asInstructor = await guardRole(ORG_ROLE.INSTRUCTOR);

      expect(asInstructor.role).toBe(ORG_ROLE.INSTRUCTOR);

      // ...but NOT the higher FRONT_DESK role.
      await expect(guardRole(ORG_ROLE.FRONT_DESK)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('should work with all defined roles', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const mockHas = vi.fn().mockReturnValue(true);

      vi.mocked(auth).mockResolvedValue({
        userId: 'test-user-123',
        orgId: 'test-org-456',
        has: mockHas,
      } as any);

      const { guardRole } = await import('./AuthGuards');

      const roles = [
        ORG_ROLE.ADMIN,
        ORG_ROLE.ACADEMY_OWNER,
        ORG_ROLE.FRONT_DESK,
        ORG_ROLE.INSTRUCTOR,
        ORG_ROLE.MEMBER,
        ORG_ROLE.INDIVIDUAL_MEMBER,
      ];

      for (const role of roles) {
        const result = await guardRole(role);

        expect(result.role).toBe(role);
      }
    });
  });
});
