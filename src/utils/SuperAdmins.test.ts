import { describe, expect, it } from 'vitest';

import { isExemptOrg, isSuperAdmin } from './SuperAdmins';

describe('isSuperAdmin', () => {
  it('returns true for known super admin usernames', () => {
    expect(isSuperAdmin('aguilanegra')).toBe(true);
    expect(isSuperAdmin('richardhoppes')).toBe(true);
    expect(isSuperAdmin('nhaloski')).toBe(true);
    expect(isSuperAdmin('rtoupin')).toBe(true);
  });

  it('returns false for non-super-admin usernames', () => {
    expect(isSuperAdmin('randomuser')).toBe(false);
    expect(isSuperAdmin('admin')).toBe(false);
    expect(isSuperAdmin('superadmin')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSuperAdmin(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSuperAdmin(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSuperAdmin('')).toBe(false);
  });
});

describe('isExemptOrg', () => {
  it('returns true for Dojo Planner Admins org', () => {
    expect(isExemptOrg('org_36AnfhskOn2N0uZFE3NuaQQESHt')).toBe(true);
  });

  it('returns false for other org IDs', () => {
    expect(isExemptOrg('org_123456')).toBe(false);
    expect(isExemptOrg('org_random')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isExemptOrg(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isExemptOrg(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isExemptOrg('')).toBe(false);
  });
});
