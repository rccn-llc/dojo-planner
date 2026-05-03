import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  select: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  signedWaiverSchema: {
    organizationId: 'organization_id',
    signedAt: 'signed_at',
  },
  membershipWaiverSchema: {
    waiverTemplateId: 'waiver_template_id',
    membershipPlanId: 'membership_plan_id',
  },
  waiverTemplateSchema: {
    id: 'id',
    organizationId: 'organization_id',
  },
  // The service module imports several other schema names; provide stubs so
  // the dynamic import doesn't blow up on missing keys.
  waiverMergeFieldSchema: { id: 'id', organizationId: 'organization_id' },
  membershipPlanSchema: { id: 'id', name: 'name', organizationId: 'organization_id' },
}));

describe('WaiversService dashboard stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('countSignedWaiversThisMonth', () => {
    it('returns the count of signed waivers in the current month', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([{ count: 17 }]) }),
      });

      const { countSignedWaiversThisMonth } = await import('./WaiversService');
      const count = await countSignedWaiversThisMonth('org-1');

      expect(count).toBe(17);
    });

    it('returns 0 when there are no signed waivers', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }),
      });

      const { countSignedWaiversThisMonth } = await import('./WaiversService');

      expect(await countSignedWaiversThisMonth('org-1')).toBe(0);
    });

    it('returns 0 when the result row is missing', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([]) }),
      });

      const { countSignedWaiversThisMonth } = await import('./WaiversService');

      expect(await countSignedWaiversThisMonth('org-1')).toBe(0);
    });
  });

  describe('countMembershipsUsingWaivers', () => {
    it('returns the count of distinct membership plans with at least one waiver', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([{ count: 4 }]),
          }),
        }),
      });

      const { countMembershipsUsingWaivers } = await import('./WaiversService');

      expect(await countMembershipsUsingWaivers('org-1')).toBe(4);
    });

    it('returns 0 when no membership plans have waivers', async () => {
      dbMock.select.mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([{ count: 0 }]),
          }),
        }),
      });

      const { countMembershipsUsingWaivers } = await import('./WaiversService');

      expect(await countMembershipsUsingWaivers('org-1')).toBe(0);
    });
  });
});
