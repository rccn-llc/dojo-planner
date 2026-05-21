import { auth } from '@clerk/nextjs/server';
import { ORPCError, os } from '@orpc/server';
import { audit } from '@/services/AuditService';
import {
  getPlatformConfigForAdmin,
  updatePlatformConfig,
} from '@/services/IQProConfigService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import { isSuperAdmin } from '@/utils/SuperAdmins';
import { UpdateIQProConfigValidation } from '@/validations/PaymentSettingsValidation';
import { guardRole } from './AuthGuards';

async function requireSuperAdmin(): Promise<{ userId: string; orgId: string; username: string }> {
  const context = await guardRole(ORG_ROLE.ADMIN);
  const { sessionClaims } = await auth();
  const username = (sessionClaims as Record<string, unknown> | null)?.username as string | undefined;
  if (!isSuperAdmin(username)) {
    throw new ORPCError('Platform settings can only be modified by super admins.', { status: 403 });
  }
  return { userId: context.userId, orgId: context.orgId, username: username! };
}

export const getPlatformConfig = os.handler(async () => {
  await requireSuperAdmin();
  return getPlatformConfigForAdmin();
});

export const updatePlatformConfigHandler = os
  .input(UpdateIQProConfigValidation)
  .handler(async ({ input }) => {
    const su = await requireSuperAdmin();
    const context = { userId: su.userId, orgId: su.orgId, role: ORG_ROLE.ADMIN } as const;

    try {
      const diff = await updatePlatformConfig(input);

      await audit(
        context,
        AUDIT_ACTION.PLATFORM_IQPRO_CONFIG_UPDATE,
        AUDIT_ENTITY_TYPE.ORGANIZATION,
        {
          entityId: 'platform',
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
        AUDIT_ACTION.PLATFORM_IQPRO_CONFIG_UPDATE,
        AUDIT_ENTITY_TYPE.ORGANIZATION,
        {
          entityId: 'platform',
          status: 'failure',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
      throw error;
    }
  });
