import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { argValue, loadEnvFile } from './EnvFiles';

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
});

describe('argValue', () => {
  it('keeps a connection string whose query parameters contain "="', () => {
    // The regression: `.split('=')[1]` truncated
    // `--target=postgres://…?sslmode=require&channel_binding=require`
    // to `postgres://…?sslmode`, dropping SSL entirely. Against Neon that
    // surfaced as a misleading "connection is insecure"; against a permissive
    // server it would have connected UNENCRYPTED with no error at all.
    const conn = 'postgresql://u:p@host.neon.tech/neondb?sslmode=require&channel_binding=require';
    process.argv = ['node', 'script.ts', `--target=${conn}`];

    expect(argValue('target')).toBe(conn);
  });

  it('reads a simple value', () => {
    process.argv = ['node', 'script.ts', '--orgId=org_abc'];

    expect(argValue('orgId')).toBe('org_abc');
  });

  it('returns undefined when the flag is absent', () => {
    process.argv = ['node', 'script.ts', '--other=1'];

    expect(argValue('orgId')).toBeUndefined();
  });

  it('does not match a flag that merely starts with the same letters', () => {
    process.argv = ['node', 'script.ts', '--orgIdSuffix=nope'];

    expect(argValue('orgId')).toBeUndefined();
  });
});

describe('hostOf', () => {
  it('returns the host, never the credentials', async () => {
    // This is what every ops script prints to say which database it is about
    // to touch, so it must never leak the password.
    const { hostOf } = await import('./EnvFiles');
    const host = hostOf('postgresql://user:npg_secret_not_real@ep-x-pooler.aws.neon.tech/db');

    expect(host).toBe('ep-x-pooler.aws.neon.tech');
    expect(host).not.toContain('npg_secret_not_real');
  });

  it('degrades rather than throwing on an unparseable string', async () => {
    const { hostOf } = await import('./EnvFiles');

    expect(hostOf('__shared_database__')).toBe('(unparseable connection string)');
  });
});

describe('loadEnvFile', () => {
  const KEYS = ['ENVFILES_TEST_A', 'ENVFILES_TEST_B', 'ENVFILES_TEST_C'];

  afterEach(() => {
    for (const key of KEYS) {
      delete process.env[key];
    }
  });

  function file(contents: string): string {
    const full = path.join(mkdtempSync(path.join(tmpdir(), 'envfiles-')), '.env.test');
    writeFileSync(full, contents);
    return full;
  }

  it('loads values, unquoting and skipping comments and blank lines', () => {
    const loaded = loadEnvFile(file('# comment\n\nENVFILES_TEST_A="quoted=value"\nENVFILES_TEST_B=\'single\'\n'));

    expect(loaded).toBe(true);
    expect(process.env.ENVFILES_TEST_A).toBe('quoted=value');
    expect(process.env.ENVFILES_TEST_B).toBe('single');
  });

  it('never overrides a variable already in the environment', () => {
    process.env.ENVFILES_TEST_C = 'from-shell';
    loadEnvFile(file('ENVFILES_TEST_C=from-file\n'));

    expect(process.env.ENVFILES_TEST_C).toBe('from-shell');
  });

  it('returns false for a missing file', () => {
    expect(loadEnvFile(path.join(tmpdir(), 'does-not-exist.env'))).toBe(false);
  });
});
