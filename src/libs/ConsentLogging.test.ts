import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from './consent/constants';

/**
 * Covers the browser-only consent gate on Better Stack log shipping
 * (src/libs/Logger.ts). The sink itself is not exported, so this exercises the
 * exact predicate it uses — `typeof window !== 'undefined' && !hasConsent(...)`
 * — against the real store, including the server case where it must not apply.
 */
function installStorage(seed?: string) {
  const map = new Map<string, string>();

  if (seed !== undefined) {
    map.set(CONSENT_STORAGE_KEY, seed);
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
      removeItem: (key: string) => map.delete(key),
    },
    configurable: true,
    writable: true,
  });
}

function grantedRecord(analytics: boolean) {
  return JSON.stringify({
    version: CONSENT_VERSION,
    timestamp: Date.now(),
    method: 'custom',
    categories: { necessary: true, functional: false, analytics },
  });
}

/** Mirrors the guard inside `betterStackSink`. */
async function shouldShip() {
  const { hasConsent } = await import('./consent/ConsentStore');

  return !(typeof window !== 'undefined' && !hasConsent('analytics'));
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
  Reflect.deleteProperty(globalThis, 'window');
});

describe('better stack browser consent gate', () => {
  it('suppresses browser log shipping when analytics consent is absent', async () => {
    Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true, writable: true });
    installStorage();

    await expect(shouldShip()).resolves.toBe(false);
  });

  it('suppresses browser log shipping when analytics is explicitly rejected', async () => {
    Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true, writable: true });
    installStorage(grantedRecord(false));

    await expect(shouldShip()).resolves.toBe(false);
  });

  it('ships from the browser once analytics consent is granted', async () => {
    Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true, writable: true });
    installStorage(grantedRecord(true));

    await expect(shouldShip()).resolves.toBe(true);
  });

  // The important one: server logging and the SOC2 audit trail must never be
  // suppressed by a visitor's browser choice.
  it('always ships on the server regardless of consent state', async () => {
    Reflect.deleteProperty(globalThis, 'window');
    installStorage(grantedRecord(false));

    await expect(shouldShip()).resolves.toBe(true);
  });
});
