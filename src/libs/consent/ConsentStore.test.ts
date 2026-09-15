import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_MAX_AGE_MS, CONSENT_MAX_CLOCK_SKEW_MS, CONSENT_STORAGE_KEY, CONSENT_VERSION } from './constants';

/**
 * The store caches state in module scope and wires window listeners once, so
 * every test re-imports it fresh via `vi.resetModules()` + dynamic import.
 */
async function loadStore() {
  return import('./ConsentStore');
}

/** Minimal in-memory localStorage stand-in — node has none. */
function installStorage(seed?: string) {
  const map = new Map<string, string>();

  if (seed !== undefined) {
    map.set(CONSENT_STORAGE_KEY, seed);
  }

  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });

  return map;
}

function installWindow() {
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    value: target,
    configurable: true,
    writable: true,
  });

  return target;
}

function validRecord(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: CONSENT_VERSION,
    timestamp: Date.now(),
    method: 'custom',
    categories: { necessary: true, functional: false, analytics: true },
    ...overrides,
  });
}

beforeEach(() => {
  vi.resetModules();
  installStorage();
  installWindow();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'localStorage');
  Reflect.deleteProperty(globalThis, 'window');
});

describe('ConsentStore', () => {
  describe('defaults', () => {
    it('denies every optional category when nothing is stored', async () => {
      const store = await loadStore();

      expect(store.hasConsent('analytics')).toBe(false);
      expect(store.hasConsent('functional')).toBe(false);
      expect(store.hasConsent('necessary')).toBe(true);
      expect(store.needsConsentDecision()).toBe(true);
    });
  });

  describe('persistence', () => {
    it('acceptAll grants both optional categories and records the method', async () => {
      const map = installStorage();
      const store = await loadStore();

      store.acceptAll();

      const stored = JSON.parse(map.get(CONSENT_STORAGE_KEY)!);

      expect(stored.version).toBe(CONSENT_VERSION);
      expect(stored.method).toBe('accept_all');
      expect(stored.categories).toEqual({ necessary: true, functional: true, analytics: true });
      expect(store.hasConsent('analytics')).toBe(true);
    });

    // The "rejection is remembered" guarantee — the most important test here.
    it('rejectAll persists a decision so the banner does not return', async () => {
      const map = installStorage();
      const store = await loadStore();

      store.rejectAll();

      const stored = JSON.parse(map.get(CONSENT_STORAGE_KEY)!);

      expect(stored.method).toBe('reject_all');
      expect(stored.categories.analytics).toBe(false);
      expect(store.needsConsentDecision()).toBe(false);
      expect(store.hasConsent('analytics')).toBe(false);
    });

    it('setConsent leaves unlisted categories denied', async () => {
      const store = await loadStore();

      store.setConsent({ analytics: true });

      expect(store.hasConsent('analytics')).toBe(true);
      expect(store.hasConsent('functional')).toBe(false);
    });

    it('never lets necessary be revoked', async () => {
      const map = installStorage();
      const store = await loadStore();

      store.setConsent({ necessary: false } as never);

      expect(store.hasConsent('necessary')).toBe(true);
      expect(JSON.parse(map.get(CONSENT_STORAGE_KEY)!).categories.necessary).toBe(true);
    });

    it('resetConsent clears the record and re-prompts', async () => {
      const map = installStorage();
      const store = await loadStore();

      store.acceptAll();
      store.resetConsent();

      expect(map.has(CONSENT_STORAGE_KEY)).toBe(false);
      expect(store.needsConsentDecision()).toBe(true);
    });
  });

  describe('invalidation', () => {
    it('re-prompts and clears the record when the policy version is superseded', async () => {
      const map = installStorage(validRecord({ version: 0 }));
      const store = await loadStore();

      expect(store.needsConsentDecision()).toBe(true);
      expect(map.has(CONSENT_STORAGE_KEY)).toBe(false);
    });

    it('re-prompts once a decision is older than the max age', async () => {
      installStorage(validRecord({ timestamp: Date.now() - CONSENT_MAX_AGE_MS - 1 }));
      const store = await loadStore();

      expect(store.needsConsentDecision()).toBe(true);
    });

    it('still honours a decision just inside the max age', async () => {
      installStorage(validRecord({ timestamp: Date.now() - CONSENT_MAX_AGE_MS + 1000 }));
      const store = await loadStore();

      expect(store.needsConsentDecision()).toBe(false);
      expect(store.hasConsent('analytics')).toBe(true);
    });

    it('re-prompts and clears a record dated in the future', async () => {
      // A future timestamp is not a valid decision — it is a tampered value or
      // the residue of a device with a badly wrong clock. Honoured, it stays
      // valid until `timestamp + CONSENT_MAX_AGE_MS`, suppressing the banner
      // far past the six-month re-solicitation cadence once the clock is fixed.
      const map = installStorage(validRecord({
        timestamp: Date.now() + 5 * CONSENT_MAX_AGE_MS,
      }));
      const store = await loadStore();

      expect(store.needsConsentDecision()).toBe(true);
      expect(store.hasConsent('analytics')).toBe(false);
      expect(map.has(CONSENT_STORAGE_KEY)).toBe(false);
    });

    it('re-prompts once a future timestamp exceeds the skew tolerance', async () => {
      installStorage(validRecord({
        timestamp: Date.now() + CONSENT_MAX_CLOCK_SKEW_MS + 60_000,
      }));
      const store = await loadStore();

      expect(store.needsConsentDecision()).toBe(true);
    });

    it('still honours a decision inside the clock-skew tolerance', async () => {
      // Ordinary drift between the write and a later read must not discard a
      // choice the visitor genuinely made.
      installStorage(validRecord({
        timestamp: Date.now() + CONSENT_MAX_CLOCK_SKEW_MS - 1000,
      }));
      const store = await loadStore();

      expect(store.needsConsentDecision()).toBe(false);
      expect(store.hasConsent('analytics')).toBe(true);
    });

    it('treats corrupt JSON as no decision instead of throwing', async () => {
      const map = installStorage('{not json');
      const store = await loadStore();

      expect(store.needsConsentDecision()).toBe(true);
      expect(map.has(CONSENT_STORAGE_KEY)).toBe(false);
    });

    it.each([
      ['a bare string', '"a string"'],
      ['null', 'null'],
      ['a non-object categories field', JSON.stringify({ version: CONSENT_VERSION, timestamp: Date.now(), categories: 'nope' })],
      ['a missing timestamp', JSON.stringify({ version: CONSENT_VERSION, categories: {} })],
    ])('treats %s as no decision', async (_label, seed) => {
      installStorage(seed);
      const store = await loadStore();

      expect(store.needsConsentDecision()).toBe(true);
    });

    it('does not read a truthy-but-not-true flag as a grant', async () => {
      installStorage(validRecord({ categories: { necessary: true, functional: 1, analytics: 'yes' } }));
      const store = await loadStore();

      expect(store.hasConsent('analytics')).toBe(false);
      expect(store.hasConsent('functional')).toBe(false);
    });
  });

  describe('hostile storage', () => {
    it('honours the choice for the session when writes throw', async () => {
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => {
            throw new Error('QuotaExceededError');
          },
          removeItem: () => {},
        },
        configurable: true,
        writable: true,
      });

      const store = await loadStore();

      expect(() => store.acceptAll()).not.toThrow();
      expect(store.hasConsent('analytics')).toBe(true);
      expect(store.getConsentState().ephemeral).toBe(true);
    });

    it('does not throw when reading localStorage itself throws', async () => {
      Object.defineProperty(globalThis, 'localStorage', {
        get() {
          throw new Error('SecurityError');
        },
        configurable: true,
      });

      const store = await loadStore();

      expect(() => store.getConsentState()).not.toThrow();
      expect(store.hasConsent('analytics')).toBe(false);
    });

    it('denies everything when localStorage is absent entirely', async () => {
      Reflect.deleteProperty(globalThis, 'localStorage');
      const store = await loadStore();

      expect(() => store.getConsentState()).not.toThrow();
      expect(store.hasConsent('analytics')).toBe(false);
    });
  });

  describe('subscriptions', () => {
    it('notifies subscribers and stops after unsubscribe', async () => {
      const store = await loadStore();
      const listener = vi.fn();

      const unsubscribe = store.subscribeToConsent(listener);
      store.acceptAll();

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      store.rejectAll();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('still notifies later subscribers when an earlier one throws', async () => {
      const store = await loadStore();
      const good = vi.fn();

      store.subscribeToConsent(() => {
        throw new Error('bad subscriber');
      });
      store.subscribeToConsent(good);

      expect(() => store.acceptAll()).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);
    });

    it('picks up a grant written by another tab', async () => {
      const map = installStorage();
      const target = installWindow();
      const store = await loadStore();
      const listener = vi.fn();

      store.subscribeToConsent(listener);

      expect(store.hasConsent('analytics')).toBe(false);

      // Another tab wrote the record, then the browser fired `storage` here.
      map.set(CONSENT_STORAGE_KEY, validRecord());
      const event = new Event('storage') as Event & { key: string | null };
      event.key = CONSENT_STORAGE_KEY;
      target.dispatchEvent(event);

      expect(listener).toHaveBeenCalled();
      expect(store.hasConsent('analytics')).toBe(true);
    });

    it('ignores storage events for unrelated keys', async () => {
      const target = installWindow();
      const store = await loadStore();
      const listener = vi.fn();

      store.subscribeToConsent(listener);

      const event = new Event('storage') as Event & { key: string | null };
      event.key = 'theme';
      target.dispatchEvent(event);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
