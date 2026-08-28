/**
 * One-shot script to backfill a specific organization's IQPro configuration
 * columns from the legacy IQPRO_* environment variables.
 *
 * Run this when migrating an org from env-var-based IQPro config to the new
 * per-org Payment Settings storage. The org's existing values in DB are
 * OVERWRITTEN with what's in env. Run once, then optionally remove the env
 * vars from the deployment.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... IQPRO_CLIENT_ID=... IQPRO_CLIENT_SECRET=... \
 *   IQPRO_GATEWAY_ID=... IQPRO_CONFIG_ENCRYPTION_KEY=... \
 *   npx tsx src/scripts/backfillIQProConfig.ts --orgId=org_xxx
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Env } from '@/libs/Env';
import { organizationSchema } from '@/models/Schema';
import { writeConfigBlob } from '@/services/PaymentProviderConfigService';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';

async function main() {
  const orgIdArg = process.argv.find(a => a.startsWith('--orgId='));
  const orgId = orgIdArg?.split('=')[1];
  if (!orgId) {
    console.error('Usage: tsx src/scripts/backfillIQProConfig.ts --orgId=org_xxx');
    process.exit(1);
  }

  if (!Env.IQPRO_CLIENT_ID || !Env.IQPRO_CLIENT_SECRET || !Env.IQPRO_GATEWAY_ID) {
    console.error('IQPRO_CLIENT_ID, IQPRO_CLIENT_SECRET, and IQPRO_GATEWAY_ID env vars must all be set.');
    process.exit(1);
  }
  if (!Env.IQPRO_CONFIG_ENCRYPTION_KEY) {
    console.error('IQPRO_CONFIG_ENCRYPTION_KEY must be set so the client secret can be encrypted at rest.');
    process.exit(1);
  }

  // This script targets ONE database directly — pass the org's own database,
  // or the control plane for platform config. DATABASE_URL is only a local
  // convenience now that every org has its own.
  const connectionString = Env.DATABASE_URL ?? Env.CONTROL_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set DATABASE_URL to the database this backfill should write to.');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  // One encrypted blob rather than three columns (B3).
  const encrypted = writeConfigBlob({
    provider: PAYMENT_PROVIDER.IQPRO,
    credentials: {
      clientId: Env.IQPRO_CLIENT_ID,
      clientSecret: Env.IQPRO_CLIENT_SECRET,
      gatewayId: Env.IQPRO_GATEWAY_ID,
    },
  });

  // Upsert: keep the row if it exists, only updating the payment config.
  const { eq } = await import('drizzle-orm');
  const existing = await db.select().from(organizationSchema).where(eq(organizationSchema.id, orgId)).limit(1);
  if (existing.length === 0) {
    console.error(`Organization ${orgId} does not exist in the database. Aborting.`);
    process.exit(1);
  }

  await db
    .update(organizationSchema)
    .set({
      paymentProvider: PAYMENT_PROVIDER.IQPRO,
      paymentProviderConfigEncrypted: encrypted,
    })
    .where(eq(organizationSchema.id, orgId));

  console.info(`Backfilled IQPro config for organization ${orgId}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
