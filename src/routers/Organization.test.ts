import type { AuditContext } from '@/types/Audit';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
vi.mock('@/services/OrganizationService', async () => {
  const actual = await vi.importActual<typeof import('@/services/OrganizationService')>('@/services/OrganizationService');
  return {
    ...actual,
    getOrganizationLocation: vi.fn(),
    updateOrganizationLocation: vi.fn(),
  };
});

const academyOwnerContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.ACADEMY_OWNER,
};
const frontDeskContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.FRONT_DESK,
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

const fakeLocation = {
  name: 'Main Dojo',
  address: '500 Market St',
  phone: '555-0100',
  email: 'hello@dojo.test',
};

const validUpdateInput = {
  name: 'Main Dojo',
  address: '500 Market St',
  phone: '555-0100',
  email: 'hello@dojo.test',
};

describe('Organization Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLocation', () => {
    it('returns the persisted location for FRONT_DESK or higher', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationLocation } = await import('@/services/OrganizationService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(getOrganizationLocation).mockResolvedValue(fakeLocation);

      const { getLocation } = await import('./Organization');
      const result = await callHandler(getLocation);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(result).toEqual({ location: fakeLocation });
    });
  });

  describe('updateLocation', () => {
    it('persists the location and emits a success audit', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateOrganizationLocation } = await import('@/services/OrganizationService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(updateOrganizationLocation).mockResolvedValue(fakeLocation);

      const { updateLocation } = await import('./Organization');
      const result = await callHandler(updateLocation, validUpdateInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.ORGANIZATION_LOCATION_UPDATE,
        AUDIT_ENTITY_TYPE.ORGANIZATION,
        expect.objectContaining({ entityId: 'org-1', status: 'success' }),
      );
      expect(result).toEqual({ location: fakeLocation });
    });

    it('emits a failure audit and rethrows when persistence fails', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateOrganizationLocation } = await import('@/services/OrganizationService');
      const { audit } = await import('@/services/AuditService');
      vi.mocked(guardRole).mockResolvedValue(academyOwnerContext);
      vi.mocked(updateOrganizationLocation).mockRejectedValue(new Error('db down'));

      const { updateLocation } = await import('./Organization');

      await expect(callHandler(updateLocation, validUpdateInput)).rejects.toThrow('db down');
      expect(audit).toHaveBeenCalledWith(
        academyOwnerContext,
        AUDIT_ACTION.ORGANIZATION_LOCATION_UPDATE,
        AUDIT_ENTITY_TYPE.ORGANIZATION,
        expect.objectContaining({ entityId: 'org-1', status: 'failure', error: 'db down' }),
      );
    });
  });
});
