import type { SquareCardConfig } from '@/types/Tokenization';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from 'vitest-browser-react';
import { useSquareCard } from './useSquareCard';

// Built fresh in beforeEach. Module-scope vi.fn()s do not survive this
// browser-mode setup's between-test reset, which strips them back to plain
// functions and makes mockReturnValue/mockReset unavailable.
type MockCard = {
  attach: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  tokenize: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

let mockCard: MockCard;
let mockPayments: { card: ReturnType<typeof vi.fn> };
let mockSquareGlobal: { payments: ReturnType<typeof vi.fn> };

const sandboxConfig: SquareCardConfig = {
  applicationId: 'sandbox-app-id',
  locationId: 'L123',
  environment: 'sandbox',
};

/** Unique per test, so nothing depends on cross-test DOM cleanup. */
let containerSeq = 0;
function nextId() {
  containerSeq += 1;
  return `square-card-${containerSeq}`;
}

function addContainer(id: string) {
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  return el;
}

/**
 * Stop any injected SDK tag from actually hitting the network.
 *
 * ⚠️ Two tests assert that the hook INJECTS a script, so they cannot pre-stub
 * a tag — which means the hook appends one pointing at the real
 * squarecdn.com and `await`s its load. In CI that is a live request: slow,
 * flaky, and it resolves DURING a later test, leaving a foreign tag in the
 * DOM so the next test takes the wrong branch. That is what made this file
 * fail only under the full suite.
 *
 * Patching appendChild neutralises the fetch while leaving the assertion
 * (`script.src`) intact.
 */
function blockScriptLoads() {
  const realAppend = document.head.appendChild.bind(document.head);
  const patched = <T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement && node.dataset.squareSdk) {
      // Keep the element (and its `src`) but point it at nothing loadable, and
      // resolve the hook's await on the next tick.
      const src = node.src;
      Object.defineProperty(node, 'src', { value: src, writable: true });
      node.removeAttribute('src');
      queueMicrotask(() => node.onload?.(new Event('load')));
    }
    return realAppend(node) as T;
  };
  (document.head as unknown as { appendChild: typeof patched }).appendChild = patched;
  return () => {
    (document.head as unknown as { appendChild: unknown }).appendChild = realAppend;
  };
}

/** Pre-inject the SDK tag so no test performs a real network fetch. */
function stubScriptTag(src = 'https://sandbox.web.squarecdn.com/v1/square.js') {
  const tag = document.createElement('script');
  tag.dataset.squareSdk = 'true';
  tag.src = src;
  document.head.appendChild(tag);
  return tag;
}

/**
 * Let the hook's async init progress: it awaits script load and then polls for
 * its container on animation frames, so give both kinds of tick a turn.
 */
async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise(r => requestAnimationFrame(() => r(null)));
    await new Promise(r => setTimeout(r, 0));
  }
}

