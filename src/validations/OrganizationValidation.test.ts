import { describe, expect, it } from 'vitest';
import { UpdateLocationValidation } from './OrganizationValidation';

describe('UpdateLocationValidation', () => {
  const valid = {
    address: '123 Main St, City, State',
    phone: '(555) 555-1234',
    email: 'hello@dojo.test',
    taxRate: 3.75,
  };

  it('accepts a valid payload', () => {
    expect(UpdateLocationValidation.parse(valid)).toEqual(valid);
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

  it('rejects address longer than 500 chars', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, address: 'x'.repeat(501) })).toThrow();
  });

  it('rejects phone longer than 40 chars', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, phone: 'x'.repeat(41) })).toThrow();
  });

  it('accepts taxRate of 0', () => {
    expect(UpdateLocationValidation.parse({ ...valid, taxRate: 0 })).toEqual({ ...valid, taxRate: 0 });
  });

  it('accepts taxRate of 100', () => {
    expect(UpdateLocationValidation.parse({ ...valid, taxRate: 100 })).toEqual({ ...valid, taxRate: 100 });
  });

  it('rejects negative taxRate', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, taxRate: -1 })).toThrow();
  });

  it('rejects taxRate above 100', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, taxRate: 100.01 })).toThrow();
  });

  it('rejects taxRate with more than 2 decimal places', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, taxRate: 3.755 })).toThrow();
  });

  it('rejects non-numeric taxRate', () => {
    expect(() => UpdateLocationValidation.parse({ ...valid, taxRate: '3.75' })).toThrow();
  });
});
