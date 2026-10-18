import { describe, expect, it, vi } from 'vitest';
import { ClerkApiError, createClerkAdmin } from './clerkAdmin';

type Route = { method: string; path: RegExp; status?: number; body?: unknown };

/** A fetch fake that answers from a route table and records every call. */
function fakeFetch(routes: Route[]) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const href = String(url);
    calls.push({ method, url: href, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes.find(r => r.method === method && r.path.test(href));
    if (!route) {
      return new Response('not found', { status: 404 });
    }
    const status = route.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(route.body ?? {}), { status });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe('createClerkAdmin', () => {
  it('sends the target key and returns null for a missing org', async () => {
    const { impl, calls } = fakeFetch([]);
    const clerk = createClerkAdmin('sk_test_key', impl);

    expect(await clerk.getOrganization('cta-hq')).toBeNull();
    expect(calls[0]?.url).toBe('https://api.clerk.com/v1/organizations/cta-hq');
  });

  it('creates an organization with name, slug and creator', async () => {
    const { impl, calls } = fakeFetch([
      { method: 'POST', path: /\/organizations$/, body: { id: 'org_1', name: 'CTA', slug: 'cta' } },
    ]);
    const org = await createClerkAdmin('sk_test_key', impl).createOrganization('CTA', 'cta', 'user_op');

    expect(org.id).toBe('org_1');
    expect(calls[0]?.body).toEqual({ name: 'CTA', slug: 'cta', created_by: 'user_op' });
  });

  it('surfaces Clerk errors with status and body', async () => {
    const { impl } = fakeFetch([{ method: 'POST', path: /\/organizations$/, status: 422, body: { errors: [{ code: 'form_identifier_exists' }] } }]);

    await expect(createClerkAdmin('k', impl).createOrganization('A', 'a', 'u')).rejects.toBeInstanceOf(ClerkApiError);
  });

  it('lists role keys', async () => {
    const { impl } = fakeFetch([{ method: 'GET', path: /organization_roles/, body: { data: [{ key: 'org:admin' }, { key: 'org:academy_owner' }] } }]);

    expect(await createClerkAdmin('k', impl).listRoleKeys()).toEqual(['org:admin', 'org:academy_owner']);
  });

  describe('ensureOwnerAccess', () => {
    it('adds an existing Clerk user directly and returns their id', async () => {
      const { impl, calls } = fakeFetch([
        { method: 'GET', path: /\/users\?email_address=/, body: [{ id: 'user_owner', username: null }] },
        { method: 'GET', path: /\/memberships\?/, body: { data: [] } },
        { method: 'POST', path: /\/memberships$/, body: {} },
      ]);
      const result = await createClerkAdmin('k', impl).ensureOwnerAccess('org_1', 'o@x.com', 'org:academy_owner');

      expect(result).toEqual({ kind: 'member', userId: 'user_owner', alreadyDone: false });
      expect(calls.at(-1)?.body).toEqual({ user_id: 'user_owner', role: 'org:academy_owner' });
    });

    it('is a no-op when the user is already an owner', async () => {
      const { impl, calls } = fakeFetch([
        { method: 'GET', path: /\/users\?/, body: [{ id: 'user_owner', username: null }] },
        { method: 'GET', path: /\/memberships\?/, body: { data: [{ role: 'org:academy_owner', public_user_data: { user_id: 'user_owner' } }] } },
      ]);
      const result = await createClerkAdmin('k', impl).ensureOwnerAccess('org_1', 'o@x.com', 'org:academy_owner');

      expect(result).toEqual({ kind: 'member', userId: 'user_owner', alreadyDone: true });
      expect(calls.some(c => c.method !== 'GET')).toBe(false);
    });

    it('promotes an existing member to the owner role', async () => {
      const { impl, calls } = fakeFetch([
        { method: 'GET', path: /\/users\?/, body: [{ id: 'user_owner', username: null }] },
        { method: 'GET', path: /\/memberships\?/, body: { data: [{ role: 'org:admin', public_user_data: { user_id: 'user_owner' } }] } },
        { method: 'PATCH', path: /\/memberships\/user_owner$/, body: {} },
      ]);
      await createClerkAdmin('k', impl).ensureOwnerAccess('org_1', 'o@x.com', 'org:academy_owner');

      expect(calls.at(-1)).toMatchObject({ method: 'PATCH', body: { role: 'org:academy_owner' } });
    });

    it('invites an unknown email', async () => {
      const { impl, calls } = fakeFetch([
        { method: 'GET', path: /\/users\?/, body: [] },
        { method: 'GET', path: /\/invitations\?/, body: { data: [] } },
        { method: 'POST', path: /\/invitations$/, body: {} },
      ]);
      const result = await createClerkAdmin('k', impl).ensureOwnerAccess('org_1', 'new@x.com', 'org:academy_owner');

      expect(result).toEqual({ kind: 'invited', alreadyDone: false });
      expect(calls.at(-1)?.body).toEqual({ email_address: 'new@x.com', role: 'org:academy_owner' });
    });

    it('does not re-invite when an invitation is already pending', async () => {
      const { impl, calls } = fakeFetch([
        { method: 'GET', path: /\/users\?/, body: [] },
        { method: 'GET', path: /\/invitations\?/, body: { data: [{ email_address: 'NEW@x.com', role: 'org:academy_owner', status: 'pending' }] } },
      ]);
      const result = await createClerkAdmin('k', impl).ensureOwnerAccess('org_1', 'new@x.com', 'org:academy_owner');

      expect(result).toEqual({ kind: 'invited', alreadyDone: true });
      expect(calls.some(c => c.method === 'POST')).toBe(false);
    });
  });

  describe('hasOwnerAccess (read-only)', () => {
    it('is true for an existing user who already has the role', async () => {
      const { impl, calls } = fakeFetch([
        { method: 'GET', path: /\/users\?/, body: [{ id: 'user_owner', username: null }] },
        { method: 'GET', path: /\/memberships\?/, body: { data: [{ role: 'org:academy_owner', public_user_data: { user_id: 'user_owner' } }] } },
      ]);

      expect(await createClerkAdmin('k', impl).hasOwnerAccess('org_1', 'o@x.com', 'org:academy_owner')).toBe(true);
      expect(calls.every(c => c.method === 'GET')).toBe(true);
    });

    it('is false when the user is a member with another role', async () => {
      const { impl } = fakeFetch([
        { method: 'GET', path: /\/users\?/, body: [{ id: 'user_owner', username: null }] },
        { method: 'GET', path: /\/memberships\?/, body: { data: [{ role: 'org:admin', public_user_data: { user_id: 'user_owner' } }] } },
      ]);

      expect(await createClerkAdmin('k', impl).hasOwnerAccess('org_1', 'o@x.com', 'org:academy_owner')).toBe(false);
    });

    it('is true for an unknown email with a pending invitation', async () => {
      const { impl } = fakeFetch([
        { method: 'GET', path: /\/users\?/, body: [] },
        { method: 'GET', path: /\/invitations\?/, body: { data: [{ email_address: 'new@x.com', role: 'org:academy_owner', status: 'pending' }] } },
      ]);

      expect(await createClerkAdmin('k', impl).hasOwnerAccess('org_1', 'NEW@x.com', 'org:academy_owner')).toBe(true);
    });
  });
});
