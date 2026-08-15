/**
 * Service for fetching organization roles and permissions from Clerk's Backend API.
 * The Clerk SDK doesn't yet have wrapper methods for these endpoints, so we use direct HTTP calls.
 *
 * API Reference: https://clerk.com/changelog/2025-11-24-organization-roles-and-permission-bapi-management
 */

// Types matching Clerk's API response structure
export type ClerkPermission = {
  id: string;
  key: string;
  name: string;
  description: string;
  type: 'system' | 'user';
  created_at: number;
  updated_at: number;
};

export type ClerkRole = {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: ClerkPermission[];
  is_creator_eligible: boolean;
  created_at: number;
  updated_at: number;
};

type ClerkPaginatedResponse<T> = {
  data: T[];
  total_count: number;
};

const CLERK_API_BASE_URL = 'https://api.clerk.com/v1';

type ClerkApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
};

/**
 * Makes an authenticated request to the Clerk Backend API. Defaults to GET;
 * pass `{ method, body }` for create/update/delete calls.
 */
export async function clerkApiRequest<T>(
  endpoint: string,
  options: ClerkApiRequestOptions = {},
): Promise<T> {
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY is not configured');
  }

  const response = await fetch(`${CLERK_API_BASE_URL}${endpoint}`, {
    method: options.method ?? 'GET',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    ...(options.body && { body: JSON.stringify(options.body) }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Clerk API error: ${response.status} - ${errorText}`);
  }

  // 204 No Content responses (e.g. DELETE) have no body; cast undefined.
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// Subset of Clerk's organization membership shape (BAPI snake_case) that we
// need to identify the academy owner. Other fields are ignored.
type ClerkOrganizationMembership = {
  id: string;
  role: string;
  public_user_data?: {
    user_id?: string;
    first_name?: string | null;
    last_name?: string | null;
    identifier?: string | null;
  } | null;
};

export type AcademyOwner = {
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

/**
 * Resolves the academy owner responsible for an organization's SaaS
 * subscription. Returns the first member with the `org:academy_owner` role
 * who has fully accepted their invitation (has `public_user_data` with a
 * `user_id`), or `null` if no such owner exists.
 *
 * Used to durably link `organization.saasProviderCustomerId` to a Clerk identity at
 * subscribe time and to enforce the owner-aware dashboard access gate.
 */
export async function getAcademyOwner(orgId: string): Promise<AcademyOwner | null> {
  const response = await clerkApiRequest<ClerkPaginatedResponse<ClerkOrganizationMembership>>(
    `/organizations/${orgId}/memberships?limit=100`,
  );

  const ownerMembership = response.data.find(
    membership =>
      membership.role === 'org:academy_owner'
      && !!membership.public_user_data?.user_id,
  );

  if (!ownerMembership?.public_user_data?.user_id) {
    return null;
  }

  const data = ownerMembership.public_user_data;
  return {
    clerkUserId: data.user_id!,
    email: data.identifier ?? '',
    firstName: data.first_name ?? null,
    lastName: data.last_name ?? null,
  };
}

/**
 * Fetches all organization permissions from Clerk
 */
export async function getOrganizationPermissions(): Promise<ClerkPermission[]> {
  const response = await clerkApiRequest<ClerkPaginatedResponse<ClerkPermission>>(
    '/organization_permissions?limit=100',
  );
  return response.data;
}

/**
 * Fetches all organization roles from Clerk
 */
export async function getOrganizationRoles(): Promise<ClerkRole[]> {
  const response = await clerkApiRequest<ClerkPaginatedResponse<ClerkRole>>(
    '/organization_roles?limit=100',
  );
  return response.data;
}

/**
 * Fetches a specific role by ID
 */
export async function getOrganizationRole(roleId: string): Promise<ClerkRole> {
  return clerkApiRequest<ClerkRole>(`/organization_roles/${roleId}`);
}

/**
 * Fetches a specific permission by ID
 */
export async function getOrganizationPermission(permissionId: string): Promise<ClerkPermission> {
  return clerkApiRequest<ClerkPermission>(`/organization_permissions/${permissionId}`);
}

export type CreateOrganizationRoleInput = {
  name: string;
  key: string;
  description: string;
  /** Permission keys to attach to the new role (e.g. 'org:members:read'). */
  permissions: string[];
};

/**
 * Creates a new custom organization role on the Clerk instance.
 *
 * Per Clerk's BAPI (the 2025-11-24 changelog), POSTing to
 * `/organization_roles` with `{ name, key, description, permissions }`
 * creates a custom role available to every org on the instance. System
 * roles (org:admin / org:member etc.) are managed by Clerk and cannot be
 * created here — Clerk will return 4xx if the key collides.
 */
export async function createOrganizationRole(
  input: CreateOrganizationRoleInput,
): Promise<ClerkRole> {
  return clerkApiRequest<ClerkRole>('/organization_roles', {
    method: 'POST',
    body: {
      name: input.name,
      key: input.key,
      description: input.description,
      permissions: input.permissions,
    },
  });
}

export type UpdateOrganizationRoleInput = {
  name?: string;
  description?: string;
  /** When provided, REPLACES the role's permission set (not additive). */
  permissions?: string[];
};

/**
 * Updates a custom organization role. Only fields present in `input` are
 * sent — Clerk leaves omitted fields untouched. `permissions` is REPLACE
 * semantics, not merge: send the full desired list, not just additions.
 *
 * Clerk's BAPI rejects edits to system roles with 4xx; surface that as-is.
 */
export async function updateOrganizationRole(
  roleId: string,
  input: UpdateOrganizationRoleInput,
): Promise<ClerkRole> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) {
    body.name = input.name;
  }
  if (input.description !== undefined) {
    body.description = input.description;
  }
  if (input.permissions !== undefined) {
    body.permissions = input.permissions;
  }

  return clerkApiRequest<ClerkRole>(`/organization_roles/${roleId}`, {
    method: 'PATCH',
    body,
  });
}

/**
 * Deletes a custom organization role. Clerk rejects deletion of system
 * roles or any role currently assigned to a member with 4xx.
 */
export async function deleteOrganizationRole(roleId: string): Promise<void> {
  await clerkApiRequest<void>(`/organization_roles/${roleId}`, {
    method: 'DELETE',
  });
}
