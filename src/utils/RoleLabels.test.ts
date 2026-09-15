import { describe, expect, it } from 'vitest';
import { formatRoleLabel } from './RoleLabels';

describe('formatRoleLabel', () => {
  it('maps every known ORG_ROLE key to its label', () => {
    expect(formatRoleLabel('org:admin')).toBe('Admin');
    expect(formatRoleLabel('org:academy_owner')).toBe('Academy Owner');
    expect(formatRoleLabel('org:front_desk')).toBe('Front Desk');
    expect(formatRoleLabel('org:instructor')).toBe('Instructor');
    expect(formatRoleLabel('org:member')).toBe('Member');
    expect(formatRoleLabel('org:individual_member')).toBe('Individual Member');
  });

  it('maps the legacy front-desk value', () => {
    expect(formatRoleLabel('front-desk')).toBe('Front Desk');
  });

  it('title-cases an unknown role instead of showing a raw key', () => {
    expect(formatRoleLabel('org:head_coach')).toBe('Head Coach');
    expect(formatRoleLabel('org:billing-manager')).toBe('Billing Manager');
  });

  it('returns an empty string for null, undefined and empty input', () => {
    expect(formatRoleLabel(null)).toBe('');
    expect(formatRoleLabel(undefined)).toBe('');
    expect(formatRoleLabel('')).toBe('');
  });
});
