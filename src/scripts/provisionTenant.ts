/**
 * Provision ONE organization onto its own Neon database.
 *
 * ── Ordering is the safety property ─────────────────────────────────────────
 *
 * Every step happens before the row becomes servable:
 *
 *   1. Create the Neon project (or accept a connection string you supply).
 *   2. Insert the `tenant` row as status='provisioning' — NOT servable.
 *   3. Apply the baseline to the new database.
 *   4. Verify it is a distinct, reachable database that no other org holds.
 *   5. Flip to status='active'.
 *
 * A failure at any point leaves a non-servable row rather than an org routed at
 * an empty or shared database. `resolveTenant` refuses anything that is not
 * exactly 'active', so a half-provisioned tenant 503s instead of leaking.
 *
 * ── Credentials ─────────────────────────────────────────────────────────────
 *
 * NEON_API_KEY belongs in .env.local and NEVER in Vercel. It can delete any
 * project in the account, including the shared database — the deployed app has
 * no reason to hold that power. Reads process.env directly rather than
 * `@/libs/Env` so an operator does not need a fully validated app environment
 * to run it.
 *
 * An ORGANIZATION-scoped key (preferable to a personal one) additionally
 * requires NEON_ORG_ID on every call — Neon rejects the request with a 400
 * otherwise. Find it on the Neon organization settings page; it looks like
 * `org-something-12345678` and is unrelated to a Clerk org id.
 *
 * Usage:
 *   npx tsx src/scripts/provisionTenant.ts --orgId=org_xxx [--region=aws-us-east-1]
 *   npx tsx src/scripts/provisionTenant.ts --orgId=org_xxx --connection-string=postgres://...
 *   ... --dry-run
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { decryptConnectionString, encryptConnectionString, SHARED_DATABASE_SENTINEL, tenantEncryptionKey } from '../libs/TenantCrypto';
import { TENANT_STATUS, tenantSchema } from '../models/ControlSchema';

const NEON_API = 'https://console.neon.tech/api/v2';
const MIGRATIONS_FOLDER = path.join(process.cwd(), 'migrations');

/** Load .env.local then .env; values already in the environment win. */
function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(process.cwd(), file);
    if (!existsSync(full)) {
      continue;
    }
    for (const rawLine of readFileSync(full, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        continue;
      }
      const key = line.slice(0, eqIdx).trim();
      if (process.env[key] !== undefined) {
        continue;
      }
      let value = line.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

type Args = {
  orgId: string;
  region: string;
  connectionString: string | null;
  dryRun: boolean;
};

function parseArgs(): Args {
  const get = (name: string) =>
    process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

  const orgId = get('orgId');
  if (!orgId) {
    throw new Error('Usage: tsx src/scripts/provisionTenant.ts --orgId=org_xxx [--region=...] [--connection-string=...] [--dry-run]');
  }

  return {
    orgId,
    region: get('region') ?? 'aws-us-east-1',
    connectionString: get('connection-string') ?? null,
    dryRun: process.argv.includes('--dry-run'),
  };
}

type NeonProject = {
  projectId: string;
  branchId: string;
  connectionString: string;
};

/**
 * Create a Neon project and return its POOLED connection string.
 *
 * Pooled matters: the app runs on serverless with `max: 1` per pool, and the
 * direct endpoint exhausts connections under any real traffic.
 */
async function createNeonProject(orgId: string, region: string): Promise<NeonProject> {
  const apiKey = process.env.NEON_API_KEY;
  if (!apiKey) {
    throw new Error(
      'NEON_API_KEY is not set. Create one at console.neon.tech → Account settings '
      + '→ API keys, and put it in .env.local (never in Vercel).\n'
      + 'Alternatively pass --connection-string=... to use a project you created by hand.',
    );
  }

  const neonOrgId = process.env.NEON_ORG_ID;

  const res = await fetch(`${NEON_API}/projects`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: {
        name: `dojo-tenant-${orgId}`,
        region_id: region,
        // Required for organization-scoped API keys; omitted for personal ones.
        ...(neonOrgId && { org_id: neonOrgId }),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && body.includes('org_id is required')) {
      throw new Error(
        'Neon says org_id is required — your API key is organization-scoped. '
        + 'Add NEON_ORG_ID to .env.local (Neon console → Organization settings; '
        + 'it looks like org-something-12345678).',
      );
    }
    throw new Error(`Neon API refused to create the project (${res.status}): ${body}`);
  }

  const body = await res.json() as {
    project: { id: string };
    branch: { id: string };
    connection_uris?: Array<{ connection_uri: string }>;
  };

  const uri = body.connection_uris?.[0]?.connection_uri;
  if (!uri) {
    throw new Error('Neon created the project but returned no connection URI.');
  }

  // Neon returns the direct endpoint; the pooled host inserts "-pooler".
  const pooled = uri.replace(/@(ep-[^.]+)\./, '@$1-pooler.');

  return { projectId: body.project.id, branchId: body.branch.id, connectionString: pooled };
}

/**
 * Refuse a connection string that is not a database of its own.
 *
 * This is the check that makes provisioning meaningful. A row pointing at the
 * shared database is not an isolated tenant, and one shared between two orgs is
 * not isolated either — regardless of what its `region` label says. The read
 * path enforces the same rule; enforcing it here means a bad row never gets
 * written in the first place.
 */
export async function assertDistinctDatabase(
  controlDb: ReturnType<typeof drizzle>,
  orgId: string,
  connectionString: string,
): Promise<void> {
  if (connectionString === process.env.DATABASE_URL) {
    throw new Error('That connection string is the SHARED database. A tenant needs its own.');
  }
  if (connectionString === process.env.CONTROL_DATABASE_URL) {
    throw new Error('That connection string is the CONTROL database. A tenant needs its own.');
  }

  const key = tenantEncryptionKey();
  if (!key) {
    throw new Error('No encryption key; cannot check existing tenants for collisions.');
  }

  const existing = await controlDb.select().from(tenantSchema);
  for (const row of existing) {
    if (row.orgId === orgId) {
      continue;
    }
    let decrypted: string;
    try {
      decrypted = decryptConnectionString(row.connectionStringEncrypted, key);
    } catch {
      // An undecryptable row is a separate problem for checkTenantReadiness;
      // it cannot collide with this one.
      continue;
    }
    if (decrypted === connectionString) {
      throw new Error(
        `That connection string already belongs to ${row.orgId}. Two organizations `
        + 'sharing one database is precisely what this migration exists to prevent.',
      );
    }
  }

  // Prove it is actually reachable before we mark the tenant active.
  const probe = new Pool({ connectionString, max: 1 });
  try {
    await probe.query('SELECT 1');
  } finally {
    await probe.end();
  }
}

/** Apply the baseline, returning the migration tag that was applied. */
/**
 * Apply the baseline — or verify it is ALREADY applied.
 *
 * `0000_baseline.sql` uses bare `CREATE TABLE` for 40 of 42 tables, so it
 * cannot be re-applied to a database that already holds the schema. That is
 * the normal case for a Neon BRANCH, which inherits its parent's schema by
 * definition, and branches are the only way to get a database on a
 * Vercel-managed Neon account.
 *
 * So: if the destination already has the tables, verify the schema is COMPLETE
 * rather than blindly running DDL that would fail on the first statement. A
 * partially-migrated destination is rejected — a copy into one would fail
 * mid-way, or worse, silently omit a table.
 */
/** Table names the baseline creates — the definition of a complete schema. */
export function expectedTableNames(): string[] {
  const sql = readFileSync(path.join(MIGRATIONS_FOLDER, '0000_baseline.sql'), 'utf8');
  const names = [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/g)].map(m => m[1]!);
  return [...new Set(names)];
}

