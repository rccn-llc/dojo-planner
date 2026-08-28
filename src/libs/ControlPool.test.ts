import { beforeEach, describe, expect, it, vi } from 'vitest';

const envValues: Record<string, string | undefined> = {};
vi.mock('./Env', () => ({ Env: new Proxy({}, { get: (_t, k: string) => envValues[k] }) }));

const poolConfigs: Array<{ connectionString?: string; max?: number }> = [];
vi.mock('pg', () => ({
  Pool: class {
    constructor(config: { connectionString?: string; max?: number }) {
      poolConfigs.push(config);
    }

    on() {}
  },
}));

async function freshPool() {
  vi.resetModules();
  poolConfigs.length = 0;
  const globalForControlPool = globalThis as unknown as { controlPool?: unknown };
  delete globalForControlPool.controlPool;
  const mod = await import('./ControlPool');
  mod.getControlPool();
  return poolConfigs[0]!;
}

describe('control pool sizing', () => {
  beforeEach(() => {
    for (const k of Object.keys(envValues)) {
      delete envValues[k];
    }
    envValues.DATABASE_URL = 'postgres://one';
  });

  it('caps at ONE connection while sharing a database with the tenant pool', async () => {
    // pglite-server accepts exactly one connection, and the tenant pool already
    // holds it. A second is refused as `read ECONNRESET` mid-query.
    delete envValues.CONTROL_DATABASE_URL;

    expect((await freshPool()).max).toBe(1);
  });

  it('caps at ONE while both planes address the same database', async () => {
    // The regression this pins: sizing was briefly derived from a routing
    // flag rather than the connection string, so a local flip opened a second
    // socket against the same pglite-server and every tenant lookup died on a
    // connection reset. Pool size is a property of the SOCKET.
    envValues.CONTROL_DATABASE_URL = 'postgres://one';
    envValues.DATABASE_URL = 'postgres://one';

    expect((await freshPool()).max).toBe(1);
  });

  it('allows a second connection once the control plane is a distinct database', async () => {
    envValues.CONTROL_DATABASE_URL = 'postgres://control';

    expect((await freshPool()).max).toBe(2);
  });
});
