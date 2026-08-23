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
import { encryptConnectionString, tenantEncryptionKey } from '../libs/TenantCrypto';
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

  const { decryptConnectionString } = await import('../libs/TenantCrypto');
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
async function migrateTenantDatabase(connectionString: string): Promise<string> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER });
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

async function main(): Promise<void> {
  loadEnvFiles();
  const args = parseArgs();

  const controlConnectionString = process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL;
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
      .where(eq(tenantSchema.orgId, args.orgId));

    if (existing[0]?.status === TENANT_STATUS.ACTIVE) {
      console.warn(`[provisionTenant] ${args.orgId} is already active. Nothing to do.`);
      return;
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
    await controlDb
      .insert(tenantSchema)
      .values({
        orgId: args.orgId,
        displayName: args.orgId,
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

    // 5. Only now.
    await controlDb
      .update(tenantSchema)
      .set({
        status: TENANT_STATUS.ACTIVE,
        schemaVersion,
        schemaVersionAppliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenantSchema.orgId, args.orgId));

    console.info(`\n[provisionTenant] ${args.orgId} is ACTIVE.`);
    console.info('Next: copy this org\'s data into its database, then run db:check-tenants.');
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
