import { describe, expect, it } from 'vitest';
import {
  CreateRoleValidation,
  DeleteRoleValidation,
  UpdateRoleValidation,
} from './RolesValidation';

const validCreate = {
  name: 'Front Desk',
  key: 'org:front_desk',
  description: 'Day-to-day check-in and member lookup access.',
  permissions: ['org:members:read', 'org:attendance:write'],
};

describe('CreateRoleValidation', () => {
  it('accepts a valid payload', () => {
    expect(CreateRoleValidation.safeParse(validCreate).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateRoleValidation.safeParse({ ...validCreate, name: '' }).success).toBe(false);
  });

  it('rejects name longer than 100 characters', () => {
    expect(CreateRoleValidation.safeParse({
      ...validCreate,
      name: 'x'.repeat(101),
    }).success).toBe(false);
  });

  it('rejects a role key without the org: prefix', () => {
    expect(CreateRoleValidation.safeParse({ ...validCreate, key: 'front_desk' }).success).toBe(false);
  });

  it('rejects a role key with uppercase characters', () => {
    expect(CreateRoleValidation.safeParse({ ...validCreate, key: 'org:Front_Desk' }).success).toBe(false);
  });

  it('rejects a role key with spaces or hyphens', () => {
    expect(CreateRoleValidation.safeParse({ ...validCreate, key: 'org:front desk' }).success).toBe(false);
    expect(CreateRoleValidation.safeParse({ ...validCreate, key: 'org:front-desk' }).success).toBe(false);
  });

  it('accepts an empty permissions array (operator can add later)', () => {
    expect(CreateRoleValidation.safeParse({ ...validCreate, permissions: [] }).success).toBe(true);
  });

  it('rejects permissions array containing empty strings', () => {
    expect(CreateRoleValidation.safeParse({
      ...validCreate,
      permissions: [''],
    }).success).toBe(false);
  });

  it('rejects description longer than 500 characters', () => {
    expect(CreateRoleValidation.safeParse({
      ...validCreate,
      description: 'x'.repeat(501),
    }).success).toBe(false);
  });
});

describe('UpdateRoleValidation', () => {
  it('requires id', () => {
    expect(UpdateRoleValidation.safeParse({ name: 'New Name' }).success).toBe(false);
    expect(UpdateRoleValidation.safeParse({ id: 'role_1', name: 'New Name' }).success).toBe(true);
  });

  it('accepts id alone (no-op update)', () => {
    expect(UpdateRoleValidation.safeParse({ id: 'role_1' }).success).toBe(true);
  });

  it('accepts a partial update with just permissions', () => {
    expect(UpdateRoleValidation.safeParse({
      id: 'role_1',
      permissions: ['org:members:read'],
    }).success).toBe(true);
  });

  it('rejects empty id', () => {
    expect(UpdateRoleValidation.safeParse({ id: '', name: 'x' }).success).toBe(false);
  });
});

describe('DeleteRoleValidation', () => {
  it('rejects empty id', () => {
    expect(DeleteRoleValidation.safeParse({ id: '' }).success).toBe(false);
  });

  it('accepts a non-empty id', () => {
    expect(DeleteRoleValidation.safeParse({ id: 'role_1' }).success).toBe(true);
  });
});
