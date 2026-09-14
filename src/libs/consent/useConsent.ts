'use client';

import type { ConsentState } from './types';
import { useSyncExternalStore } from 'react';
import { getConsentState, subscribeToConsent } from './ConsentStore';

/**
 * Module-scope so the identity is stable across renders. An inline object
 * literal here would make React treat every render as a change and loop.
 */
const SERVER_SNAPSHOT: ConsentState = { decision: null, ephemeral: true };

export function useConsentState(): ConsentState {
  return useSyncExternalStore(
    subscribeToConsent,
    getConsentState,
    () => SERVER_SNAPSHOT,
  );
}

/**
 * True once the client has hydrated.
 *
 * The root layout is statically rendered, so the server cannot know the
 * visitor's decision. `useSyncExternalStore` returns the server snapshot during
 * SSR and the first client render, then the client value — which is exactly the
 * signal we need to avoid a hydration mismatch, with no setState-in-effect.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToConsent,
    () => true,
    () => false,
  );
}
