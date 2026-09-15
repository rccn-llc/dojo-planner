// Human-readable labels for Clerk organization roles.
//
// This map was previously duplicated (byte-for-byte, including its fallback
// branch) in `StaffCard.tsx` and `StaffTable.tsx`, and a third surface —
// the profile dialog — sidestepped it entirely by hardcoding
// "Account Owner" for every user regardless of their actual role.

const ROLE_LABELS: Record<string, string> = {
  'org:admin': 'Admin',
  'org:academy_owner': 'Academy Owner',
  'org:front_desk': 'Front Desk',
  'org:instructor': 'Instructor',
  'org:member': 'Member',
  'org:individual_member': 'Individual Member',
  // Legacy value still present in some older rows.
  'front-desk': 'Front Desk',
};

/**
 * Map a Clerk role key (e.g. `org:front_desk`) to a display label.
 *
 * Unknown roles degrade gracefully: the `org:` prefix is stripped and the
 * remainder is title-cased, so a role added in the Clerk dashboard before it
 * is added here still renders something sensible rather than a raw key.
 */
export function formatRoleLabel(role: string | null | undefined): string {
  if (!role) {
    return '';
  }
  const known = ROLE_LABELS[role];
  if (known) {
    return known;
  }
  return role
    .replace(/^org:/, '')
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
