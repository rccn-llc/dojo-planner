import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { argValue } from './EnvFiles';

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
