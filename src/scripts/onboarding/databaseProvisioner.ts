/**
 * Create a tenant database with no copy-paste.
 *
 * Neon refuses `POST /projects` on a Vercel-managed organization, so creation
 * goes through VERCEL — the same call the Storage → Create Database button
 * makes — and the connection string is then READ from Neon, which the managed
 * organization does allow. The Neon project carries the store's name (verified
 * on the existing projects), which is how the two are matched.
 *
 * ⚠️ The Vercel integration endpoints' response shapes were taken from the
 * REST docs, not observed; the parsers below accept the documented variants
 * and fail with a message naming the endpoint rather than guessing. The
 * connection string is returned to the caller and NEVER logged.
 */

const VERCEL_API = 'https://api.vercel.com';
const NEON_API = 'https://console.neon.tech/api/v2';

export type DatabaseProvisionerConfig = {
  vercelToken: string;
  vercelTeamId: string;
  neonApiKey: string;
  neonOrgId?: string;
  /** Extra metadata for the Neon product (e.g. a region), merged over schema defaults. */
  metadataOverrides?: Record<string, unknown>;
  billingPlanId?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  pollTimeoutMs?: number;
};

type NeonProject = { id: string; name: string };
type Product = {
  id: string;
  slug?: string;
  name?: string;
  protocols?: Record<string, unknown>;
  metadataSchema?: { required?: string[]; properties?: Record<string, { default?: unknown }> };
};

/**
 * Metadata for the store-creation call: the schema's defaults, overridden by
 * ours. Reports any REQUIRED field still missing, so preflight can stop a run
 * before anything is created (Vercel answers 400 otherwise — observed for
 * `region`, which the Neon product requires with no default).
 */
export function buildStoreMetadata(
  product: Product,
  overrides: Record<string, unknown> = {},
): { metadata: Record<string, unknown>; missing: string[] } {
  const defaults = Object.fromEntries(
    Object.entries(product.metadataSchema?.properties ?? {})
      .filter(([, schema]) => schema.default !== undefined)
      .map(([key, schema]) => [key, schema.default]),
  );
  const metadata = { ...defaults, ...overrides };
  const missing = (product.metadataSchema?.required ?? []).filter(key => metadata[key] === undefined);
  return { metadata, missing };
}

export function createDatabaseProvisioner(config: DatabaseProvisionerConfig) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const sleep = config.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));

  async function call<T>(base: string, token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    });
    if (!res.ok) {
      const service = base === VERCEL_API ? 'Vercel' : 'Neon';
      throw new Error(`${service} ${init.method ?? 'GET'} ${path.split('?')[0]} failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
    }
    return await res.json() as T;
  }

  const vercel = <T>(path: string, init?: { method?: string; body?: unknown }) => {
    const sep = path.includes('?') ? '&' : '?';
    return call<T>(VERCEL_API, config.vercelToken, `${path}${sep}teamId=${encodeURIComponent(config.vercelTeamId)}`, init);
  };
  const neon = <T>(path: string) => call<T>(NEON_API, config.neonApiKey, path);

  async function findNeonProject(name: string): Promise<NeonProject | null> {
    const org = config.neonOrgId ? `&org_id=${encodeURIComponent(config.neonOrgId)}` : '';
    const { projects } = await neon<{ projects: NeonProject[] }>(`/projects?search=${encodeURIComponent(name)}&limit=100${org}`);
    return projects.find(p => p.name === name) ?? null;
  }

  return {
    findNeonProject,

    /** The team's Neon integration installation and its Postgres product. */
    async resolveNeonProduct(): Promise<{ configurationId: string; product: Product }> {
      const raw = await vercel<unknown>('/v1/integrations/configurations?view=account&integrationIdOrSlug=neon');
      const list = (Array.isArray(raw) ? raw : (raw as { configurations?: unknown[] }).configurations ?? []) as { id?: string }[];
      const configurationId = list.find(c => c.id?.startsWith('icfg_'))?.id;
      if (!configurationId) {
        throw new Error('No Neon integration installation found on this Vercel team (GET /v1/integrations/configurations).');
      }
      const { products = [] } = await vercel<{ products?: Product[] }>(`/v1/integrations/configuration/${configurationId}/products`);
      const product = products.find(p => p.protocols && 'storage' in p.protocols) ?? products[0];
      if (!product) {
        throw new Error(`The Neon integration (${configurationId}) exposes no products.`);
      }
      return { configurationId, product };
    },

    /** Create the store through Vercel; idempotent on the Neon project name. */
    async createDatabase(name: string, externalId: string): Promise<{ projectId: string; created: boolean }> {
      const existing = await findNeonProject(name);
      if (existing) {
        return { projectId: existing.id, created: false };
      }

      const { configurationId, product } = await this.resolveNeonProduct();
      const { metadata, missing } = buildStoreMetadata(product, config.metadataOverrides);
      if (missing.length > 0) {
        throw new Error(`The Neon product requires metadata the run did not provide: ${missing.join(', ')}.`);
      }
      await vercel('/v1/storage/stores/integration/direct', {
        method: 'POST',
        body: {
          name,
          integrationConfigurationId: configurationId,
          integrationProductIdOrSlug: product.slug ?? product.id,
          metadata,
          externalId,
          source: 'marketplace',
          ...(config.billingPlanId && { billingPlanId: config.billingPlanId }),
        },
      });

      // The Neon project appears asynchronously once the integration finishes.
      const deadline = Date.now() + (config.pollTimeoutMs ?? 120_000);
      while (Date.now() < deadline) {
        const project = await findNeonProject(name);
        if (project) {
          return { projectId: project.id, created: true };
        }
        await sleep(3_000);
      }
      throw new Error(`Vercel accepted the store "${name}" but no Neon project with that name appeared in time. Re-run to resume.`);
    },

    /** Pooled URI for the default branch's database, discovered rather than assumed. */
    async getPooledConnectionString(projectId: string): Promise<string> {
      const { branches } = await neon<{ branches: { id: string; default?: boolean; primary?: boolean }[] }>(`/projects/${projectId}/branches`);
      const branch = branches.find(b => b.default) ?? branches.find(b => b.primary) ?? branches[0];
      if (!branch) {
        throw new Error(`Neon project ${projectId} has no branches.`);
      }
      const { databases } = await neon<{ databases: { name: string; owner_name: string }[] }>(`/projects/${projectId}/branches/${branch.id}/databases`);
      const database = databases[0];
      if (!database) {
        throw new Error(`Neon project ${projectId} has no database on its default branch.`);
      }
      const params = new URLSearchParams({
        branch_id: branch.id,
        database_name: database.name,
        role_name: database.owner_name,
        pooled: 'true',
      });
      const { uri } = await neon<{ uri: string }>(`/projects/${projectId}/connection_uri?${params}`);
      return uri;
    },
  };
}

export type DatabaseProvisioner = ReturnType<typeof createDatabaseProvisioner>;
