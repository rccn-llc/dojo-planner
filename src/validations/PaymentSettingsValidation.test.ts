import { describe, expect, it } from 'vitest';
import { UpdatePaymentProviderConfigValidation } from './PaymentSettingsValidation';

describe('UpdatePaymentProviderConfigValidation', () => {
  it('accepts a fully populated config', () => {
    const result = UpdatePaymentProviderConfigValidation.safeParse({
      provider: 'iqpro',
      clientId: 'cid',
      clientSecret: 'shhh',
      gatewayId: 'gid',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a config without clientSecret (means "keep existing")', () => {
    const result = UpdatePaymentProviderConfigValidation.safeParse({
      provider: 'iqpro',
      clientId: 'cid',
      gatewayId: 'gid',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty clientId', () => {
    const result = UpdatePaymentProviderConfigValidation.safeParse({
      provider: 'iqpro',
      clientId: '',
      gatewayId: 'gid',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty gatewayId', () => {
    const result = UpdatePaymentProviderConfigValidation.safeParse({
      provider: 'iqpro',
      clientId: 'cid',
      gatewayId: '',
    });

    expect(result.success).toBe(false);
  });

  it('trims whitespace on all fields', () => {
    const result = UpdatePaymentProviderConfigValidation.safeParse({
      provider: 'iqpro',
      clientId: '  cid  ',
      clientSecret: '  s  ',
      gatewayId: '  gid  ',
    });

    expect(result.success).toBe(true);

    // Narrow on the discriminant before reading provider-specific fields —
    // that the compiler insists on this is the union doing its job.
    if (result.success && result.data.provider === 'iqpro') {
      expect(result.data.clientId).toBe('cid');
      expect(result.data.gatewayId).toBe('gid');
      expect(result.data.clientSecret).toBe('s');
    }
  });

  it('rejects oversized inputs', () => {
    const tooLong = 'x'.repeat(600);
    const result = UpdatePaymentProviderConfigValidation.safeParse({
      provider: 'iqpro',
      clientId: 'cid',
      clientSecret: tooLong,
      gatewayId: 'gid',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a full Square config', () => {
    const result = UpdatePaymentProviderConfigValidation.safeParse({
      provider: 'square',
      applicationId: 'sandbox-sq0idb-abc',
      locationId: 'L123',
      environment: 'sandbox',
      accessToken: 'tok',
      webhookSignatureKey: 'key',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a Square config without secrets (merge-on-omit)', () => {
    // Secrets are never sent back to the browser, so omitting them means
    // "keep the stored ones".
    const result = UpdatePaymentProviderConfigValidation.safeParse({
      provider: 'square',
      applicationId: 'sandbox-sq0idb-abc',
      locationId: 'L123',
      environment: 'sandbox',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown environment rather than defaulting it', () => {
    // A typo must not silently mean production.
    const result = UpdatePaymentProviderConfigValidation.safeParse({
      provider: 'square',
      applicationId: 'a',
      locationId: 'l',
      environment: 'staging',
    });

    expect(result.success).toBe(false);
  });

  it('rejects IQPro fields sent under the square discriminant', () => {
    const result = UpdatePaymentProviderConfigValidation.safeParse({
      provider: 'square',
      clientId: 'c',
      gatewayId: 'g',
    });

    expect(result.success).toBe(false);
  });
});