async function migrateTenantDatabase(connectionString: string): Promise<string> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const present = new Set(rows.map(r => r.table_name));

    if (present.size === 0) {
      await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER });
    } else {
      // Already has a schema. Prove it is the WHOLE schema before trusting it.
      const expected = expectedTableNames();
      const missing = expected.filter(t => !present.has(t));

      if (missing.length > 0) {
        throw new Error(
          `The destination already has ${present.size} table(s) but is MISSING ${missing.length}: `
          + `${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}.\n`
          + 'It is partially migrated. Copying into it would fail part-way or silently skip tables.\n'
          + 'Use an empty database, or bring this one up to the current baseline by hand.',
        );
      }

      console.info(`[provisionTenant] destination already has the full schema (${present.size} tables) — not re-applying the baseline`);
    }
  } finally {
    await pool.end();
  }

  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string }> };
  const latest = journal.entries.at(-1)?.tag;
  if (!latest) {
    throw new Error('migrations/meta/_journal.json has no entries.');
  }
  return latest;
}

/**
 * Is this tenant row ALREADY on its own database?
 *
 * `status` cannot answer this. `registerTenants` writes rows as 'active' —
 * correctly, since those orgs ARE served, from the SHARED database. Treating
 * 'active' as "already provisioned" made every registered org unprovisionable,
 * which is the normal starting state for a cutover.
 *
 * The predicate is the same one the app routes on: does the decrypted string
 * name something other than the shared (or control) database?
 */
