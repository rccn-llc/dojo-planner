import { os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import { getUserOrganizationIds } from '@/services/ClerkRolesService';
import {
  getOrganizationLocation,
  updateOrganizationLocation,
} from '@/services/OrganizationService';
import { filterProvisionedOrgs } from '@/services/TenantDirectoryService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { UpdateLocationValidation } from '@/validations/OrganizationValidation';
import { guardAuth, guardRole } from './AuthGuards';

export const getLocation = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
  const location = await getOrganizationLocation(orgId);
  return { location };
});

export const updateLocation = os
  .input(UpdateLocationValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const location = await updateOrganizationLocation(context.orgId, input);

      await audit(
        context,
        AUDIT_ACTION.ORGANIZATION_LOCATION_UPDATE,
        AUDIT_ENTITY_TYPE.ORGANIZATION,
        {
          entityId: context.orgId,
          status: 'success',
        },
      );

      return { location };
    } catch (error) {
      await audit(
        context,
        AUDIT_ACTION.ORGANIZATION_LOCATION_UPDATE,
        AUDIT_ENTITY_TYPE.ORGANIZATION,
        {
          entityId: context.orgId,
          status: 'failure',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
      throw error;
    }
  });

/**
 * The caller's organizations that actually have a database.
 *
 * The switcher lists Clerk memberships, but an organization with no tenant row
 * cannot be served — `resolveTenant` fails closed, so selecting one would 409
 * the dashboard. This lets the UI omit that dead end.
 *
 * ⚠️ Membership is verified SERVER-SIDE against Clerk rather than trusting the
 * ids the client sends. Without that, anyone could probe which arbitrary
 * organization ids exist in the tenant directory.
 */
export const listProvisioned = os.handler(async () => {
  const { userId } = await guardAuth();

  const memberships = await getUserOrganizationIds(userId);
  if (memberships.length === 0) {
    return { orgIds: [] };
  }

  return { orgIds: await filterProvisionedOrgs(memberships) };
});
