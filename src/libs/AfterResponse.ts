import { after } from 'next/server';
import { logger } from './Logger';

/**
 * Run slow follow-up work (a provider GET, say) after the response is sent,
 * so a webhook acknowledges promptly — both payment providers retry deliveries
 * they consider slow or unacknowledged.
 *
 * `after()` keeps the serverless function alive until the work settles. It
 * throws outside a Next request scope (scripts, unit tests), so this falls
 * back to fire-and-forget there. The work itself must never throw into the
 * caller either way.
 */
export function runAfterResponse(label: string, work: () => Promise<void>): void {
  const guarded = async () => {
    try {
      await work();
    } catch (error) {
      logger.error(`[AfterResponse] ${label} failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
