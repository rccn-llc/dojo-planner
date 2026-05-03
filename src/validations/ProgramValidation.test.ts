import { describe, expect, it } from 'vitest';
import { CreateProgramValidation, DeleteProgramValidation, UpdateProgramValidation } from './ProgramValidation';

const validBase = {
  name: 'Adult BJJ',
  description: 'Adult Brazilian Jiu-Jitsu program.',
  color: '#4f46e5',
  isActive: true,
  sortOrder: 0,
};

describe('CreateProgramValidation', () => {
  it('accepts a valid payload', () => {
    expect(CreateProgramValidation.safeParse(validBase).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateProgramValidation.safeParse({ ...validBase, name: '' }).success).toBe(false);
  });

  it('allows null/optional description', () => {
    expect(CreateProgramValidation.safeParse({ ...validBase, description: null }).success).toBe(true);
    expect(CreateProgramValidation.safeParse({ ...validBase, description: undefined }).success).toBe(true);
  });

  it('rejects invalid hex color', () => {
    expect(CreateProgramValidation.safeParse({ ...validBase, color: 'red' }).success).toBe(false);
    expect(CreateProgramValidation.safeParse({ ...validBase, color: '#xyz' }).success).toBe(false);
  });

  it('accepts valid hex color (3 or 6 digits)', () => {
    expect(CreateProgramValidation.safeParse({ ...validBase, color: '#4f4' }).success).toBe(true);
    expect(CreateProgramValidation.safeParse({ ...validBase, color: '#4f46e5' }).success).toBe(true);
  });

  it('allows null color', () => {
    expect(CreateProgramValidation.safeParse({ ...validBase, color: null }).success).toBe(true);
  });

  it('rejects negative sortOrder', () => {
    expect(CreateProgramValidation.safeParse({ ...validBase, sortOrder: -1 }).success).toBe(false);
  });
});

describe('UpdateProgramValidation', () => {
  it('requires id', () => {
    expect(UpdateProgramValidation.safeParse(validBase).success).toBe(false);
    expect(UpdateProgramValidation.safeParse({ id: 'p-1', ...validBase }).success).toBe(true);
  });
});

describe('DeleteProgramValidation', () => {
  it('rejects empty id', () => {
    expect(DeleteProgramValidation.safeParse({ id: '' }).success).toBe(false);
  });

  it('accepts a non-empty id', () => {
    expect(DeleteProgramValidation.safeParse({ id: 'p-1' }).success).toBe(true);
  });
});
