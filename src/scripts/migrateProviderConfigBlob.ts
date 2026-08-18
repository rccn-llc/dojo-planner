/**
 * B3 data migration: carry per-org IQPro credentials from the three
 * `iqpro_config_*` columns into the single encrypted
 * `payment_provider_config_enc` blob.
 *
 * ── Run this BEFORE applying b3-forward.sql ─────────────────────────────────
 *
 * That DDL drops the legacy columns and aborts while any org still holds
 * credentials that have not been carried over — so the safe order is:
 *
 *   1. Deploy code that READS the blob (this branch).
 *   2. Run this script against each database (preview, then production).
 *   3. Apply `b3-forward.sql` by hand, which drops the columns.
 *
 * The backfill cannot be expressed in SQL: the blob is AES-256-GCM ciphertext
 * and the key (IQPRO_CONFIG_ENCRYPTION_KEY) lives in the app environment, not
 * the database.
 *
 * Idempotent — an org that already has a blob is skipped, so a re-run after a
 * partial failure is safe.
 *
 * ── Reversing ───────────────────────────────────────────────────────────────
 *
 * `--reverse` unpacks the blob BACK into the three columns, for a rollback.
 * Run it while the columns still exist (i.e. after `b3-rollback.sql` has
 * recreated them, or before `b3-forward.sql` dropped them) and while this code
 * can still read the blob.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... IQPRO_CONFIG_ENCRYPTION_KEY=... \
 *   npx tsx src/scripts/migrateProviderConfigBlob.ts [--dry-run] [--reverse]
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { decryptSecret, encryptSecret } from '@/libs/Crypto';
import { Env } from '@/libs/Env';
import { writeConfigBlob } from '@/services/PaymentProviderConfigService';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';

type LegacyRow = {
  id: string;
  iqpro_config_client_id: string | null;
  iqpro_config_client_secret_enc: string | null;
  iqpro_config_gateway_id: string | null;
  payment_provider_config_enc: string | null;
};

/**
 * Unpack the blob back into the three legacy columns, re-encrypting the secret
 * on its own the way the old schema stored it.
 *
 * Only IQPro blobs can be reversed — the legacy columns have no representation
 * for Square credentials. A Square org is reported and skipped rather than
 * silently losing its credentials, so you know what needs re-entering.
 */
