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
import { encryptSecret } from '@/libs/Crypto';
import { Env } from '@/libs/Env';
import { organizationSchema } from '@/models/Schema';

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

  const pool = new Pool({ connectionString: Env.DATABASE_URL });
  const db = drizzle(pool);

  const encrypted = encryptSecret(Env.IQPRO_CLIENT_SECRET);

  // Upsert: keep the row if it exists, only updating the IQPro config columns.
  const { eq } = await import('drizzle-orm');
  const existing = await db.select().from(organizationSchema).where(eq(organizationSchema.id, orgId)).limit(1);
  if (existing.length === 0) {
    console.error(`Organization ${orgId} does not exist in the database. Aborting.`);
    process.exit(1);
  }

  await db
    .update(organizationSchema)
    .set({
      iqproConfigClientId: Env.IQPRO_CLIENT_ID,
      iqproConfigClientSecretEncrypted: encrypted,
      iqproConfigGatewayId: Env.IQPRO_GATEWAY_ID,
    })
    .where(eq(organizationSchema.id, orgId));

  console.info(`Backfilled IQPro config for organization ${orgId}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
