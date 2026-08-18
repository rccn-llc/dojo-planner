import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  getIQProConfigForAdmin,
  MissingClientSecretError,
  updateIQProConfig,
} from '@/services/PaymentProviderConfigService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { UpdateIQProConfigValidation } from '@/validations/PaymentSettingsValidation';
import { guardRole } from './AuthGuards';

export const getConfig = os.handler(async () => {
  // ACADEMY_OWNER (which admits both academy_owner and admin) can VIEW the
  // current config; only ADMIN can mutate (see updateConfig below). The
  // returned projection never includes the secret value.
  const { orgId } = await guardRole(ORG_ROLE.ACADEMY_OWNER);
  return getIQProConfigForAdmin(orgId);
});

export const updateConfig = os
  .input(UpdateIQProConfigValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const diff = await updateIQProConfig(context.orgId, input);

      await audit(
        context,
        AUDIT_ACTION.IQPRO_CONFIG_UPDATE,
        AUDIT_ENTITY_TYPE.ORGANIZATION,
        {
          entityId: context.orgId,
          status: 'success',
          changes: {
            clientId: { before: undefined, after: diff.clientIdChanged ? '(changed)' : '(unchanged)' },
            clientSecret: { before: undefined, after: diff.clientSecretChanged ? '(changed)' : '(unchanged)' },
            gatewayId: { before: undefined, after: diff.gatewayIdChanged ? '(changed)' : '(unchanged)' },
          },
        },
      );

      return { success: true };
    } catch (error) {
      await audit(
        context,
        AUDIT_ACTION.IQPRO_CONFIG_UPDATE,
        AUDIT_ENTITY_TYPE.ORGANIZATION,
        {
          entityId: context.orgId,
          status: 'failure',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
      // A first-time save with no secret is a client mistake, not a server
      // fault — surface it as a 400 so the form can say what to fix.
      if (error instanceof MissingClientSecretError) {
        throw new ORPCError(error.message, { status: 400 });
      }
      throw error;
    }
  });
