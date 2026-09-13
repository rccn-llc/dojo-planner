import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  getPaymentProviderConfigForAdmin,
  MissingClientSecretError,
  ProviderSwitchBlockedError,
  updatePaymentProviderConfig,
} from '@/services/PaymentProviderConfigService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { UpdatePaymentProviderConfigValidation } from '@/validations/PaymentSettingsValidation';
import { guardRole } from './AuthGuards';

export const getConfig = os.handler(async () => {
  // ACADEMY_OWNER (which admits both academy_owner and admin) can VIEW the
  // current config; only ADMIN can mutate (see updateConfig below). The
  // returned projection never includes any secret value.
  const { orgId } = await guardRole(ORG_ROLE.ACADEMY_OWNER);
  return getPaymentProviderConfigForAdmin(orgId);
});

export const updateConfig = os
  .input(UpdatePaymentProviderConfigValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ADMIN);

    try {
      const diff = await updatePaymentProviderConfig(context.orgId, input);

      // A provider switch moves where this org's money goes, so it is audited
      // as its own action rather than buried in a credential-update diff.
      await audit(
        context,
        diff.providerChanged ? AUDIT_ACTION.PAYMENT_PROVIDER_CHANGE : AUDIT_ACTION.IQPRO_CONFIG_UPDATE,
        AUDIT_ENTITY_TYPE.ORGANIZATION,
        {
          entityId: context.orgId,
          status: 'success',
          changes: {
            // Values are never recorded — only whether each part moved.
            provider: { before: undefined, after: diff.providerChanged ? input.provider : '(unchanged)' },
            credentials: { before: undefined, after: diff.credentialsChanged ? '(changed)' : '(unchanged)' },
            secret: { before: undefined, after: diff.secretChanged ? '(changed)' : '(unchanged)' },
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
      // Both of these are client mistakes, not server faults — surface them as
      // 400s so the form can say what to fix.
      if (error instanceof MissingClientSecretError || error instanceof ProviderSwitchBlockedError) {
        throw new ORPCError(error.message, { status: 400 });
      }
      throw error;
    }
  });
