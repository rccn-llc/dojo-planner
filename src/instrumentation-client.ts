// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// ⚠️ GDPR: client-side Sentry is gated ENTIRELY behind the `analytics` consent
// category. Nothing here runs — no error capture, no tracing, no session
// replay, no logs — until the visitor actively grants it, and it stops when
// they withdraw. Server-side Sentry (src/instrumentation.ts) is ungated: it is
// our own infrastructure, not terminal-equipment storage.
// See docs/PRIVACY-CONSENT.md.
import * as Sentry from '@sentry/nextjs';
import { hasConsent, subscribeToConsent } from '@/libs/consent/ConsentStore';

const isBuildDisabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DISABLED);

/** Guards a double init when consent flips grant → withdraw → grant. */
let started = false;
/**
 * Guards re-entrant teardown while a close() is still in flight.
 *
 * ⚠️ A grant arriving DURING that window is dropped by `startSentry`, which
 * sees `started` still true. `stopSentry` therefore re-checks consent once
 * teardown finishes — see the tail of that function.
 */
let stopping = false;

function startSentry(): void {
  if (started || isBuildDisabled) {
    return;
  }
  started = true;

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Add optional integrations for additional features
    integrations: [
      Sentry.replayIntegration(),
      Sentry.consoleLoggingIntegration(),
      Sentry.browserTracingIntegration(),

      ...(process.env.NODE_ENV === 'development'
        ? [Sentry.spotlightBrowserIntegration()]
        : []),
    ],

    // Adds request headers and IP for users, for more info visit
    sendDefaultPii: true,

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,

    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,
  });
}

async function stopSentry(): Promise<void> {
  if (!started || stopping) {
    return;
  }
  stopping = true;

  try {
    // Stop rrweb recording first — close() alone leaves Replay buffering in
    // memory. Flushing here delivers the segment captured WHILE consent was
    // still valid, which is lawful; what must stop is collection from now on.
    Sentry.getReplay()?.stop();

    // Flush anything already queued, then disable the client permanently.
    //
    // ⚠️ Known limitation: this stops all transmission, but Sentry v10 has no
    // true teardown — the fetch/XHR/history patches its integrations installed
    // stay in place until the page is reloaded. They call into a disabled
    // client, so nothing leaves the browser. We deliberately do NOT force a
    // reload: it would destroy unsaved dashboard work for no privacy gain.
    await Sentry.close(2000);
  } catch {
    // Teardown must never throw into the application.
  } finally {
    started = false;
    stopping = false;
  }

  // Re-check consent AFTER teardown, because the state may have changed while
  // `close()` was in flight. A withdraw → grant flip inside that window would
  // otherwise leave Sentry permanently stopped: `started` was still true when
  // the grant arrived, so `startSentry()` returned early, and the `finally`
  // above then cleared it with no one left to act on the grant.
  if (hasConsent('analytics')) {
    startSentry();
  }
}

if (!isBuildDisabled) {
  // Only starts if a prior grant is already on record for this device.
  if (hasConsent('analytics')) {
    startSentry();
  }

  // React to grants and withdrawals — including from another tab — with no reload.
  subscribeToConsent(() => {
    if (hasConsent('analytics')) {
      startSentry();
    } else {
      void stopSentry();
    }
  });
}

// MUST keep this export: Next.js imports it by name from the instrumentation
// client hook. It is a no-op while no client is initialised.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
