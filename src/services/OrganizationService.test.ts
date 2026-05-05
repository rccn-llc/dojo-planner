import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  query: {
    organizationSchema: {
      findFirst: vi.fn(),
    },
  },
  insert: vi.fn(),
};

vi.mock('@/libs/DB', () => ({ db: dbMock }));

vi.mock('@/models/Schema', () => ({
  organizationSchema: {
    id: 'id',
  },
}));

describe('OrganizationService.location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrganizationLocation', () => {
    it('returns the persisted location values', async () => {
      vi.mocked(dbMock.query.organizationSchema.findFirst).mockResolvedValueOnce({
        locationName: 'Main Dojo',
        locationAddress: '500 Market St',
        locationPhone: '555-0100',
        locationEmail: 'hello@dojo.test',
      });

      const { getOrganizationLocation } = await import('./OrganizationService');
      const result = await getOrganizationLocation('org-1');

      expect(result).toEqual({
        name: 'Main Dojo',
        address: '500 Market St',
        phone: '555-0100',
        email: 'hello@dojo.test',
      });
    });

    it('returns nulls when the org has no row yet', async () => {
      vi.mocked(dbMock.query.organizationSchema.findFirst).mockResolvedValueOnce(undefined);

      const { getOrganizationLocation } = await import('./OrganizationService');
      const result = await getOrganizationLocation('org-empty');

      expect(result).toEqual({ name: null, address: null, phone: null, email: null });
    });

    it('returns nulls when individual fields are missing', async () => {
      vi.mocked(dbMock.query.organizationSchema.findFirst).mockResolvedValueOnce({
        locationName: null,
        locationAddress: null,
        locationPhone: null,
        locationEmail: null,
      });

      const { getOrganizationLocation } = await import('./OrganizationService');
      const result = await getOrganizationLocation('org-2');

      expect(result).toEqual({ name: null, address: null, phone: null, email: null });
    });
  });

  describe('updateOrganizationLocation', () => {
    it('upserts the location and returns the input', async () => {
      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
      dbMock.insert.mockReturnValue({ values });

      const { updateOrganizationLocation } = await import('./OrganizationService');
      const result = await updateOrganizationLocation('org-1', {
        name: 'New Name',
        address: '1 New Way',
        phone: '555-9999',
        email: 'new@dojo.test',
      });

      expect(values).toHaveBeenCalledWith(expect.objectContaining({
        id: 'org-1',
        locationName: 'New Name',
        locationAddress: '1 New Way',
        locationPhone: '555-9999',
        locationEmail: 'new@dojo.test',
      }));
      expect(onConflictDoUpdate).toHaveBeenCalled();
      expect(result).toEqual({
        name: 'New Name',
        address: '1 New Way',
        phone: '555-9999',
        email: 'new@dojo.test',
      });
    });
  });
});
