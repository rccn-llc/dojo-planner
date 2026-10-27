import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptWithKey, parseKeyHex } from '../../libs/CryptoCore';
import {
  checkClerkKeyForTarget,
  checkControlPlaneMatchesClerk,
  checkEncryptionKeyAgainstTenants,
  checkIqproEnvironment,
  checkSquareCredentials,
  checkSquareEnvironment,
  checkTenantConnectionString,
  sameDatabase,
  shellOverrides,
  slugify,
  validateEmail,
  validateSlug,
} from './preflight';

const POOLED = 'postgresql://owner:npg_realpass@ep-test-123-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';
const CONTROL = 'postgresql://owner:npg_other@ep-control-9-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';

describe('slugify / validateSlug', () => {
  it('slugifies a dojo name', () => {
    expect(slugify('CTA San Carlos!')).toBe('cta-san-carlos');
    expect(slugify('  Équipe  Dojo -- HQ ')).toBe('equipe-dojo-hq');
  });

  it('accepts good slugs and rejects bad ones', () => {
    expect(validateSlug('cta-san-carlos')).toBeNull();
    expect(validateSlug('a')).toBeNull();
    expect(validateSlug('-bad')).not.toBeNull();
    expect(validateSlug('Bad')).not.toBeNull();
    expect(validateSlug('a'.repeat(51))).not.toBeNull();
  });

  it('rejects an org_ prefix the kiosk would treat as a raw id', () => {
    expect(validateSlug('org_abc')).not.toBeNull();
    expect(validateSlug('org-abc')).toBeNull();
  });
});

describe('validateEmail', () => {
  it('accepts a normal address and rejects junk', () => {
    expect(validateEmail('owner@example.com')).toBeNull();
    expect(validateEmail('owner@example')).not.toBeNull();
    expect(validateEmail('not an email')).not.toBeNull();
  });
});

describe('checkClerkKeyForTarget', () => {
  it('requires a live key for production and a test key for preview', () => {
    expect(checkClerkKeyForTarget('sk_live_x', 'production')).toBeNull();
    expect(checkClerkKeyForTarget('sk_test_x', 'preview')).toBeNull();
    expect(checkClerkKeyForTarget('sk_test_x', 'production')).toMatch(/expects sk_live_/);
    expect(checkClerkKeyForTarget('sk_live_x', 'preview')).toMatch(/expects sk_test_/);
  });

  it('rejects something that is not a Clerk secret key', () => {
    expect(checkClerkKeyForTarget('pk_live_x', 'production')).toMatch(/not a Clerk secret key/);
  });
});

describe('checkTenantConnectionString', () => {
  it('accepts a pooled Neon URL with a real password', () => {
    expect(checkTenantConnectionString(POOLED, CONTROL)).toEqual([]);
  });

  it('flags a masked password', () => {
    const masked = POOLED.replace('npg_realpass', '************');

    expect(checkTenantConnectionString(masked, CONTROL).join()).toMatch(/masked/);
  });

  it('flags a direct (non-pooled) Neon host', () => {
    const direct = POOLED.replace('-pooler', '');

    expect(checkTenantConnectionString(direct, CONTROL).join()).toMatch(/POOLED/);
  });

  it('flags the control database, even via its direct host', () => {
    expect(checkTenantConnectionString(CONTROL, CONTROL).join()).toMatch(/CONTROL/);
  });

  it('rejects a non-URL', () => {
    expect(checkTenantConnectionString('nonsense', CONTROL)).toEqual(['Not a valid connection string URL.']);
  });
});

describe('sameDatabase', () => {
  it('treats two servers on the same host but different ports as different databases', () => {
    expect(sameDatabase('postgresql://p:p@127.0.0.1:5433/postgres', 'postgresql://p:p@127.0.0.1:5434/postgres')).toBe(false);
    expect(sameDatabase('postgresql://p:p@127.0.0.1:5433/postgres', 'postgresql://q:q@127.0.0.1:5433/postgres')).toBe(true);
  });

  it('ignores credentials and pooler-vs-direct', () => {
    expect(sameDatabase(POOLED, POOLED.replace('npg_realpass', 'x').replace('-pooler', ''))).toBe(true);
    expect(sameDatabase(POOLED, CONTROL)).toBe(false);
  });
});

