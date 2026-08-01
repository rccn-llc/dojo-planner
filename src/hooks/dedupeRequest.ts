/**
 * De-dupes concurrent cold-cache fetches.
 *
 * The `use*Cache` hooks keep a module-level cache that is only written once a
 * request resolves. Several components on a page use the same hook, so every
 * instance mounting in the same tick misses the cache and issues its own
 * request — a page could fire the same endpoint four or more times on load.
 *
 * Callers pass a stable key (typically the organization id, plus anything else
 * that varies the response). Calls sharing a key while a request is in flight
 * attach to that promise instead of starting another. The slot is released
 * once the request settles — on rejection too, so a failure is not cached and
 * the next caller retries cleanly.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function dedupeRequest<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  // The slot is released in the same continuation that settles the request, so
  // a caller resuming right after its `await` sees an empty slot rather than a
  // stale, already-settled promise. `self` lets the release check that it is
  // clearing its own entry and not a newer one.
  const self: { promise?: Promise<T> } = {};

  const release = () => {
    if (inFlight.get(key) === self.promise) {
      inFlight.delete(key);
    }
  };

  self.promise = run().then(
    (value) => {
      release();
      return value;
    },
    (error) => {
      release();
      throw error;
    },
  );

  inFlight.set(key, self.promise);

  return self.promise;
}

/**
 * Drops any pending request for a key. Call this when invalidating a cache so a
 * forced refetch cannot attach to the request it is meant to supersede.
 */
export function clearInFlight(key?: string): void {
  if (key === undefined) {
    inFlight.clear();
    return;
  }
  inFlight.delete(key);
}
