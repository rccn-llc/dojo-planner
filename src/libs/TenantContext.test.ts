import type { TenantDb } from './TenantDb';
import { describe, expect, it } from 'vitest';
import {
  enterTenantScope,
  getTenantScope,
  requireTenantScope,
  runWithTenant,
} from './TenantContext';

// The scope only ever carries the handle through; nothing here calls it.
const fakeDb = (label: string) => ({ __label: label } as unknown as TenantDb);

describe('tenantContext', () => {
  describe('runWithTenant', () => {
    it('makes the scope visible inside the callback', () => {
      const scope = { orgId: 'org_a', db: fakeDb('a'), source: 'test' as const };

      runWithTenant(scope, () => {
        expect(getTenantScope()).toBe(scope);
      });
    });

    it('does not leak the scope after the callback returns', () => {
      runWithTenant({ orgId: 'org_a', db: fakeDb('a'), source: 'test' }, () => {});

      expect(getTenantScope()).toBeUndefined();
    });

    it('keeps the scope across await boundaries', async () => {
      await runWithTenant(
        { orgId: 'org_a', db: fakeDb('a'), source: 'test' },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 5));

          expect(getTenantScope()?.orgId).toBe('org_a');
        },
      );
    });

    it('isolates concurrent scopes', async () => {
      // The property that makes this safe under concurrent requests: two
      // interleaved async flows must never observe each other's tenant.
      const [first, second] = await Promise.all([
        runWithTenant({ orgId: 'org_a', db: fakeDb('a'), source: 'test' }, async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return getTenantScope()?.orgId;
        }),
        runWithTenant({ orgId: 'org_b', db: fakeDb('b'), source: 'test' }, async () => {
          return getTenantScope()?.orgId;
        }),
      ]);

      expect(first).toBe('org_a');
      expect(second).toBe('org_b');
    });

    it('supports nesting, with the inner scope winning', () => {
      runWithTenant({ orgId: 'outer', db: fakeDb('outer'), source: 'test' }, () => {
        runWithTenant({ orgId: 'inner', db: fakeDb('inner'), source: 'test' }, () => {
          expect(getTenantScope()?.orgId).toBe('inner');
        });

        expect(getTenantScope()?.orgId).toBe('outer');
      });
    });

    it('returns the callback result', () => {
      const result = runWithTenant(
        { orgId: 'org_a', db: fakeDb('a'), source: 'test' },
        () => 'value',
      );

      expect(result).toBe('value');
    });
  });

  describe('requireTenantScope', () => {
    it('returns the scope when one is active', () => {
      const scope = { orgId: 'org_a', db: fakeDb('a'), source: 'test' as const };

      runWithTenant(scope, () => {
        expect(requireTenantScope()).toBe(scope);
      });
    });

    it('throws a diagnostic error outside a scope', () => {
      // Fail-closed: a database access with no tenant must be loud, never a
      // silent fall-back to some default connection.
      expect(() => requireTenantScope()).toThrow(/No tenant scope/);
      expect(() => requireTenantScope()).toThrow(/TenantContext/);
    });
  });

  describe('enterTenantScope', () => {
    it('applies to the remainder of the current async context', async () => {
      // Wrapped in runWithTenant so enterWith cannot leak into sibling tests.
      await runWithTenant({ orgId: 'placeholder', db: fakeDb('p'), source: 'test' }, async () => {
        enterTenantScope({ orgId: 'org_entered', db: fakeDb('entered'), source: 'rsc' });

        expect(getTenantScope()?.orgId).toBe('org_entered');
      });
    });
  });
});