describe('checkEncryptionKeyAgainstTenants', () => {
  const key = parseKeyHex(randomBytes(32).toString('hex'));
  const wrong = parseKeyHex(randomBytes(32).toString('hex'));
  const rows = [
    { orgId: 'org_a', connectionStringEncrypted: encryptWithKey('postgres://a', key) },
    { orgId: 'org_legacy', connectionStringEncrypted: '__shared__' },
  ];

  it('passes when the key decrypts every row (sentinel rows ignored)', () => {
    expect(checkEncryptionKeyAgainstTenants(rows, key, '__shared__')).toBeNull();
  });

  it('names the rows a wrong key cannot decrypt', () => {
    expect(checkEncryptionKeyAgainstTenants(rows, wrong, '__shared__')).toMatch(/org_a/);
  });

  it('passes on an empty control plane', () => {
    expect(checkEncryptionKeyAgainstTenants([], wrong, '__shared__')).toBeNull();
  });
});

describe('checkIqproEnvironment', () => {
  const SANDBOX_BASE = 'https://sandbox.api.basyspro.com/iqsaas/v1';
  const SANDBOX_OAUTH = 'https://sandbox.account.basyspro.com/x/token';
  const LIVE_BASE = 'https://api.basyspro.com/iqsaas/v1';
  const LIVE_OAUTH = 'https://account.basyspro.com/x/token';

  it('passes matching environments', () => {
    expect(checkIqproEnvironment(LIVE_BASE, LIVE_OAUTH, 'production')).toBeNull();
    expect(checkIqproEnvironment(SANDBOX_BASE, SANDBOX_OAUTH, 'preview')).toBeNull();
  });

  it('warns on sandbox in production and live in preview', () => {
    expect(checkIqproEnvironment(SANDBOX_BASE, SANDBOX_OAUTH, 'production')).toMatch(/SANDBOX/);
    expect(checkIqproEnvironment(LIVE_BASE, LIVE_OAUTH, 'preview')).toMatch(/LIVE/);
  });

  it('warns when the two URLs disagree', () => {
    expect(checkIqproEnvironment(LIVE_BASE, SANDBOX_OAUTH, 'production')).toMatch(/different IQPro environments/);
  });

  it('warns on a trailing slash', () => {
    expect(checkIqproEnvironment(`${LIVE_BASE}/`, LIVE_OAUTH, 'production')).toMatch(/trailing slash/);
  });
});

describe('checkControlPlaneMatchesClerk', () => {
  it('refuses a control plane whose orgs are unknown to this Clerk instance — the production/preview crossover', () => {
    expect(checkControlPlaneMatchesClerk(['org_prodA', 'org_prodB'], [], 'preview'))
      .toMatch(/None of the control database's organizations \(org_prodA, org_prodB\) exist in this Clerk preview instance/);
  });

  it('passes when at least one sampled org exists (preview may hold orgs deleted from Clerk)', () => {
    expect(checkControlPlaneMatchesClerk(['org_a', 'org_gone'], ['org_a'], 'preview')).toBeNull();
  });

  it('passes on an empty control plane', () => {
    expect(checkControlPlaneMatchesClerk([], [], 'production')).toBeNull();
  });
});

describe('shellOverrides', () => {
  it('lists only the environment-selecting variables set in the shell', () => {
    expect(shellOverrides({ CONTROL_DATABASE_URL: 'postgres://prod', PATH: '/bin', VERCEL_TOKEN: 't', IQPRO_BASE_URL: '' }))
      .toEqual(['CONTROL_DATABASE_URL']);
  });
});

describe('checkSquareCredentials', () => {
  const VALID = {
    applicationId: 'sandbox-sq0idb-app',
    locationId: 'LOC1',
    accessToken: 'tok',
    webhookSignatureKey: 'sig',
    environment: 'sandbox' as const,
  };

  it('passes consistent credentials', () => {
    expect(checkSquareCredentials(VALID)).toEqual([]);
    expect(checkSquareCredentials({ ...VALID, applicationId: 'sq0idp-live', environment: 'production' })).toEqual([]);
  });

  it('names every missing field at once', () => {
    expect(checkSquareCredentials({ ...VALID, accessToken: '', webhookSignatureKey: ' ' })).toEqual([
      'The Square Access Token is required.',
      'The Square Webhook Signature Key is required.',
    ]);
  });

  it('catches an Application ID from the other environment without a network call', () => {
    expect(checkSquareCredentials({ ...VALID, environment: 'production' }).join()).toMatch(/SANDBOX id/);
    expect(checkSquareCredentials({ ...VALID, applicationId: 'sq0idp-live' }).join()).toMatch(/not a sandbox id/);
  });
});

describe('checkSquareEnvironment', () => {
  it('warns on sandbox in production and production in preview', () => {
    expect(checkSquareEnvironment('sandbox', 'production')).toMatch(/SANDBOX/);
    expect(checkSquareEnvironment('production', 'preview')).toMatch(/real cards/);
    expect(checkSquareEnvironment('production', 'production')).toBeNull();
    expect(checkSquareEnvironment('sandbox', 'preview')).toBeNull();
  });
});
