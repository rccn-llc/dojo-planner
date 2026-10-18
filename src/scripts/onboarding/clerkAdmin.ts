/**
 * Minimal Clerk Backend API client for onboarding.
 *
 * Not `ClerkRolesService.clerkApiRequest`: that reads the key via the app's
 * environment, and onboarding must use the key the operator chose for the
 * TARGET (sk_live_ for production, sk_test_ for preview) — never whatever
 * `.env.local` happens to hold.
 */

const CLERK_API = 'https://api.clerk.com/v1';

export type ClerkOrganization = { id: string; name: string; slug: string | null };
export type ClerkUser = { id: string; username: string | null };
type Paginated<T> = { data: T[]; total_count?: number };
type Membership = { role: string; public_user_data?: { user_id?: string } };
type Invitation = { email_address: string; role: string; status: string };

export class ClerkApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ClerkApiError';
  }
}

export type OwnerAccessResult
  = | { kind: 'member'; userId: string; alreadyDone: boolean }
    | { kind: 'invited'; alreadyDone: boolean };

export function createClerkAdmin(secretKey: string, fetchImpl: typeof fetch = fetch) {
  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T | null> {
    const res = await fetchImpl(`${CLERK_API}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      // Clerk error bodies carry no secrets; include them — they are the only
      // explanation for e.g. a slug that is already taken.
      throw new ClerkApiError(res.status, `Clerk ${init.method ?? 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.status === 204 ? (undefined as T) : await res.json() as T;
  }

  async function findUser(query: string): Promise<ClerkUser | null> {
    const users = await request<ClerkUser[]>(`/users?${query}&limit=2`);
    return users?.[0] ?? null;
  }

  return {
    /** Clerk resolves `/organizations/{id_or_slug}`. */
    getOrganization: (idOrSlug: string) =>
      request<ClerkOrganization>(`/organizations/${encodeURIComponent(idOrSlug)}`),

    async createOrganization(name: string, slug: string, createdBy: string): Promise<ClerkOrganization> {
      const org = await request<ClerkOrganization>('/organizations', {
        method: 'POST',
        body: { name, slug, created_by: createdBy },
      });
      if (!org) {
        throw new Error('Clerk returned no organization');
      }
      return org;
    },

    findUserByUsername: (username: string) => findUser(`username=${encodeURIComponent(username)}`),
    findUserByEmail: (email: string) => findUser(`email_address=${encodeURIComponent(email)}`),

    /** Role keys defined on the instance — the prod instance must mirror dev's. */
    async listRoleKeys(): Promise<string[]> {
      const roles = await request<Paginated<{ key: string }>>('/organization_roles?limit=100');
      return (roles?.data ?? []).map(r => r.key);
    },

    /** Read-only: does the owner already have the role, or a pending invitation? */
    async hasOwnerAccess(orgId: string, email: string, role: string): Promise<boolean> {
      const user = await this.findUserByEmail(email);
      if (user) {
        const members = await request<Paginated<Membership>>(`/organizations/${orgId}/memberships?limit=100`);
        return Boolean(members?.data.some(m => m.public_user_data?.user_id === user.id && m.role === role));
      }
      const invitations = await request<Paginated<Invitation>>(`/organizations/${orgId}/invitations?status=pending&limit=100`);
      return Boolean(invitations?.data.some(i => i.email_address.toLowerCase() === email.toLowerCase()));
    },

    /**
     * Give the owner access. An existing Clerk user is added directly (their id
     * is known immediately); otherwise an invitation is sent. Re-running finds
     * the membership or pending invitation and does nothing.
     */
    async ensureOwnerAccess(orgId: string, email: string, role: string): Promise<OwnerAccessResult> {
      const user = await this.findUserByEmail(email);
      if (user) {
        const members = await request<Paginated<Membership>>(`/organizations/${orgId}/memberships?limit=100`);
        const existing = members?.data.find(m => m.public_user_data?.user_id === user.id);
        if (existing) {
          if (existing.role !== role) {
            await request(`/organizations/${orgId}/memberships/${user.id}`, { method: 'PATCH', body: { role } });
          }
          return { kind: 'member', userId: user.id, alreadyDone: existing.role === role };
        }
        await request(`/organizations/${orgId}/memberships`, { method: 'POST', body: { user_id: user.id, role } });
        return { kind: 'member', userId: user.id, alreadyDone: false };
      }

      const invitations = await request<Paginated<Invitation>>(`/organizations/${orgId}/invitations?status=pending&limit=100`);
      const pending = invitations?.data.find(i => i.email_address.toLowerCase() === email.toLowerCase());
      if (pending) {
        return { kind: 'invited', alreadyDone: true };
      }
      await request(`/organizations/${orgId}/invitations`, { method: 'POST', body: { email_address: email, role } });
      return { kind: 'invited', alreadyDone: false };
    },

    async removeMembership(orgId: string, userId: string): Promise<void> {
      await request(`/organizations/${orgId}/memberships/${userId}`, { method: 'DELETE' });
    },
  };
}

export type ClerkAdmin = ReturnType<typeof createClerkAdmin>;
