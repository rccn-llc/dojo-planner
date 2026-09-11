/**
 * Point ONE organization at Square, using credentials from the SQUARE_* env
 * vars. The mirror of `backfillIQProConfig.ts`.
 *
 * This exists because there is no admin UI for choosing a payment provider
 * yet (that is phase B8), so a Square org can otherwise only be created by
 * hand-writing an AES-GCM blob. Local and sandbox testing needs it.
 *
 * ⚠️ Writes to the TENANT database — `payment_provider` and
 * `payment_provider_config_enc` are tenant-plane columns. Point DATABASE_URL
 * at the org's own database, not the control plane.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... IQPRO_CONFIG_ENCRYPTION_KEY=... \
 *   SQUARE_ACCESS_TOKEN=... SQUARE_APPLICATION_ID=... SQUARE_LOCATION_ID=... \
 *   SQUARE_ENVIRONMENT=sandbox SQUARE_WEBHOOK_SIGNATURE_KEY=... \
 *   npx tsx src/scripts/setSquareConfig.ts --orgId=org_xxx
 *
 * To put the org back on IQPro, run `backfillIQProConfig.ts` for it.
 */

import { Buffer } from 'node:buffer';
import { createCipheriv, randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { organizationSchema } from '@/models/Schema';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';

// Read from raw process.env rather than `@/libs/Env`. Importing that module
// validates the WHOLE server schema — Stripe keys, BILLING_PLAN_ENV and the
// rest — which an operator flipping one org to Square has no reason to have
// set. `seed.ts` avoids the strict schema for the same reason.
const env = process.env;

/**
 * AES-256-GCM, byte-identical to `libs/Crypto.ts`: base64(iv | authTag | data).
 *
 * Inlined rather than imported because `Crypto.ts` — and every module that
 * re-exports it — pulls in the strict `Env` schema.
 */
function encryptSecret(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

async function main() {
  const orgIdArg = process.argv.find(a => a.startsWith('--orgId='));
  const orgId = orgIdArg?.split('=')[1];
  if (!orgId) {
    console.error('Usage: tsx src/scripts/setSquareConfig.ts --orgId=org_xxx');
    process.exit(1);
  }

  if (
    !env.SQUARE_ACCESS_TOKEN
    || !env.SQUARE_APPLICATION_ID
    || !env.SQUARE_LOCATION_ID
    || !env.SQUARE_ENVIRONMENT
    || !env.SQUARE_WEBHOOK_SIGNATURE_KEY
  ) {
    console.error(
      'All five SQUARE_* env vars must be set: SQUARE_ACCESS_TOKEN, SQUARE_APPLICATION_ID, '
      + 'SQUARE_LOCATION_ID, SQUARE_ENVIRONMENT, SQUARE_WEBHOOK_SIGNATURE_KEY.',
    );
    process.exit(1);
  }
  if (!env.IQPRO_CONFIG_ENCRYPTION_KEY) {
    console.error('IQPRO_CONFIG_ENCRYPTION_KEY must be set so the access token can be encrypted at rest.');
    process.exit(1);
  }

  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set DATABASE_URL to the tenant database this should write to.');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  const encrypted = encryptSecret(
    JSON.stringify({
      provider: PAYMENT_PROVIDER.SQUARE,
      credentials: {
        accessToken: env.SQUARE_ACCESS_TOKEN,
        applicationId: env.SQUARE_APPLICATION_ID,
        locationId: env.SQUARE_LOCATION_ID,
        environment: env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
        webhookSignatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY,
      },
    }),
    env.IQPRO_CONFIG_ENCRYPTION_KEY,
  );

  const { eq } = await import('drizzle-orm');
  const existing = await db.select().from(organizationSchema).where(eq(organizationSchema.id, orgId)).limit(1);
  if (existing.length === 0) {
    console.error(`Organization ${orgId} does not exist in this database. Aborting.`);
    process.exit(1);
  }

  await db
    .update(organizationSchema)
    .set({
      paymentProvider: PAYMENT_PROVIDER.SQUARE,
      paymentProviderConfigEncrypted: encrypted,
    })
    .where(eq(organizationSchema.id, orgId));

  console.info(`Organization ${orgId} now uses Square (${env.SQUARE_ENVIRONMENT}).`);
  console.info('ACH is hidden for this org in both apps; Square is card-only.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
