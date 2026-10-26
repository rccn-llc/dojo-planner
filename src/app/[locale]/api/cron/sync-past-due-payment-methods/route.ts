import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { controlDb } from '@/libs/ControlDb';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { runWithTenant } from '@/libs/TenantContext';
import { TENANT_STATUS, tenantSchema } from '@/models/ControlSchema';
import { syncPastDuePaymentMethods } from '@/services/PaymentMethodSyncService';
import { resolvePaymentProviderConfig } from '@/services/PaymentProviderConfigService';
import { getDbForOrg } from '@/services/TenantDirectoryService';

/**
 * Daily: reconcile the saved card of every past-due member, in every active
 * org, against the card on their subscription at the payment provider.
 *
 * Catches card updates nothing else surfaced — IQPro sends no webhook when a
 * member updates their card through its failed-payment email, and the member
 * detail page only syncs when someone opens it. Scheduled in vercel.json.
 *
 * Vercel Cron authenticates with `Authorization: Bearer $CRON_SECRET`. With no
 * secret configured the route refuses everything rather than run open.
 */
function authorized(request: Request): boolean {
  const secret = Env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const header = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const GET = async (request: Request) => {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenants = await controlDb
    .select({ orgId: tenantSchema.orgId })
    .from(tenantSchema)
    .where(eq(tenantSchema.status, TENANT_STATUS.ACTIVE));

  const results: Array<{ orgId: string; checked?: number; changed?: number; failed?: number; error?: string }> = [];

  for (const { orgId } of tenants) {
    try {
      const tenantDb = await getDbForOrg(orgId);
      const summary = await runWithTenant({ orgId, db: tenantDb, source: 'cron' }, async () => {
        const config = await resolvePaymentProviderConfig(orgId);
        return config ? syncPastDuePaymentMethods(orgId, config) : null;
      });
      results.push(summary ? { orgId, ...summary } : { orgId, checked: 0, changed: 0, failed: 0 });
    } catch (error) {
      // One org's failure must not stop the rest.
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[Cron] Past-due payment-method sync failed for org', { orgId, error: message });
      results.push({ orgId, error: message });
    }
  }

  logger.info('[Cron] Past-due payment-method sync complete', { orgs: results.length, results });
  return NextResponse.json({ orgs: results.length, results });
};
