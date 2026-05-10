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
        locationAddress: '500 Market St',
        locationPhone: '555-0100',
        locationEmail: 'hello@dojo.test',
        locationTaxRate: 3.75,
      });

      const { getOrganizationLocation } = await import('./OrganizationService');
      const result = await getOrganizationLocation('org-1');

      expect(result).toEqual({
        address: '500 Market St',
        phone: '555-0100',
        email: 'hello@dojo.test',
        taxRate: 3.75,
      });
    });

    it('returns nulls and 0 tax rate when the org has no row yet', async () => {
      vi.mocked(dbMock.query.organizationSchema.findFirst).mockResolvedValueOnce(undefined);

      const { getOrganizationLocation } = await import('./OrganizationService');
      const result = await getOrganizationLocation('org-empty');

      expect(result).toEqual({ address: null, phone: null, email: null, taxRate: 0 });
    });

    it('returns nulls and 0 when individual fields are missing', async () => {
      vi.mocked(dbMock.query.organizationSchema.findFirst).mockResolvedValueOnce({
        locationAddress: null,
        locationPhone: null,
        locationEmail: null,
        locationTaxRate: null,
      });

      const { getOrganizationLocation } = await import('./OrganizationService');
      const result = await getOrganizationLocation('org-2');

      expect(result).toEqual({ address: null, phone: null, email: null, taxRate: 0 });
    });
  });

  describe('updateOrganizationLocation', () => {
    it('upserts the location with tax rate and returns the input', async () => {
      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
      dbMock.insert.mockReturnValue({ values });

      const { updateOrganizationLocation } = await import('./OrganizationService');
      const result = await updateOrganizationLocation('org-1', {
        address: '1 New Way',
        phone: '555-9999',
        email: 'new@dojo.test',
        taxRate: 5.25,
      });

      expect(values).toHaveBeenCalledWith(expect.objectContaining({
        id: 'org-1',
        locationAddress: '1 New Way',
        locationPhone: '555-9999',
        locationEmail: 'new@dojo.test',
        locationTaxRate: 5.25,
      }));
      expect(onConflictDoUpdate).toHaveBeenCalled();
      expect(result).toEqual({
        address: '1 New Way',
        phone: '555-9999',
        email: 'new@dojo.test',
        taxRate: 5.25,
      });
    });
  });

  describe('getOrganizationTaxRate', () => {
    it('returns the persisted tax rate', async () => {
      vi.mocked(dbMock.query.organizationSchema.findFirst).mockResolvedValueOnce({
        locationTaxRate: 7.5,
      });

      const { getOrganizationTaxRate } = await import('./OrganizationService');
      const result = await getOrganizationTaxRate('org-1');

      expect(result).toBe(7.5);
    });

    it('returns 0 when the org row is missing', async () => {
      vi.mocked(dbMock.query.organizationSchema.findFirst).mockResolvedValueOnce(undefined);

      const { getOrganizationTaxRate } = await import('./OrganizationService');
      const result = await getOrganizationTaxRate('org-missing');

      expect(result).toBe(0);
    });

    it('returns 0 when locationTaxRate is null', async () => {
      vi.mocked(dbMock.query.organizationSchema.findFirst).mockResolvedValueOnce({
        locationTaxRate: null,
      });

      const { getOrganizationTaxRate } = await import('./OrganizationService');
      const result = await getOrganizationTaxRate('org-null');

      expect(result).toBe(0);
    });
  });
});
