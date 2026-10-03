const SUPER_ADMIN_USERNAMES = new Set([
  'aguilanegra',
  'nhaloski',
  'rtoupin',
]);

// Organizations that are always active and never require a subscription.
// Clerk org IDs are per-instance, so each Clerk instance's admin org is listed.
const EXEMPT_ORG_IDS = new Set([
  'org_36AnfhskOn2N0uZFE3NuaQQESHt', // Dojo Planner Admins (Clerk development instance)
  'org_3KCWKiMlcYUnxXCDXLC0gXkXdys', // Dojo Planner Admins (Clerk production instance)
]);

export function isSuperAdmin(username: string | null | undefined): boolean {
  return !!username && SUPER_ADMIN_USERNAMES.has(username);
}

export function isExemptOrg(orgId: string | null | undefined): boolean {
  return !!orgId && EXEMPT_ORG_IDS.has(orgId);
}
