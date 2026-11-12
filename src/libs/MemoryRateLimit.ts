/**
 * A fixed-window counter per key, held in this server instance's memory.
 *
 * A coarse bound — each serverless instance counts separately — but one that
 * needs no extra service, for public endpoints whose real protection is an
 * unguessable token (the sign-up status and confirm routes). Memory is bounded:
 * past `maxTracked` keys the table is cleared, which errs toward allowing.
 */

export type WindowLimiter = {
  /** Count one hit for `key`; false once the window's limit is passed. */
  allow: (key: string, now?: number) => boolean;
  reset: () => void;
};

export function createWindowLimiter(options: { limit: number; windowMs: number; maxTracked?: number }): WindowLimiter {
  const maxTracked = options.maxTracked ?? 5000;
  const counts = new Map<string, { windowStart: number; count: number }>();

  return {
    allow(key, now = Date.now()) {
      if (counts.size > maxTracked) {
        counts.clear();
      }
      const entry = counts.get(key);
      if (!entry || now - entry.windowStart >= options.windowMs) {
        counts.set(key, { windowStart: now, count: 1 });
        return true;
      }
      entry.count += 1;
      return entry.count <= options.limit;
    },
    reset() {
      counts.clear();
    },
  };
}