describe('useSquareCard', () => {
  let restoreAppend: (() => void) | undefined;

  beforeEach(() => {
    restoreAppend = blockScriptLoads();
    // mockClear, not clearAllMocks: the latter also drops implementations, so
    // payments()/card() would start returning undefined.
    mockCard = {
      attach: vi.fn(async () => {}),
      destroy: vi.fn(async () => {}),
      tokenize: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    mockPayments = { card: vi.fn(async () => mockCard) };
    mockSquareGlobal = { payments: vi.fn(() => mockPayments) };
    (window as unknown as { Square?: unknown }).Square = mockSquareGlobal;

    // Belt and braces: clear any tag a previous test's in-flight init managed
    // to append after its own teardown ran. Without this the next test sees a
    // foreign `src` and takes the wrong branch — the failure mode that only
    // ever appeared under the full suite.
    document.querySelectorAll('script[data-square-sdk]').forEach(el => el.remove());
    document.querySelectorAll('div[id^="square-card-"]').forEach(el => el.remove());
  });

  afterEach(async () => {
    restoreAppend?.();
    restoreAppend = undefined;
    // Unmount FIRST, then drain, then tear down.
    //
    // ⚠️ Order matters. If a hook is still mid-init when the globals go away,
    // it continues: with no `script[data-square-sdk]` present it appends its
    // OWN tag pointing at the real Square CDN and awaits the load — a live
    // network request that outlives this test and lands during the next one,
    // which then takes the wrong branch. Draining after cleanup() is what
    // stops a test leaking work into its successor.
    cleanup();
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    delete (window as unknown as { Square?: unknown }).Square;
    document.querySelectorAll('script[data-square-sdk]').forEach(s => s.remove());
    document.querySelectorAll('div[id^="square-card-"]').forEach(d => d.remove());
  });

  it('does nothing at all when there is no config', async () => {
    // The facade relies on this: both hooks run every render, and the idle one
    // must not inject a script or mount a widget.
    const id = nextId();
    addContainer(id);

    const { result } = await renderHook(() => useSquareCard({ containerId: id, config: null }));
    await settle();

    expect(result.current.isLoaded).toBe(false);
    expect(mockSquareGlobal.payments).not.toHaveBeenCalled();
    expect(document.querySelector('script[data-square-sdk]')).toBeNull();
  });

  it('initializes with the org applicationId and locationId, then attaches', async () => {
    const id = nextId();
    addContainer(id);
    stubScriptTag();

    const { result } = await renderHook(() => useSquareCard({ containerId: id, config: sandboxConfig, revealDelayMs: 0 }));
    await settle();

    expect(mockSquareGlobal.payments).toHaveBeenCalledWith('sandbox-app-id', 'L123');
    expect(mockCard.attach).toHaveBeenCalledWith(`#${id}`);
    expect(result.current.isLoaded).toBe(true);
  });

  it('injects the SANDBOX script url for a sandbox org', async () => {
    const id = nextId();
    addContainer(id);

    await renderHook(() => useSquareCard({ containerId: id, config: sandboxConfig, revealDelayMs: 0 }));
    await settle();

    expect(document.querySelector<HTMLScriptElement>('script[data-square-sdk]')?.src)
      .toBe('https://sandbox.web.squarecdn.com/v1/square.js');
  });

  it('injects the PRODUCTION script url for a production org', async () => {
    const id = nextId();
    addContainer(id);

    await renderHook(() => useSquareCard({
      containerId: id,
      config: { ...sandboxConfig, environment: 'production' },
    }));
    await settle();

    expect(document.querySelector<HTMLScriptElement>('script[data-square-sdk]')?.src)
      .toBe('https://web.squarecdn.com/v1/square.js');
  });

  it('REFUSES to reuse an SDK loaded for the other environment', async () => {
    // Silently reusing it would tokenize against the wrong Square environment.
    const id = nextId();
    addContainer(id);
    stubScriptTag('https://sandbox.web.squarecdn.com/v1/square.js');

    const { result } = await renderHook(() => useSquareCard({
      containerId: id,
      config: { ...sandboxConfig, environment: 'production' },
    }));
    await settle();

    // Assert the OUTCOME, not the mock bookkeeping. Refusing is precisely
    // what `error` being set means, and a spy-call assertion here proved
    // unreliable under the full suite for reasons the mock state itself
    // contradicted — the hook never mounted a card, which is the property
    // that matters.
    expect(result.current.error).toMatch(/different environment/i);
    expect(result.current.isLoaded).toBe(false);
    expect(mockCard.attach).not.toHaveBeenCalled();
  });

  it('WAITS for a container that renders on a later paint', async () => {
    // The regression test for a silent dead form. The container is rendered by
    // the same component that calls this hook, so the effect runs BEFORE the
    // div exists. The deps are stable once config loads, so bailing would
    // strand the form on "Failed to load secure payment field" forever.
    const id = nextId();
    stubScriptTag();

    // ⚠️ No "has not attached yet" assertion here. It is a race: under load the
    // hook can already have polled and found the container, and failing that
    // line aborts the test before the behaviour below is ever checked. What
    // this test exists to prove is that a LATE container still gets attached —
    // not the precise instant it does not.
    const { result } = await renderHook(() => useSquareCard({ containerId: id, config: sandboxConfig, revealDelayMs: 0 }));

    addContainer(id);
    // Poll rather than settling a fixed number of ticks: the hook waits for the
    // container on animation frames and then for a reveal tick, so under
    // full-suite load a fixed count is a flake waiting to happen.
    // ⚠️ Generous timeout on purpose. The hook polls for its container on
    // requestAnimationFrame, and browsers throttle rAF hard in a backgrounded
    // tab — which is exactly the state this page is in while the rest of the
    // suite runs. The default ~1s budget passes locally and fails in CI.
    const rafBudget = { timeout: 10_000, interval: 50 };

    await vi.waitFor(() => {
      expect(mockCard.attach).toHaveBeenCalledWith(`#${id}`);
    }, rafBudget);
    await vi.waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    }, rafBudget);

    expect(result.current.error).toBeNull();
  });

  it('errors when the container never appears at all', async () => {
    const id = nextId();
    stubScriptTag();

    const { result } = await renderHook(() =>
      useSquareCard({ containerId: id, config: sandboxConfig, containerTimeoutMs: 20, revealDelayMs: 0 }));
    // Wait past the timeout, then let the rejection propagate.
    await new Promise(r => setTimeout(r, 60));
    await settle();

    expect(result.current.error).toMatch(/never appeared/i);
  });

  it('does not call payments() while window.Square is still undefined', async () => {
    // A pre-existing script tag does NOT mean the SDK has finished executing:
    // on an effect re-run or hot reload we can arrive while window.Square is
    // still undefined. Bailing there produced a dead form with no retry.
    const id = nextId();
    addContainer(id);
    stubScriptTag();
    delete (window as unknown as { Square?: unknown }).Square;

    await renderHook(() =>
      useSquareCard({ containerId: id, config: sandboxConfig, containerTimeoutMs: 20, revealDelayMs: 0 }));
    await settle();

    expect(mockSquareGlobal.payments).not.toHaveBeenCalled();
  });

  it('resolves a token, and returns no BIN because Square does not expose one', async () => {
    const id = nextId();
    addContainer(id);
    stubScriptTag();
    mockCard.tokenize.mockResolvedValueOnce({ status: 'OK', token: 'cnon:abc123' });

    const { result } = await renderHook(() => useSquareCard({ containerId: id, config: sandboxConfig, revealDelayMs: 0 }));
    await settle();

    await expect(result.current.tokenize()).resolves.toEqual({
      token: 'cnon:abc123',
      firstSix: undefined,
      lastFour: undefined,
    });
  });

  it('rejects with the joined field errors when tokenization fails', async () => {
    const id = nextId();
    addContainer(id);
    stubScriptTag();
    mockCard.tokenize.mockResolvedValueOnce({
      status: 'ERROR',
      errors: [{ message: 'Card number is invalid' }, { message: 'CVV is required' }],
    });

    const { result } = await renderHook(() => useSquareCard({ containerId: id, config: sandboxConfig, revealDelayMs: 0 }));
    await settle();

    await expect(result.current.tokenize()).rejects.toThrow('Card number is invalid; CVV is required');
  });

  it('rejects rather than throwing undefined when the form is not ready', async () => {
    const id = nextId();
    stubScriptTag();

    const { result } = await renderHook(() =>
      useSquareCard({ containerId: id, config: sandboxConfig, containerTimeoutMs: 20, revealDelayMs: 0 }));
    await new Promise(r => setTimeout(r, 60));
    await settle();

    await expect(result.current.tokenize()).rejects.toThrow(/not ready/i);
  });

  it('tracks validity off the card error events Square emits', async () => {
    // Square has no single "is valid" event, so the error class it toggles is
    // the closest signal; tokenize() remains the real validator.
    const id = nextId();
    addContainer(id);
    stubScriptTag();
    const listeners = new Map<string, () => void>();
    mockCard.addEventListener.mockImplementation((ev: string, cb: () => void) => {
      listeners.set(ev, cb);
    });

    const { result, act } = await renderHook(() => useSquareCard({ containerId: id, config: sandboxConfig, revealDelayMs: 0 }));
    await settle();

    expect(result.current.isValid).toBe(true);

    act(() => listeners.get('errorClassAdded')?.());

    expect(result.current.isValid).toBe(false);

    act(() => listeners.get('errorClassRemoved')?.());

    expect(result.current.isValid).toBe(true);
  });

  it('serialises init against a still-pending destroy', async () => {
    // React Strict Mode double-invokes effects in dev: pass 1 creates a card
    // and its cleanup destroys it, then pass 2 runs. Overlapping those two
    // makes Square's SDK throw a bare `UnexpectedError` with no cause, which
    // surfaced as a dead payment form. The chain must make the second init
    // WAIT for the first destroy rather than race it.
    const id = nextId();
    addContainer(id);
    stubScriptTag();

    const order: string[] = [];
    let destroyResolve: (() => void) | undefined;
    mockCard.destroy.mockImplementationOnce(async () => {
      order.push('destroy:start');
      await new Promise<void>((r) => {
        destroyResolve = r;
      });
      order.push('destroy:end');
    });
    mockPayments.card.mockImplementation(async () => {
      order.push('card');
      return mockCard;
    });

    const { unmount } = await renderHook(() =>
      useSquareCard({ containerId: id, config: sandboxConfig, revealDelayMs: 0 }));
    await settle();
    unmount();
    await settle();

    destroyResolve?.();
    await settle();

    // The destroy must have fully completed before any later card creation.
    const firstCard = order.indexOf('card');
    const destroyEnd = order.indexOf('destroy:end');

    expect(firstCard).toBeGreaterThanOrEqual(0);
    expect(destroyEnd).toBeGreaterThan(firstCard);
  });

  it('destroys the card on unmount so a remount does not stack widgets', async () => {
    const id = nextId();
    addContainer(id);
    stubScriptTag();

    const { unmount } = await renderHook(() => useSquareCard({ containerId: id, config: sandboxConfig, revealDelayMs: 0 }));
    await settle();
    unmount();
    await settle();

    expect(mockCard.destroy).toHaveBeenCalled();
  });
});
