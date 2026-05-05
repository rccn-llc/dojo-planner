import { os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  getOrganizationLocation,
  updateOrganizationLocation,
} from '@/services/OrganizationService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { UpdateLocationValidation } from '@/validations/OrganizationValidation';
import { guardRole } from './AuthGuards';

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
