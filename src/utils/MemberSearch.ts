// Shared member-search relevance helpers (#244).
//
// Every member-search box in the app previously used a plain substring
// (`.includes`) filter with no relevance ordering. These helpers give a single,
// consistent behavior: prefix matches on a name rank above mid-word substring
// matches, which rank above email/phone matches, and ties break alphabetically.

export type SearchableMember = {
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone?: string | null;
};

// Lower rank = better match. `null` means "no match" (filtered out).
//   0 — query is a prefix of the full name or a name part
//   1 — query is a substring within a name part
//   2 — query is a prefix of the email / phone
//   3 — query is a substring within the email / phone
export function memberSearchRank(member: SearchableMember, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (q === '') {
    return 0;
  }
  const first = (member.firstName ?? '').toLowerCase();
  const last = (member.lastName ?? '').toLowerCase();
  const full = `${first} ${last}`.trim();
  const email = member.email.toLowerCase();
  const phone = (member.phone ?? '').toLowerCase();

  if (full.startsWith(q) || first.startsWith(q) || last.startsWith(q)) {
    return 0;
  }
  if (first.includes(q) || last.includes(q)) {
    return 1;
  }
  if ((phone !== '' && phone.startsWith(q)) || email.startsWith(q)) {
    return 2;
  }
  if ((phone !== '' && phone.includes(q)) || email.includes(q)) {
    return 3;
  }
  return null;
}

// Alphabetical comparison by "lastName, firstName" (case-insensitive), used to
// break ties within a relevance rank.
export function compareMembersAlphabetically(a: SearchableMember, b: SearchableMember): number {
  const aKey = `${a.lastName ?? ''} ${a.firstName ?? ''}`.trim().toLowerCase();
  const bKey = `${b.lastName ?? ''} ${b.firstName ?? ''}`.trim().toLowerCase();
  return aKey.localeCompare(bKey);
}

// Filter + rank a member list against a query. An empty query returns every
// member alphabetically. Otherwise non-matches are dropped and results are
// ordered by relevance rank, then alphabetically within each rank tier.
export function rankMembersByQuery<T extends SearchableMember>(members: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === '') {
    return [...members].sort(compareMembersAlphabetically);
  }
  return members
    .map(member => ({ member, rank: memberSearchRank(member, q) }))
    .filter((entry): entry is { member: T; rank: number } => entry.rank !== null)
    .sort((a, b) => (a.rank - b.rank) || compareMembersAlphabetically(a.member, b.member))
    .map(entry => entry.member);
}