export function isAlreadyCutOver(
  storedConnectionString: string,
  sharedConnectionString: string | undefined,
  controlConnectionString: string,
): boolean {
  if (storedConnectionString === SHARED_DATABASE_SENTINEL) {
    return false;
  }

  const key = tenantEncryptionKey();
  if (!key) {
    return false;
  }

  // ⚠️ FAIL CLOSED when the shared connection string is unknown.
  //
  // Without it, `decrypted !== undefined` is true for EVERY row, so every
  // organization looks cut over and provisioning refuses with "nothing to do".
  // That is precisely backwards: the comparison this guard depends on cannot be
  // made, so it must not claim an answer.
  if (!sharedConnectionString) {
    throw new Error(
      'DATABASE_URL is not set, so provisioning cannot tell whether this tenant row '
      + 'still points at the shared database.\n'
      + 'Set it to the SHARED (source) database and re-run:\n'
      + '  DATABASE_URL="<shared>" CONTROL_DATABASE_URL="<control>" npm run db:provision-tenant -- --orgId=org_xxx --connection-string=<dest>',
    );
  }

  try {
    const decrypted = decryptConnectionString(storedConnectionString, key);
    return decrypted !== sharedConnectionString && decrypted !== controlConnectionString;
  } catch {
    // Undecryptable means a key mismatch, not a cutover. Let provisioning
    // proceed and fail later with a clearer error than "nothing to do".
    return false;
  }
}

/**
 * The organization's human name, from Clerk.
 *
 * `tenant.display_name` exists so an operator can tell which row is which
 * without decoding a `org_3AmFYvg…` id. Storing the id there (what this used to
 * do) made the column pure noise.
 *
 * Best-effort: a missing CLERK_SECRET_KEY or an API failure must never block
 * provisioning, so this degrades to null rather than throwing.
 */
