import { describe, expect, it } from 'vitest';
import { deriveRpcPrefix } from './rpcPrefix';

describe('deriveRpcPrefix', () => {
  it('returns /rpc for the default (unprefixed) locale path', () => {
    expect(deriveRpcPrefix('/rpc/member/updateLastAccessed')).toBe('/rpc');
  });

  it('returns /rpc for a bare /rpc path', () => {
    expect(deriveRpcPrefix('/rpc')).toBe('/rpc');
  });

  it('includes the locale segment for a non-default locale path', () => {
    expect(deriveRpcPrefix('/ja/rpc/member/updateLastAccessed')).toBe('/ja/rpc');
  });

  it('handles every configured non-default locale', () => {
    expect(deriveRpcPrefix('/fr/rpc/dashboard/stats')).toBe('/fr/rpc');
    expect(deriveRpcPrefix('/ja/rpc/dashboard/stats')).toBe('/ja/rpc');
  });

  it('preserves the /rpc suffix regardless of the trailing procedure path', () => {
    expect(deriveRpcPrefix('/ja/rpc/a/b/c/d')).toBe('/ja/rpc');
    expect(deriveRpcPrefix('/rpc/a/b/c/d')).toBe('/rpc');
  });

  it('always returns a value beginning with a slash', () => {
    for (const p of ['/rpc/x', '/ja/rpc/x', '/fr/rpc']) {
      expect(deriveRpcPrefix(p).startsWith('/')).toBe(true);
    }
  });
});
