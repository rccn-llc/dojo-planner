import type { TenantDb } from './TenantDb';
import { describe, expect, it, vi } from 'vitest';
import { db } from './DB';
import { runWithTenant } from './TenantContext';

/**
 * A stand-in with the same SHAPE the real drizzle handle exposes: the six
 * forwarded methods plus a nested `query` object. The Proxy's contract is about
 * forwarding, so the stand-in only has to be shaped correctly, not real.
 */
function makeFakeDb(label: string) {
  return {
    __label: label,
    select: vi.fn(function (this: unknown) {
      return { from: () => `select:${label}`, boundThis: this };
    }),
    insert: vi.fn(() => `insert:${label}`),
    update: vi.fn(() => `update:${label}`),
    delete: vi.fn(() => `delete:${label}`),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        insert: () => `tx.insert:${label}`,
        query: { memberSchema: { findFirst: () => `tx.query:${label}` } },
      })),
    query: {
      memberSchema: { findFirst: vi.fn(async () => `member:${label}`) },
      organizationSchema: { findFirst: vi.fn(async () => `org:${label}`) },
    },
  };
}

const asTenantDb = (fake: ReturnType<typeof makeFakeDb>) => fake as unknown as TenantDb;

const withDb = <T>(fake: ReturnType<typeof makeFakeDb>, fn: () => T): T =>
  runWithTenant({ orgId: 'org_test', db: asTenantDb(fake), source: 'test' }, fn);

describe('db proxy', () => {
  describe('outside a tenant scope', () => {
    it('throws on method access rather than falling back to a default connection', () => {
      // The whole point of the seam: no silent default. A missing scope is a
      // bug and must surface as one.
      expect(() => db.select()).toThrow(/No tenant scope/);
    });

    it('throws on nested relational access', () => {
      expect(() => db.query.memberSchema).toThrow(/No tenant scope/);
    });

    it('throws on `in` checks', () => {
      expect(() => 'select' in db).toThrow(/No tenant scope/);
    });
  });

  describe('forwarding', () => {
    it('forwards all six query-builder entry points', () => {
      const fake = makeFakeDb('a');

      withDb(fake, () => {
        db.select();
        db.insert({} as never);
        db.update({} as never);
        db.delete({} as never);
      });

      expect(fake.select).toHaveBeenCalled();
      expect(fake.insert).toHaveBeenCalled();
      expect(fake.update).toHaveBeenCalled();
      expect(fake.delete).toHaveBeenCalled();
    });

    it('forwards the three-level relational chain (db.query.X.findFirst)', async () => {
      // Regression guard: `get('query')` must return the real nested object.
      // A function-only trap would break every db.query.X.findFirst call site.
      const fake = makeFakeDb('a');

      const result = await withDb(fake, async () => db.query.memberSchema.findFirst({} as never));

      expect(result).toBe('member:a');
      expect(fake.query.memberSchema.findFirst).toHaveBeenCalled();
    });

    it('forwards transaction and hands the callback a real tx', async () => {
      const fake = makeFakeDb('a');

      const result = await withDb(fake, async () =>
        db.transaction(async (tx: any) => tx.insert()));

      expect(result).toBe('tx.insert:a');
    });

    it('gives the transaction callback a tx whose own query chain works', async () => {
      // Two production sites use tx.query inside a transaction.
      const fake = makeFakeDb('a');

      const result = await withDb(fake, async () =>
        db.transaction(async (tx: any) => tx.query.memberSchema.findFirst()));

      expect(result).toBe('tx.query:a');
    });

    it('binds methods so `this` remains the resolved instance', () => {
      // Without binding, drizzle's internals lose `this` the moment a method is
      // detached or passed along.
      const fake = makeFakeDb('a');

      const boundThis = withDb(fake, () => (db.select() as unknown as { boundThis: unknown }).boundThis);

      expect(boundThis).toBe(fake);
    });

    it('supports `in` and key enumeration inside a scope', () => {
      const fake = makeFakeDb('a');

      withDb(fake, () => {
        expect('select' in db).toBe(true);
        expect('nonexistent' in db).toBe(false);
        expect(Object.keys(db)).toContain('transaction');
      });
    });
  });

  describe('tenant resolution', () => {
    it('routes to whichever tenant is active', () => {
      const first = makeFakeDb('one');
      const second = makeFakeDb('two');

      const a = withDb(first, () => (db.select() as unknown as { from: () => string }).from());
      const b = withDb(second, () => (db.select() as unknown as { from: () => string }).from());

      expect(a).toBe('select:one');
      expect(b).toBe('select:two');
    });

    it('resolves per access, not once at import', async () => {
      // The module-level `db` is a single object; correctness depends on it
      // resolving at ACCESS time. If it captured a handle at import, concurrent
      // requests would share one tenant's connection.
      const first = makeFakeDb('one');
      const second = makeFakeDb('two');

      const [a, b] = await Promise.all([
        runWithTenant({ orgId: 'org_1', db: asTenantDb(first), source: 'test' }, async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return (db.select() as unknown as { from: () => string }).from();
        }),
        runWithTenant({ orgId: 'org_2', db: asTenantDb(second), source: 'test' }, async () =>
          (db.select() as unknown as { from: () => string }).from()),
      ]);

      expect(a).toBe('select:one');
      expect(b).toBe('select:two');
    });
  });
});
