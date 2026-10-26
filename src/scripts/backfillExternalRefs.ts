/**
 * Backfill `tenant_external_ref` rows for provider ids that were created
 * before every payment path recorded them.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * Both payment webhooks route an event to its org by looking up the provider
 * id (subscription / transaction / customer) in `tenant_external_ref`. An id
 * with no ref is REFUSED — logged and dropped. Before the failed-payments work
 * these were never recorded:
 *   - subscriptions, customers and charges created by the KIOSK,
 *   - one-time cancellation / hold fees (`chargeOneTimeFee`),
 *   - recurring hold-fee subscriptions.
 * So a failed renewal for a member who signed up at the kiosk would never
 * reach the app. This script records the missing refs from the tenant data.
 *
 * Idempotent: every insert is ON CONFLICT DO NOTHING against the unique
 * (ref_type, ref_id) index. Synthetic `seed_*` ids are skipped.
 *
 * Usage:
 *   npx tsx src/scripts/backfillExternalRefs.ts            # dry run, every active tenant
 *   npx tsx src/scripts/backfillExternalRefs.ts --confirm  # write
 *   # Single-database dev (no control plane): name the org explicitly
 *   DATABASE_URL=... npx tsx src/scripts/backfillExternalRefs.ts --orgId=org_xxx [--confirm]
 */

import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import process from 'node:process';
import { and, eq, isNotNull, notLike } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { tenantExternalRefSchema } from '../models/ControlSchema';
import { memberMembershipSchema, memberSchema, transactionSchema } from '../models/Schema';
import { resolveTenantTargets } from './migrateTenants';

// The structural database type lets the same functions run on node-postgres
// (the CLI) and PGlite (the tests).
type AnyPgDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export type ExternalRef = { refType: string; refId: string; orgId: string };

const SEED_PREFIX = 'seed_%';

/** Every provider id in one org's tenant database that a webhook could carry. */
export async function collectRefs(tenantDb: AnyPgDb, orgId: string): Promise<ExternalRef[]> {
  const refs = new Map<string, ExternalRef>();
  const add = (refType: string, refId: string | null) => {
    if (refId && !refId.startsWith('seed_')) {
      refs.set(`${refType}:${refId}`, { refType, refId, orgId });
    }
  };

  const customers = await tenantDb
    .select({ id: memberSchema.providerCustomerId })
    .from(memberSchema)
    .where(and(
      eq(memberSchema.organizationId, orgId),
      isNotNull(memberSchema.providerCustomerId),
      notLike(memberSchema.providerCustomerId, SEED_PREFIX),
    ));
  customers.forEach(r => add('provider_customer', r.id));

  const subscriptions = await tenantDb
    .select({
      sub: memberMembershipSchema.providerSubscriptionId,
      holdSub: memberMembershipSchema.providerHoldFeeSubscriptionId,
    })
    .from(memberMembershipSchema)
    .innerJoin(memberSchema, eq(memberSchema.id, memberMembershipSchema.memberId))
    .where(eq(memberSchema.organizationId, orgId));
  subscriptions.forEach((r) => {
    add('provider_subscription', r.sub);
    add('provider_subscription', r.holdSub);
  });

  const transactions = await tenantDb
    .select({ id: transactionSchema.providerTransactionId })
    .from(transactionSchema)
    .where(and(
      eq(transactionSchema.organizationId, orgId),
      isNotNull(transactionSchema.providerTransactionId),
      notLike(transactionSchema.providerTransactionId, SEED_PREFIX),
    ));
  transactions.forEach(r => add('provider_transaction', r.id));

  return [...refs.values()];
}

/** Insert refs into the control plane; returns how many were new. */
export async function writeRefs(controlDb: AnyPgDb, refs: ExternalRef[]): Promise<number> {
  let inserted = 0;
  for (const ref of refs) {
    const rows = await controlDb
      .insert(tenantExternalRefSchema)
      .values(ref)
      .onConflictDoNothing()
      .returning({ refId: tenantExternalRefSchema.refId });
    inserted += rows.length;
  }
  return inserted;
}

export function parseArgs(argv: string[]): { confirm: boolean; orgId?: string } {
  const orgArg = argv.find(a => a.startsWith('--orgId='));
  return {
    confirm: argv.includes('--confirm'),
    ...(orgArg ? { orgId: orgArg.slice('--orgId='.length) } : {}),
  };
}

async function main(): Promise<void> {
  const { confirm, orgId } = parseArgs(process.argv.slice(2));
  const controlUrl = process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!controlUrl) {
    throw new Error('Set CONTROL_DATABASE_URL (or DATABASE_URL for single-database dev).');
  }

  let targets = await resolveTenantTargets();
  if (orgId) {
    targets = targets.filter(t => t.orgId === orgId);
    if (targets.length === 0 && process.env.DATABASE_URL) {
      targets = [{ orgId, connectionString: process.env.DATABASE_URL }];
    }
  }
  if (targets.length === 0) {
    console.info('No tenant databases found. In single-database dev, pass --orgId=org_xxx.');
    return;
  }

  const controlPool = new Pool({ connectionString: controlUrl, max: 1 });
  const controlDb = drizzle(controlPool);
  let total = 0;

  try {
    for (const target of targets) {
      const pool = new Pool({ connectionString: target.connectionString, max: 1 });
      try {
        const refs = await collectRefs(drizzle(pool), target.orgId);
        const written = confirm ? await writeRefs(controlDb, refs) : 0;
        total += written;
        console.info(`${target.orgId}: ${refs.length} provider ids${confirm ? `, ${written} new refs written` : ' (dry run)'}`);
      } finally {
        await pool.end().catch(() => {});
      }
    }
  } finally {
    await controlPool.end().catch(() => {});
  }

  console.info(confirm ? `Done. ${total} new refs.` : 'Dry run — re-run with --confirm to write.');
}

if (process.argv[1]?.endsWith('backfillExternalRefs.ts')) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
