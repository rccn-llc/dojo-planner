import { describe, expect, it, vi } from 'vitest';
import { buildStoreMetadata, createDatabaseProvisioner } from './databaseProvisioner';

type Handler = (url: string, init?: RequestInit) => Response | undefined;

function fakeFetch(handler: Handler) {
  const calls: { method: string; url: string; body?: any }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push({ method: init?.method ?? 'GET', url: href, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return handler(href, init) ?? new Response('unexpected', { status: 500 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const BASE_CONFIG = {
  vercelToken: 'vercel-token',
  vercelTeamId: 'team_1',
  neonApiKey: 'neon-key',
  neonOrgId: 'org-neon',
  sleep: async () => {},
};

/** A Neon + Vercel fake where the project appears after `appearAfter` polls. */
function world(appearAfter = 1) {
  let polls = 0;
  let storeCreated = false;
  return fakeFetch((url, init) => {
    if (url.includes('/v1/integrations/configurations')) {
      return json([{ id: 'icfg_neon' }]);
    }
    if (url.includes('/v1/integrations/configuration/icfg_neon/products')) {
      return json({ products: [{ id: 'iap_1', slug: 'neon', protocols: { storage: {} }, metadataSchema: { required: ['region'], properties: { region: {}, auth: { default: true } } } }] });
    }
    if (url.includes('/v1/storage/stores/integration/direct') && init?.method === 'POST') {
      storeCreated = true;
      return json({ store: { id: 'store_1' } });
    }
    if (url.includes('/api/v2/projects?search=')) {
      if (storeCreated) {
        polls += 1;
      }
      return json({ projects: storeCreated && polls >= appearAfter ? [{ id: 'proj_1', name: 'cta-new' }] : [{ id: 'other', name: 'cta-new-old' }] });
    }
    if (url.endsWith('/projects/proj_1/branches')) {
      return json({ branches: [{ id: 'br_dev' }, { id: 'br_main', default: true }] });
    }
    if (url.includes('/branches/br_main/databases')) {
      return json({ databases: [{ name: 'neondb', owner_name: 'neondb_owner' }] });
    }
    if (url.includes('/connection_uri?')) {
      return json({ uri: 'postgresql://neondb_owner:secret@ep-x-pooler.neon.tech/neondb' });
    }
    return undefined;
  });
}

describe('createDatabaseProvisioner', () => {
  it('creates the store through Vercel with the team, product and schema-default metadata', async () => {
    const { impl, calls } = world();
    const provisioner = createDatabaseProvisioner({ ...BASE_CONFIG, fetchImpl: impl, metadataOverrides: { region: 'iad1', auth: false } });

    expect(await provisioner.createDatabase('cta-new', 'org_1')).toEqual({ projectId: 'proj_1', created: true });

    const create = calls.find(c => c.method === 'POST')!;

    expect(create.url).toContain('teamId=team_1');
    expect(create.body).toMatchObject({
      name: 'cta-new',
      integrationConfigurationId: 'icfg_neon',
      integrationProductIdOrSlug: 'neon',
      metadata: { region: 'iad1', auth: false },
      externalId: 'org_1',
    });
  });

  it('matches the Neon project by EXACT name, not by search prefix', async () => {
    const { impl } = world(3);
    const provisioner = createDatabaseProvisioner({ ...BASE_CONFIG, fetchImpl: impl, metadataOverrides: { region: 'iad1' } });

    // `cta-new-old` is returned by the search before the real project exists.
    expect((await provisioner.createDatabase('cta-new', 'org_1')).projectId).toBe('proj_1');
  });

  it('reuses an existing project instead of creating a second store', async () => {
    const { impl, calls } = fakeFetch(url => url.includes('/projects?search=')
      ? json({ projects: [{ id: 'proj_existing', name: 'cta-new' }] })
      : undefined);
    const provisioner = createDatabaseProvisioner({ ...BASE_CONFIG, fetchImpl: impl });

    expect(await provisioner.createDatabase('cta-new', 'org_1')).toEqual({ projectId: 'proj_existing', created: false });
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('times out with a resumable message when the project never appears', async () => {
    const { impl } = world(Number.POSITIVE_INFINITY);
    const provisioner = createDatabaseProvisioner({ ...BASE_CONFIG, fetchImpl: impl, pollTimeoutMs: 0, metadataOverrides: { region: 'iad1' } });

    await expect(provisioner.createDatabase('cta-new', 'org_1')).rejects.toThrow(/Re-run to resume/);
  });

  it('fails clearly when the team has no Neon integration', async () => {
    const { impl } = fakeFetch(url => url.includes('/projects?search=')
      ? json({ projects: [] })
      : url.includes('/v1/integrations/configurations') ? json({ configurations: [] }) : undefined);
    const provisioner = createDatabaseProvisioner({ ...BASE_CONFIG, fetchImpl: impl });

    await expect(provisioner.createDatabase('cta-new', 'org_1')).rejects.toThrow(/No Neon integration/);
  });

  it('surfaces a Vercel API error with the endpoint, without the query string', async () => {
    const { impl } = fakeFetch(url => url.includes('/projects?search=')
      ? json({ projects: [] })
      : json({ error: 'forbidden' }, 403));
    const provisioner = createDatabaseProvisioner({ ...BASE_CONFIG, fetchImpl: impl });

    await expect(provisioner.createDatabase('cta-new', 'org_1')).rejects.toThrow(/Vercel GET \/v1\/integrations\/configurations failed: 403/);
  });

  it('builds the pooled URI from the DEFAULT branch and its discovered database/role', async () => {
    const { impl, calls } = world();
    const provisioner = createDatabaseProvisioner({ ...BASE_CONFIG, fetchImpl: impl });

    expect(await provisioner.getPooledConnectionString('proj_1')).toContain('-pooler');

    const uriCall = calls.find(c => c.url.includes('/connection_uri?'))!;
    const params = new URL(uriCall.url).searchParams;

    expect(Object.fromEntries(params)).toEqual({
      branch_id: 'br_main',
      database_name: 'neondb',
      role_name: 'neondb_owner',
      pooled: 'true',
    });
  });

  it('fails clearly when the project has no branches', async () => {
    const { impl } = fakeFetch(url => url.endsWith('/branches') ? json({ branches: [] }) : undefined);
    const provisioner = createDatabaseProvisioner({ ...BASE_CONFIG, fetchImpl: impl });

    await expect(provisioner.getPooledConnectionString('proj_1')).rejects.toThrow(/has no branches/);
  });
});

describe('buildStoreMetadata', () => {
  const product = { id: 'iap_1', metadataSchema: { required: ['region'], properties: { region: {}, auth: { default: true } } } };

  it('reports a required field with no default — the 400 Vercel returned for region', () => {
    expect(buildStoreMetadata(product)).toEqual({ metadata: { auth: true }, missing: ['region'] });
  });

  it('lets overrides satisfy required fields and replace defaults', () => {
    expect(buildStoreMetadata(product, { region: 'iad1', auth: false })).toEqual({
      metadata: { region: 'iad1', auth: false },
      missing: [],
    });
  });

  it('refuses to POST when a required field is missing', async () => {
    const { impl, calls } = world();
    const provisioner = createDatabaseProvisioner({ ...BASE_CONFIG, fetchImpl: impl });

    await expect(provisioner.createDatabase('cta-new', 'org_1')).rejects.toThrow(/requires metadata.*region/);
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });
});
