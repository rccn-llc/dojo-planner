/**
 * One-shot script to backfill the singleton platform_config row with the
 * IQPro credentials used for SaaS billing — copies the values from the
 * legacy IQPRO_* environment variables into the encrypted DB row.
 *
 * Run this when migrating dojo-planner's own SaaS-billing IQPro credentials
 * from env vars to the new Platform Settings UI. Idempotent: re-running
 * upserts the singleton row.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... IQPRO_CLIENT_ID=... IQPRO_CLIENT_SECRET=... \
 *   IQPRO_GATEWAY_ID=... IQPRO_CONFIG_ENCRYPTION_KEY=... \
 *   npx tsx src/scripts/backfillPlatformIQProConfig.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { encryptSecret } from '@/libs/Crypto';
import { Env } from '@/libs/Env';
import { platformConfigSchema } from '@/models/Schema';

async function main() {
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

  const encrypted = encryptSecret(Env.IQPRO_CLIENT_SECRET);

  await db
    .insert(platformConfigSchema)
    .values({
      id: 'singleton',
      saasProviderClientId: Env.IQPRO_CLIENT_ID,
      saasProviderClientSecretEncrypted: encrypted,
      saasProviderGatewayId: Env.IQPRO_GATEWAY_ID,
    })
    .onConflictDoUpdate({
      target: platformConfigSchema.id,
      set: {
        saasProviderClientId: Env.IQPRO_CLIENT_ID,
        saasProviderClientSecretEncrypted: encrypted,
        saasProviderGatewayId: Env.IQPRO_GATEWAY_ID,
      },
    });

  console.info('Backfilled platform_config singleton with IQPro SaaS credentials.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
