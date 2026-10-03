import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { getClerkFrontendApiOrigin } from './ClerkFrontendApi';

const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64');

describe('getClerkFrontendApiOrigin', () => {
  it('decodes a production key to its custom-domain Frontend API', () => {
    expect(getClerkFrontendApiOrigin(`pk_live_${encode('clerk.example.com$')}`))
      .toBe('https://clerk.example.com');
  });

  it('decodes a development key to its accounts.dev host', () => {
    expect(getClerkFrontendApiOrigin(`pk_test_${encode('test-instance-00.clerk.accounts.dev$')}`))
      .toBe('https://test-instance-00.clerk.accounts.dev');
  });

  it('tolerates surrounding whitespace', () => {
    expect(getClerkFrontendApiOrigin(`  pk_live_${encode('clerk.example.com$')}\n`))
      .toBe('https://clerk.example.com');
  });

  it('returns null for a missing key', () => {
    expect(getClerkFrontendApiOrigin(undefined)).toBeNull();
    expect(getClerkFrontendApiOrigin('')).toBeNull();
  });

  it('returns null for a key without the pk_ prefix', () => {
    expect(getClerkFrontendApiOrigin(`sk_live_${encode('clerk.example.com$')}`)).toBeNull();
  });

  it('returns null when the decoded value lacks the trailing $', () => {
    expect(getClerkFrontendApiOrigin(`pk_live_${encode('clerk.example.com')}`)).toBeNull();
  });

  it('rejects a decoded value that would inject extra CSP sources', () => {
    expect(getClerkFrontendApiOrigin(`pk_live_${encode('clerk.example.com https://evil.test$')}`)).toBeNull();
    expect(getClerkFrontendApiOrigin(`pk_live_${encode('clerk.example.com; script-src *$')}`)).toBeNull();
    expect(getClerkFrontendApiOrigin(`pk_live_${encode('*.example.com$')}`)).toBeNull();
  });

  it('rejects a single-label host', () => {
    expect(getClerkFrontendApiOrigin(`pk_live_${encode('localhost$')}`)).toBeNull();
  });
});
