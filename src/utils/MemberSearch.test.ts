import { describe, expect, it } from 'vitest';
import { compareMembersAlphabetically, memberSearchRank, rankMembersByQuery } from './MemberSearch';

const m = (firstName: string | null, lastName: string | null, email = 'x@example.com', phone: string | null = null) => ({
  firstName,
  lastName,
  email,
  phone,
});

describe('memberSearchRank', () => {
  it('returns 0 for an empty query (everything matches)', () => {
    expect(memberSearchRank(m('Jane', 'Doe'), '')).toBe(0);
  });

  it('ranks a name prefix as 0', () => {
    expect(memberSearchRank(m('Jane', 'Doe'), 'jan')).toBe(0);
    expect(memberSearchRank(m('Jane', 'Doe'), 'do')).toBe(0); // last-name prefix
    expect(memberSearchRank(m('Jane', 'Doe'), 'jane d')).toBe(0); // full-name prefix
  });

  it('ranks a mid-name substring as 1', () => {
    expect(memberSearchRank(m('Jane', 'Doe'), 'ane')).toBe(1);
  });

  it('ranks an email/phone prefix as 2', () => {
    expect(memberSearchRank(m('Jane', 'Doe', 'zoe@example.com'), 'zoe')).toBe(2);
    expect(memberSearchRank(m('Jane', 'Doe', 'x@example.com', '5551234'), '555')).toBe(2);
  });

  it('ranks an email/phone substring as 3', () => {
    expect(memberSearchRank(m('Jane', 'Doe', 'jane@company.com'), 'company')).toBe(3);
  });

  it('returns null when nothing matches', () => {
    expect(memberSearchRank(m('Jane', 'Doe', 'jane@x.com'), 'zzz')).toBeNull();
  });

  it('handles null name parts safely', () => {
    expect(memberSearchRank(m(null, null, 'solo@x.com'), 'solo')).toBe(2);
    expect(memberSearchRank(m(null, null, 'solo@x.com'), 'nope')).toBeNull();
  });

  it('does not treat an empty phone as a prefix match', () => {
    // Empty phone must not match a non-empty query via ''.startsWith(q).
    expect(memberSearchRank(m('Jane', 'Doe', 'jane@x.com', null), 'zzz')).toBeNull();
  });
});

describe('compareMembersAlphabetically', () => {
  it('orders by lastName then firstName, case-insensitively', () => {
    expect(compareMembersAlphabetically(m('Ann', 'Adams'), m('Bob', 'Baker'))).toBeLessThan(0);
    expect(compareMembersAlphabetically(m('Zed', 'Adams'), m('Ann', 'Adams'))).toBeGreaterThan(0);
  });
});

describe('rankMembersByQuery', () => {
  const members = [
    m('Bob', 'Anderson', 'bob@x.com'),
    m('Janet', 'Zephyr', 'janet@x.com'), // "jan" prefix on first name
    m('Alice', 'Jones', 'alice@x.com'),
    m('Mike', 'Bojangles', 'mike@x.com'), // "jan" substring in last name (Bojangles? no) -> use different
  ];

  it('returns all members alphabetically for an empty query', () => {
    const result = rankMembersByQuery(members, '');

    expect(result.map(r => r.lastName)).toEqual(['Anderson', 'Bojangles', 'Jones', 'Zephyr']);
  });

  it('filters out non-matches and ranks prefix matches first', () => {
    const pool = [
      m('Janet', 'Smith', 'janet@x.com'), // first-name prefix "jan" -> rank 0
      m('Bob', 'Dejan', 'bob@x.com'), // "jan" mid last name -> rank 1
      m('Zoe', 'Zoe', 'jane@x.com'), // "jan" in email -> rank 3
      m('Nomatch', 'Person', 'no@x.com'), // filtered out
    ];
    const result = rankMembersByQuery(pool, 'jan');

    expect(result).toHaveLength(3);
    expect(result[0]!.firstName).toBe('Janet'); // rank 0
    expect(result[1]!.lastName).toBe('Dejan'); // rank 1
    expect(result[2]!.email).toBe('jane@x.com'); // rank 3
  });

  it('breaks rank ties alphabetically', () => {
    const pool = [
      m('Jane', 'Wilson', 'jw@x.com'), // rank 0
      m('Jane', 'Adams', 'ja@x.com'), // rank 0
    ];
    const result = rankMembersByQuery(pool, 'jane');

    expect(result.map(r => r.lastName)).toEqual(['Adams', 'Wilson']);
  });
});
