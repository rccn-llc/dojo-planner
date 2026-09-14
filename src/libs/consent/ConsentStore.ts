import type { ConsentCategory, ConsentDecision, ConsentState } from './types';
/**
 * Framework-free consent store.
 *
 * Imports NOTHING — no React, no next-*, no @/libs/Env. That is deliberate:
 * `src/instrumentation-client.ts` imports this at module load, before React
 * mounts, and the `unit` (node) test project runs it with no DOM at all.
 *
 * Storing the visitor's decision is itself exempt from consent under ePrivacy
 * Art. 5(3) — a record of a REFUSAL is strictly necessary to honour that
 * refusal without re-asking on every page load. It contains no identifier, no
 * user id, and nothing linkable. See docs/PRIVACY-CONSENT.md.
 */
import {
  CONSENT_EVENT,
  CONSENT_MAX_AGE_MS,
  CONSENT_MAX_CLOCK_SKEW_MS,
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
} from './constants';

/** Default posture: deny everything optional. Never change this to opt-out. */
const DENIED: Record<ConsentCategory, boolean> = {
  necessary: true,
  functional: false,
  analytics: false,
};

/**
 * Module-scope cache. `undefined` = not yet hydrated from storage.
 *
 * Holding the object identity stable between changes is a hard requirement of
 * `useSyncExternalStore`: returning a fresh object from getSnapshot on every
 * call causes an infinite re-render loop.
 */
let cached: ConsentState | undefined;
const listeners = new Set<(state: ConsentState) => void>();
let wired = false;

/**
 * Every storage touch is individually guarded. Three distinct failure modes:
 *  - Safari private mode: `setItem` throws QuotaExceededError.
 *  - Chrome "block all cookies": reading `window.localStorage` ITSELF throws
 *    SecurityError — optional chaining does not help with a throwing getter,
 *    which is why the try/catch is required here and not just `?.`.
 *  - Node/SSR: `localStorage` is undefined.
 */
function safeRead(): string | null {
  try {
    return globalThis.localStorage?.getItem(CONSENT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function safeWrite(value: string): boolean {
  try {
    globalThis.localStorage.setItem(CONSENT_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function safeClear(): void {
  try {
    globalThis.localStorage?.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // Nothing to do — a decision we cannot clear is one we also cannot read.
  }
}

/**
 * Parse and validate a stored record. Returns null for anything we will not
 * honour: corrupt JSON, wrong shape, a superseded policy version, an expired
 * decision, or one dated in the future. Category flags are compared with strict
 * `=== true` so a truthy-but-not-true value (`"yes"`, `1`) can never be read as
 * a grant.
 */
function parse(raw: string | null): ConsentDecision | null {
  if (raw === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConsentDecision> | null;

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    if (parsed.version !== CONSENT_VERSION) {
      return null;
    }
    if (typeof parsed.timestamp !== 'number' || !Number.isFinite(parsed.timestamp)) {
      return null;
    }
    const age = Date.now() - parsed.timestamp;
    if (age > CONSENT_MAX_AGE_MS) {
      return null;
    }
    // A future-dated record is rejected rather than trusted. Honouring one
    // keeps it valid until `timestamp + CONSENT_MAX_AGE_MS`, so a device whose
    // clock was years fast when the visitor chose would suppress the banner
    // long past the six-month re-solicitation cadence even after the clock is
    // corrected. Dropping it re-prompts, which is the safe direction.
    if (age < -CONSENT_MAX_CLOCK_SKEW_MS) {
      return null;
    }
    if (typeof parsed.categories !== 'object' || parsed.categories === null) {
      return null;
    }

    return {
      version: CONSENT_VERSION,
      timestamp: parsed.timestamp,
      method: parsed.method ?? 'custom',
      categories: {
        necessary: true,
        functional: parsed.categories.functional === true,
        analytics: parsed.categories.analytics === true,
      },
    };
  } catch {
    return null;
  }
}

function hydrate(): ConsentState {
  const raw = safeRead();
  const decision = parse(raw);

  // A record that existed but failed validation is stale garbage (expired,
  // superseded, or corrupt). Drop it so later reads don't re-pay the parse.
  if (raw !== null && decision === null) {
    safeClear();
  }

  return { decision, ephemeral: false };
}

function emit(state: ConsentState): void {
  cached = state;

  for (const listener of [...listeners]) {
    try {
      listener(state);
    } catch {
      // One bad subscriber must not prevent the others from being notified.
    }
  }
}

function wireGlobalListeners(): void {
  if (wired || typeof window === 'undefined') {
    return;
  }
  wired = true;

  // Cross-tab. Fires only in OTHER tabs, by spec. A null key means the whole
  // store was cleared, which we must also react to.
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== CONSENT_STORAGE_KEY) {
      return;
    }
    emit(hydrate());
  });

  // Same-tab, bundler-proof (see CONSENT_EVENT).
  window.addEventListener(CONSENT_EVENT, () => {
    const fromStorage = hydrate();

    // When the write was rejected (private mode, blocked storage) there is
    // nothing to re-read, so keep the in-memory decision rather than letting
    // storage silently revoke a choice the visitor just made.
    if (fromStorage.decision === null && cached?.ephemeral === true && cached.decision !== null) {
      emit(cached);
      return;
    }

    emit(fromStorage);
  });
}

export function getConsentState(): ConsentState {
  // On the server we NEVER report a grant. This is both the SSR-safe snapshot
  // and a guarantee that no server path can infer consent.
  if (typeof window === 'undefined') {
    return { decision: null, ephemeral: true };
  }

  wireGlobalListeners();

  if (cached === undefined) {
    cached = hydrate();
  }

  return cached;
}

/** The hot path used by the Sentry gate. Denies by default, always. */
export function hasConsent(category: ConsentCategory): boolean {
  if (category === 'necessary') {
    return true;
  }

  return getConsentState().decision?.categories[category] === true;
}

/** True when there is no valid decision on record and the banner must show. */
export function needsConsentDecision(): boolean {
  return getConsentState().decision === null;
}

export function setConsent(
  categories: Partial<Record<ConsentCategory, boolean>>,
  method: ConsentDecision['method'] = 'custom',
): void {
  const decision: ConsentDecision = {
    version: CONSENT_VERSION,
    timestamp: Date.now(),
    method,
    // `necessary` is forced last so it can never be revoked by a caller.
    categories: { ...DENIED, ...categories, necessary: true },
  };

  const persisted = safeWrite(JSON.stringify(decision));
  const next: ConsentState = { decision, ephemeral: !persisted };

  if (typeof window === 'undefined') {
    emit(next);
    return;
  }

  // Seed the cache first so a listener reading state during dispatch sees the
  // new decision even when it could not be persisted, then let the CONSENT_EVENT
  // handler perform the single emit. Emitting here as well would notify every
  // subscriber twice for one change.
  cached = next;
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function acceptAll(): void {
  setConsent({ functional: true, analytics: true }, 'accept_all');
}

export function rejectAll(): void {
  setConsent({ functional: false, analytics: false }, 'reject_all');
}

/** Full withdrawal: forget the decision entirely so the banner returns. */
export function resetConsent(): void {
  safeClear();

  if (typeof window === 'undefined') {
    emit({ decision: null, ephemeral: false });
    return;
  }

  cached = { decision: null, ephemeral: false };
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function subscribeToConsent(
  listener: (state: ConsentState) => void,
): () => void {
  wireGlobalListeners();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
