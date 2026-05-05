import { describe, expect, it } from 'vitest';
import { UpdateLocationValidation } from './OrganizationValidation';

describe('UpdateLocationValidation', () => {
  const valid = {
    name: 'Main Dojo',
    address: '123 Main St, City, State',
    phone: '(555) 555-1234',
    email: 'hello@dojo.test',
  };

  it('accepts a valid payload', () => {
    expect(UpdateLocationValidation.parse(valid)).toEqual(valid);
  });

  it('rejects empty name', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, name: '' })).toThrow();
  });

  it('rejects empty address', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, address: '' })).toThrow();
  });

  it('rejects empty phone', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, phone: '' })).toThrow();
  });

  it('rejects malformed email', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, email: 'not-an-email' })).toThrow();
  });

  it('rejects name longer than 120 chars', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, name: 'x'.repeat(121) })).toThrow();
  });

  it('rejects address longer than 500 chars', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, address: 'x'.repeat(501) })).toThrow();
  });

  it('rejects phone longer than 40 chars', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, phone: 'x'.repeat(41) })).toThrow();
  });
});
