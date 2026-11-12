import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { buildChildEnv, runScript, ScriptFailedError } from './runScript';

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

  it('captures output when asked, and keeps it off the console on failure', () => {
    const spawn = vi.fn((_command: string, _args: string[], _options: { stdio: string }) => ({ status: 2, stdout: Buffer.from('host db.internal\n'), stderr: Buffer.from('boom') }));

    let caught: unknown;
    try {
      runScript('Provision', 'p.ts', [], {}, spawn, { capture: true });
    } catch (error) {
      caught = error;
    }

    expect(spawn.mock.calls[0]?.[2]).toMatchObject({ stdio: 'pipe' });
    expect(caught).toBeInstanceOf(ScriptFailedError);
    expect((caught as ScriptFailedError).message).toBe('Provision failed (exit 2).');
    expect((caught as ScriptFailedError).output).toBe('host db.internal\nboom');
  });

  it('keeps only the tail of a long captured output', () => {
    const spawn = () => ({ status: 1, stdout: Buffer.from('x'.repeat(10_000)), stderr: null });

    try {
      runScript('Seed', 's.ts', [], {}, spawn, { capture: true });
    } catch (error) {
      expect((error as ScriptFailedError).output).toHaveLength(3000);
    }
  });

  it('has no captured output for an inherited (interactive) run', () => {
    try {
      runScript('Seed', 's.ts', [], {}, () => ({ status: 1 }));
    } catch (error) {
      expect((error as ScriptFailedError).output).toBeNull();
    }
  });
});
