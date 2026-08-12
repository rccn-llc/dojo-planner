/**
 * Service for resolving an organization's assignable instructors from Clerk.
 *
 * Instructors are Clerk org members with the `org:instructor` role. Academy
 * owners (`org:academy_owner`) are masters who run their own classes, so they
 * are always included in the assignable-instructor pool. Admins and front-desk
 * staff are intentionally excluded.
 *
 * The instructor's Clerk user id is what gets stored on
 * `class_schedule_instance.primary_instructor_clerk_id` and
 * `event_session.primary_instructor_clerk_id`.
 */
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { instructorProfileSchema } from '@/models/Schema';
import { clerkApiRequest } from '@/services/ClerkRolesService';
import { getDbForOrg } from '@/services/TenantDirectoryService';
import { ORG_ROLE } from '@/types/Auth';

export type Instructor = {
  /** Clerk user id — stored as `primaryInstructorClerkId` on schedule/session rows. */
  id: string;
  name: string;
  photoUrl: string | null;
};

// Subset of Clerk's org-membership shape (BAPI snake_case) we need.
type ClerkOrganizationMembership = {
  id: string;
  role: string;
  public_user_data?: {
    user_id?: string;
    first_name?: string | null;
    last_name?: string | null;
    identifier?: string | null;
    image_url?: string | null;
  } | null;
};

type ClerkPaginatedResponse<T> = {
  data: T[];
  total_count: number;
};

const INSTRUCTOR_ROLES = new Set<string>([ORG_ROLE.INSTRUCTOR, ORG_ROLE.ACADEMY_OWNER]);

function displayName(data: NonNullable<ClerkOrganizationMembership['public_user_data']>): string {
  const full = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim();
  return full || data.identifier || 'Instructor';
}

/**
 * Returns the org's assignable instructors (role `org:instructor` or
 * `org:academy_owner`) who have accepted their invitation (have a
 * `public_user_data.user_id`). Deduped by Clerk user id.
 */
export async function getOrganizationInstructors(orgId: string): Promise<Instructor[]> {
  const [response, photoRows] = await Promise.all([
    clerkApiRequest<ClerkPaginatedResponse<ClerkOrganizationMembership>>(
      `/organizations/${orgId}/memberships?limit=100`,
    ),
    db
      .select({ clerkUserId: instructorProfileSchema.clerkUserId, photoUrl: instructorProfileSchema.photoUrl })
      .from(instructorProfileSchema)
      .where(eq(instructorProfileSchema.organizationId, orgId)),
  ]);

  // In-app photo overrides take precedence over the Clerk avatar.
  const overrideByUser = new Map(photoRows.map(row => [row.clerkUserId, row.photoUrl]));

  const byId = new Map<string, Instructor>();
  for (const membership of response.data) {
    if (!INSTRUCTOR_ROLES.has(membership.role)) {
      continue;
    }
    const data = membership.public_user_data;
    const userId = data?.user_id;
    if (!data || !userId || byId.has(userId)) {
      continue;
    }
    const override = overrideByUser.get(userId);
    byId.set(userId, {
      id: userId,
      name: displayName(data),
      photoUrl: override ?? data.image_url ?? null,
    });
  }

  return [...byId.values()];
}

/**
 * Upsert an in-app photo override for one instructor. Pass `null` to clear the
 * override (Clerk avatar then shows again). Keyed by (orgId, clerkUserId).
 */
export async function upsertInstructorPhoto(
  orgId: string,
  clerkUserId: string,
  photoUrl: string | null,
): Promise<void> {
  const existing = await db
    .select({ id: instructorProfileSchema.id })
    .from(instructorProfileSchema)
    .where(and(
      eq(instructorProfileSchema.organizationId, orgId),
      eq(instructorProfileSchema.clerkUserId, clerkUserId),
    ))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(instructorProfileSchema)
      .set({ photoUrl })
      .where(and(
        eq(instructorProfileSchema.organizationId, orgId),
        eq(instructorProfileSchema.clerkUserId, clerkUserId),
      ));
    return;
  }

  await db.insert(instructorProfileSchema).values({
    id: randomUUID(),
    organizationId: orgId,
    clerkUserId,
    photoUrl,
  });
}

/**
 * Returns a map of clerkUserId → override photoUrl for the org (for merging
 * into server-rendered staff lists).
 *
 * Resolves the tenant database EXPLICITLY rather than through the ambient `db`
 * Proxy, because this is called during React Server Component render.
 *
 * A layout cannot establish an AsyncLocalStorage scope that reaches its
 * children: React dispatches child renders from its own scheduling root, a
 * context that never saw the layout's `enterWith()`. Ambient scope therefore
 * works for RPC handlers and webhooks (one continuous async chain) but NOT for
 * RSC. Server components must resolve their own handle.
 */
export async function getInstructorPhotoOverrides(orgId: string): Promise<Map<string, string | null>> {
  const tenantDb = await getDbForOrg(orgId);
  const rows = await tenantDb
    .select({ clerkUserId: instructorProfileSchema.clerkUserId, photoUrl: instructorProfileSchema.photoUrl })
    .from(instructorProfileSchema)
    .where(eq(instructorProfileSchema.organizationId, orgId));
  return new Map(rows.map(row => [row.clerkUserId, row.photoUrl]));
}
