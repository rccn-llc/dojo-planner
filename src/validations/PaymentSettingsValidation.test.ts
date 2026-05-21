import { describe, expect, it } from 'vitest';
import { UpdateIQProConfigValidation } from './PaymentSettingsValidation';

describe('UpdateIQProConfigValidation', () => {
  it('accepts a fully populated config', () => {
    const result = UpdateIQProConfigValidation.safeParse({
      clientId: 'cid',
      clientSecret: 'shhh',
      gatewayId: 'gid',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a config without clientSecret (means "keep existing")', () => {
    const result = UpdateIQProConfigValidation.safeParse({
      clientId: 'cid',
      gatewayId: 'gid',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty clientId', () => {
    const result = UpdateIQProConfigValidation.safeParse({
      clientId: '',
      gatewayId: 'gid',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty gatewayId', () => {
    const result = UpdateIQProConfigValidation.safeParse({
      clientId: 'cid',
      gatewayId: '',
    });

    expect(result.success).toBe(false);
  });

  it('trims whitespace on all fields', () => {
    const result = UpdateIQProConfigValidation.safeParse({
      clientId: '  cid  ',
      clientSecret: '  s  ',
      gatewayId: '  gid  ',
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.clientId).toBe('cid');
      expect(result.data.gatewayId).toBe('gid');
      expect(result.data.clientSecret).toBe('s');
    }
  });

  it('rejects oversized inputs', () => {
    const tooLong = 'x'.repeat(600);
    const result = UpdateIQProConfigValidation.safeParse({
      clientId: 'cid',
      clientSecret: tooLong,
      gatewayId: 'gid',
    });

    expect(result.success).toBe(false);
  });
});
