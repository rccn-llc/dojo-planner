import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The consent gate around client-side Sentry.
 *
 * The case that matters is the WITHDRAW → GRANT race: `Sentry.close()` is
 * async, and while it is in flight `started` is still true, so a grant arriving
 * inside that window is dropped by `startSentry()`. The teardown's `finally`
 * then clears `started` with nobody left to act on the grant — leaving Sentry
 * permanently off for a visitor who has consented.
 */

const init = vi.fn();
const close = vi.fn();
const replayStop = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: (...args: unknown[]) => init(...args),
  close: (...args: unknown[]) => close(...args),
  getReplay: () => ({ stop: replayStop }),
  replayIntegration: () => ({ name: 'Replay' }),
  consoleLoggingIntegration: () => ({ name: 'Console' }),
  browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
  spotlightBrowserIntegration: () => ({ name: 'Spotlight' }),
  captureRouterTransitionStart: vi.fn(),
}));

let analyticsGranted = false;
let notify: (() => void) | undefined;

vi.mock('@/libs/consent/ConsentStore', () => ({
  hasConsent: (category: string) =>
    category === 'necessary' ? true : analyticsGranted,
  subscribeToConsent: (listener: () => void) => {
    notify = listener;
    return () => {
      notify = undefined;
    };
  },
}));

async function load() {
  vi.resetModules();
  await import('./instrumentation-client');
}

describe('client Sentry consent gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsGranted = false;
    notify = undefined;
    close.mockResolvedValue(true);
  });

  it('does NOT initialise without analytics consent', async () => {
    await load();

    expect(init).not.toHaveBeenCalled();
  });

  it('initialises when a prior grant is already on record', async () => {
    analyticsGranted = true;
    await load();

    expect(init).toHaveBeenCalledTimes(1);
  });

  it('starts on a grant and stops on a withdrawal', async () => {
    await load();

    analyticsGranted = true;
    notify?.();

    expect(init).toHaveBeenCalledTimes(1);

    analyticsGranted = false;
    notify?.();
    await vi.waitFor(() => expect(close).toHaveBeenCalled());

    expect(replayStop).toHaveBeenCalled();
  });

  it('RESTARTS when consent is re-granted while close() is still in flight', async () => {
    analyticsGranted = true;
    await load();

    expect(init).toHaveBeenCalledTimes(1);

    // Hold close() open so the grant below lands mid-teardown.
    let release: (v: boolean) => void = () => {};
    close.mockReturnValue(new Promise<boolean>((resolve) => {
      release = resolve;
    }));

    analyticsGranted = false;
    notify?.();
    await vi.waitFor(() => expect(close).toHaveBeenCalled());

    // Re-grant DURING teardown. startSentry() sees `started` still true and
    // returns early, so nothing happens here — the restart must come from
    // stopSentry re-checking once close() settles.
    analyticsGranted = true;
    notify?.();

    expect(init).toHaveBeenCalledTimes(1);

    release(true);

    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(2));
  });

  it('stays stopped when the withdrawal still stands after teardown', async () => {
    analyticsGranted = true;
    await load();

    analyticsGranted = false;
    notify?.();
    await vi.waitFor(() => expect(close).toHaveBeenCalled());

    // One init from load, none after — consent was never re-granted.
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('restarts even when close() rejects', async () => {
    // Teardown must never throw into the app, and a failed flush must not
    // strand a consenting visitor with Sentry off.
    analyticsGranted = true;
    await load();

    let reject: (e: Error) => void = () => {};
    close.mockReturnValue(new Promise<boolean>((_resolve, rej) => {
      reject = rej;
    }));

    analyticsGranted = false;
    notify?.();
    await vi.waitFor(() => expect(close).toHaveBeenCalled());

    analyticsGranted = true;
    reject(new Error('flush failed'));

    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(2));
  });
});
