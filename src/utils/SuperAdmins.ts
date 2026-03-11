const SUPER_ADMIN_USERNAMES = new Set([
  'aguilanegra',
  'richardhoppes',
  'nhaloski',
  'rtoupin',
]);

// Organizations that are always active and never require a subscription
const EXEMPT_ORG_IDS = new Set([
  'org_36AnfhskOn2N0uZFE3NuaQQESHt', // Dojo Planner Admins
]);

export function isSuperAdmin(username: string | null | undefined): boolean {
  return !!username && SUPER_ADMIN_USERNAMES.has(username);
}

export function isExemptOrg(orgId: string | null | undefined): boolean {
  return !!orgId && EXEMPT_ORG_IDS.has(orgId);
}
