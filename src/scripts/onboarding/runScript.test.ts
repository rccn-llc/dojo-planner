import { describe, expect, it, vi } from 'vitest';
import { buildChildEnv, runScript } from './runScript';

describe('buildChildEnv', () => {
  const shell = {
    PATH: '/usr/bin',
    HOME: '/home/op',
    IQPRO_CLIENT_ID: 'stray-platform-cred',
    DATABASE_URL: 'postgresql://localhost/dev',
    IQPRO_CONFIG_ENCRYPTION_KEY: 'dev-key',
  };

  it('keeps process plumbing and the explicit variables only', () => {
    const env = buildChildEnv({ CONTROL_DATABASE_URL: 'postgres://control', CONTROL_PLANE_ENCRYPTION_KEY: 'prod-key' }, shell);

    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/op',
      CONTROL_DATABASE_URL: 'postgres://control',
      CONTROL_PLANE_ENCRYPTION_KEY: 'prod-key',
    });
  });

  it('never forwards stray configuration from the operator\'s shell', () => {
    const env = buildChildEnv({}, shell);

    expect(env.IQPRO_CLIENT_ID).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.IQPRO_CONFIG_ENCRYPTION_KEY).toBeUndefined();
  });

  it('drops undefined explicit values instead of setting the string "undefined"', () => {
    expect(buildChildEnv({ DATABASE_URL: undefined }, shell)).not.toHaveProperty('DATABASE_URL');
  });
});

describe('runScript', () => {
  it('runs the script through tsx with the given env', () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    runScript('Provision', 'src/scripts/provisionTenant.ts', ['--orgId=org_1'], { PATH: '/bin' }, spawn);

    expect(spawn).toHaveBeenCalledWith('npx', ['tsx', 'src/scripts/provisionTenant.ts', '--orgId=org_1'], { stdio: 'inherit', env: { PATH: '/bin' } });
  });

  it('throws on a non-zero exit so later steps never run', () => {
    expect(() => runScript('Seed', 's.ts', [], {}, () => ({ status: 1 }))).toThrow(/Seed failed \(exit 1\)/);
    expect(() => runScript('Seed', 's.ts', [], {}, () => ({ status: null }))).toThrow(/exit signal/);
  });
});