async function runReverse(db: ReturnType<typeof drizzle>, dryRun: boolean): Promise<void> {
  const result = await db.execute<LegacyRow>(sql`
    SELECT id, iqpro_config_client_id, iqpro_config_client_secret_enc,
           iqpro_config_gateway_id, payment_provider_config_enc
    FROM "organization"
    WHERE "payment_provider_config_enc" IS NOT NULL
  `);

  let restored = 0;
  let unsupported = 0;

  for (const row of result.rows) {
    const blob = JSON.parse(decryptSecret(row.payment_provider_config_enc!)) as {
      provider: string;
      credentials: Record<string, string>;
    };

    if (blob.provider !== PAYMENT_PROVIDER.IQPRO) {
      console.warn(
        `  org ${row.id}: provider "${blob.provider}" has no legacy column representation — skipping. Re-enter its credentials after rolling back.`,
      );
      unsupported++;
      continue;
    }

    const { clientId, clientSecret, gatewayId } = blob.credentials;
    if (dryRun) {
      console.warn(`  org ${row.id}: would restore (clientId=${clientId}, gatewayId=${gatewayId})`);
    } else {
      await db.execute(sql`
        UPDATE "organization"
        SET "iqpro_config_client_id" = ${clientId},
            "iqpro_config_client_secret_enc" = ${encryptSecret(clientSecret!)},
            "iqpro_config_gateway_id" = ${gatewayId}
        WHERE id = ${row.id}
      `);
    }
    restored++;
  }

  console.warn(`\n${dryRun ? '[dry run] ' : ''}Reverse done. restored=${restored} unsupported=${unsupported}`);
  if (unsupported > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const reverse = process.argv.includes('--reverse');

  if (!Env.DATABASE_URL) {
    console.error('DATABASE_URL must be set.');
    process.exit(1);
  }
  if (!Env.IQPRO_CONFIG_ENCRYPTION_KEY) {
    console.error('IQPRO_CONFIG_ENCRYPTION_KEY must be set — the blob is encrypted with it.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: Env.DATABASE_URL, max: 1 });
  const db = drizzle(pool);

  try {
    // Both directions need the legacy columns to exist. Forward: they are the
    // source. Reverse: they are the destination, so `b3-rollback.sql` must
    // have recreated them first.
    const cols = await db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'organization' AND column_name = 'iqpro_config_client_id'
    `);
    if (cols.rows.length === 0) {
      console.warn(
        reverse
          ? 'iqpro_config_* columns do not exist. Run b3-rollback.sql first to recreate them, then re-run with --reverse.'
          : 'iqpro_config_* columns are already gone — b3-forward.sql has been applied. Nothing to do.',
      );
      return;
    }

    if (reverse) {
      await runReverse(db, dryRun);
      return;
    }

    const result = await db.execute<LegacyRow>(sql`
      SELECT id, iqpro_config_client_id, iqpro_config_client_secret_enc,
             iqpro_config_gateway_id, payment_provider_config_enc
      FROM "organization"
    `);

    let migrated = 0;
    let skipped = 0;
    let incomplete = 0;

    for (const row of result.rows) {
      if (row.payment_provider_config_enc) {
        skipped++;
        continue;
      }

      const clientId = row.iqpro_config_client_id;
      const gatewayId = row.iqpro_config_gateway_id;
      const secretEnc = row.iqpro_config_client_secret_enc;

      if (!clientId && !gatewayId && !secretEnc) {
        skipped++; // never configured — resolves from env, nothing to carry
        continue;
      }

      // A partially-populated legacy row cannot become a valid blob (its schema
      // requires all three). Report it rather than writing something the
      // resolver would reject at read time — these orgs were relying on a
      // per-field env fallback that the blob does not reproduce.
      if (!clientId || !gatewayId || !secretEnc) {
        console.warn(
          `  org ${row.id}: INCOMPLETE legacy credentials (clientId=${!!clientId} secret=${!!secretEnc} gatewayId=${!!gatewayId}) — skipping. It will fall back to IQPRO_* env vars; re-enter credentials in Payment Settings.`,
        );
        incomplete++;
        continue;
      }

      // Decrypt with the same key we re-encrypt under: this proves the stored
      // ciphertext is readable BEFORE the source columns are dropped. A throw
      // here stops the run with the data still intact.
      const clientSecret = decryptSecret(secretEnc);
      const blob = writeConfigBlob({
        provider: PAYMENT_PROVIDER.IQPRO,
        credentials: { clientId, clientSecret, gatewayId },
      });

      if (dryRun) {
        console.warn(`  org ${row.id}: would migrate (clientId=${clientId}, gatewayId=${gatewayId})`);
      } else {
        await db.execute(sql`
          UPDATE "organization"
          SET "payment_provider_config_enc" = ${blob},
              "payment_provider" = ${PAYMENT_PROVIDER.IQPRO}
          WHERE id = ${row.id}
        `);
      }
      migrated++;
    }

    console.warn(
      `\n${dryRun ? '[dry run] ' : ''}Done. migrated=${migrated} skipped=${skipped} incomplete=${incomplete} (of ${result.rows.length} orgs)`,
    );
    if (incomplete > 0) {
      console.warn(
        `\n⚠️  ${incomplete} org(s) had partial credentials and were NOT migrated. b3-forward.sql will abort until they are resolved — either complete them in Payment Settings or clear the leftover columns.`,
      );
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrateProviderConfigBlob] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