async function fetchOrgDisplayName(orgId: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return null;
  }

  try {
    const response = await fetch(`https://api.clerk.com/v1/organizations/${orgId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!response.ok) {
      return null;
    }
    const body = await response.json() as { name?: string; slug?: string };
    return body.name ?? body.slug ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  const args = parseArgs();

  // REFUSE to fall back to DATABASE_URL.
  //
  // The `tenant` directory is control-plane. Falling back silently wrote
  // directory rows into whatever DATABASE_URL happened to be — locally a dead
  // socket (an opaque "failed query" error), and on a machine pointed at
  // production, rows nobody reads. An unset control plane is a configuration
  // mistake, not a default to guess at.
  const controlConnectionString = process.env.CONTROL_DATABASE_URL;
  if (!controlConnectionString) {
    throw new Error(
      'CONTROL_DATABASE_URL is not set.\n'
      + 'provisionTenant writes the `tenant` directory row, which lives in the CONTROL database.\n'
      + 'Set it to the pooled connection string of your control Neon project, e.g.\n'
      + '  CONTROL_DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require" npm run db:provision-tenant -- --orgId=org_xxx',
    );
  }
  if (!controlConnectionString) {
    throw new Error('Neither CONTROL_DATABASE_URL nor DATABASE_URL is set.');
  }

  const key = tenantEncryptionKey();
  if (!key) {
    throw new Error(
      'No encryption key. Set CONTROL_PLANE_ENCRYPTION_KEY (preferred) or '
      + 'IQPRO_CONFIG_ENCRYPTION_KEY. It MUST match what the deployed app reads.',
    );
  }

  const controlPool = new Pool({ connectionString: controlConnectionString, max: 1 });
  const controlDb = drizzle({ client: controlPool, schema: { tenantSchema } });

  try {
    const existing = await controlDb
      .select()
      .from(tenantSchema)
      .where(eq(tenantSchema.orgId, args.orgId))
      .catch((error: unknown) => {
        // drizzle reports the failed SQL but drops the driver's cause, so a
        // dead socket and an unmigrated database look identical. Name both.
        const code = (error as { code?: string; cause?: { code?: string } }).code
          ?? (error as { cause?: { code?: string } }).cause?.code;
        if (code === '42P01') {
          throw new Error(
            'The `tenant` table does not exist in CONTROL_DATABASE_URL.\n'
            + 'Either this is not the control database, or the baseline has never been applied to it:\n'
            + '  CONTROL_DATABASE_URL="…" npm run db:migrate:tenants',
          );
        }
        if (code === '42703') {
          throw new Error(
            'The `tenant` table in CONTROL_DATABASE_URL is missing a column this code expects.\n'
            + 'It was migrated at an older baseline. drizzle compares created_at, not file hashes,\n'
            + 'so an edited baseline is SILENTLY SKIPPED on a database that already recorded it —\n'
            + 'the missing DDL must be applied by hand.',
          );
        }
        if (code === 'ECONNREFUSED') {
          throw new Error('Cannot connect to CONTROL_DATABASE_URL. Is the host reachable?');
        }
        throw error;
      });

    // Refuse only when the org is ALREADY ON ITS OWN DATABASE.
    //
    // `status` alone cannot answer this. `registerTenants` writes rows as
    // 'active' — correctly, because those orgs ARE being served, from the
    // SHARED database. Treating 'active' as "already provisioned" made every
    // registered org unprovisionable, which is the normal starting state for a
    // cutover. The real question is the same one the app routes on: does this
    // row point somewhere other than the shared database?
    const row = existing[0];
    if (row) {
      const alreadyCutOver = isAlreadyCutOver(
        row.connectionStringEncrypted,
        process.env.DATABASE_URL,
        controlConnectionString,
      );

      // Only refuse a row that is BOTH on its own database AND finished.
      //
      // Provisioning writes the row (status 'provisioning') before applying
      // the schema, so a failure at any later step leaves a row that points at
      // the new database but was never verified. Refusing that on the
      // connection string alone made the failure unrecoverable: re-running
      // said "nothing to do" while the tenant was still half-provisioned.
      if (alreadyCutOver && row.status !== TENANT_STATUS.PROVISIONING) {
        console.warn(`[provisionTenant] ${args.orgId} is already on its own database (status "${row.status}"). Nothing to do.`);
        return;
      }

      if (alreadyCutOver) {
        console.info(`[provisionTenant] ${args.orgId} has a half-provisioned row (status "${row.status}") — resuming.`);
      }

      console.info(`[provisionTenant] ${args.orgId} exists (status "${row.status}") on the shared database — provisioning its own.`);
    }

    if (args.dryRun) {
      console.warn(`[provisionTenant] would provision ${args.orgId} in ${args.region}`);
      return;
    }

    // 1. Get a database.
    const project = args.connectionString
      ? { projectId: null, branchId: null, connectionString: args.connectionString }
      : await createNeonProject(args.orgId, args.region);
    console.info(`[provisionTenant] database ready for ${args.orgId}`);

    // 2. Record it as NOT servable.
    const displayName = await fetchOrgDisplayName(args.orgId);
    if (displayName) {
      console.info(`[provisionTenant] organization: ${displayName}`);
    }

    await controlDb
      .insert(tenantSchema)
      .values({
        orgId: args.orgId,
        displayName: displayName ?? args.orgId,
        connectionStringEncrypted: encryptConnectionString(project.connectionString, key),
        region: args.region,
        neonProjectId: project.projectId,
        neonBranchId: project.branchId,
        status: TENANT_STATUS.PROVISIONING,
        schemaVersion: null,
      })
      .onConflictDoUpdate({
        target: tenantSchema.orgId,
        set: {
          // Refresh on re-provision too — a row written by `registerTenants`
          // carries a null display name, and a resumed provision should fix it.
          displayName: displayName ?? args.orgId,
          connectionStringEncrypted: encryptConnectionString(project.connectionString, key),
          region: args.region,
          neonProjectId: project.projectId,
          neonBranchId: project.branchId,
          status: TENANT_STATUS.PROVISIONING,
          updatedAt: new Date(),
        },
      });

    // 3. Schema.
    const schemaVersion = await migrateTenantDatabase(project.connectionString);
    console.info(`[provisionTenant] applied ${schemaVersion}`);

    // 4. Prove isolation BEFORE the row becomes servable.
    await assertDistinctDatabase(controlDb, args.orgId, project.connectionString);
    console.info('[provisionTenant] verified: distinct, reachable, unshared');

    // 5. Record the schema, but DELIBERATELY LEAVE THE ROW NON-SERVABLE.
    //
    // The database is empty at this point. Flipping to ACTIVE here would make
    // `resolveTenant` serve this org from an empty database the moment the 60s
    // directory cache expires — its dashboard would go blank with no flag
    // change and no error. The org becomes servable only after its data has
    // been copied AND verified, which is what `cutoverTenant` does.
    await controlDb
      .update(tenantSchema)
      .set({
        schemaVersion,
        schemaVersionAppliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenantSchema.orgId, args.orgId));

    console.info(`\n[provisionTenant] ${args.orgId} is PROVISIONED (not yet servable).`);
    console.info('Its database is empty, so the row stays non-servable until the copy is verified.');
    console.info('Next:');
    console.info(`  npm run db:copy-tenant   -- --orgId=${args.orgId} --target=<connection string>`);
    console.info(`  npm run db:verify-copy   -- --orgId=${args.orgId} --target=<same>`);
    console.info(`  npm run db:cutover-tenant -- --orgId=${args.orgId} --target=<same>   # flips to ACTIVE`);
  } finally {
    await controlPool.end();
  }
}

const isDirectRun = process.argv[1]?.includes('provisionTenant');

if (isDirectRun) {
  main().catch((error) => {
    console.error('[provisionTenant] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
