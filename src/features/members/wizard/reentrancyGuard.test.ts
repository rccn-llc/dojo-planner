import { describe, expect, it, vi } from 'vitest';

/**
 * Regression-test for #136. The wizard modals (AddMemberModal,
 * AddFamilyMembersModal, ConvertMemberModal) all use a synchronous
 * `submittingRef` flag at the top of their async submit handlers to drop
 * duplicate clicks that fire before React flushes the disabled-button state.
 *
 * The actual handlers have heavy dependencies (Clerk, ORPC, wizard state)
 * that make them awkward to unit-test in isolation. This test verifies the
 * pattern — synchronous ref + early-return + finally-reset — behaves the
 * way the bug fix needs it to under rapid concurrent invocation.
 *
 * If you change the modal handlers, mirror the structure verified here so
 * the underlying invariant doesn't drift.
 */
function makeGuardedHandler(work: () => Promise<void>) {
  const submittingRef = { current: false };

  const handler = async () => {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      await work();
    } finally {
      submittingRef.current = false;
    }
  };

  const reset = () => {
    submittingRef.current = false;
  };

  return { handler, reset, submittingRef };
}

describe('Modal submit re-entrancy guard pattern (#136)', () => {
  it('drops a second concurrent invocation while the first is in flight', async () => {
    const work = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 20)));
    const { handler } = makeGuardedHandler(work);

    // Two synchronous calls — the second hits the guard before the first resolves.
    const p1 = handler();
    const p2 = handler();
    await Promise.all([p1, p2]);

    expect(work).toHaveBeenCalledTimes(1);
  });

  it('drops five rapid clicks during a single submit', async () => {
    const work = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 20)));
    const { handler } = makeGuardedHandler(work);

    await Promise.all([handler(), handler(), handler(), handler(), handler()]);

    expect(work).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh invocation after the previous resolved', async () => {
    const work = vi.fn(() => Promise.resolve());
    const { handler } = makeGuardedHandler(work);

    await handler();
    await handler();
    await handler();

    expect(work).toHaveBeenCalledTimes(3);
  });

  it('releases the guard when work throws', async () => {
    const work = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const { handler } = makeGuardedHandler(work);

    await expect(handler()).rejects.toThrow('boom');

    await handler();

    expect(work).toHaveBeenCalledTimes(2);
  });

  it('reset() unlocks the guard mid-flight (mirrors handleCancel)', async () => {
    let release!: () => void;
    const inflight = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = vi.fn(() => inflight);
    const { handler, reset, submittingRef } = makeGuardedHandler(work);

    // Start the handler but don't await — it's still in flight.
    void handler();

    expect(submittingRef.current).toBe(true);

    reset();

    expect(submittingRef.current).toBe(false);

    // Cleanup
    release();
    await inflight;
  });
});
