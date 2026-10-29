import { beforeEach, describe, expect, it, vi } from 'vitest';

const afterMock = vi.fn();
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => afterMock(fn) }));
const loggerError = vi.fn();
vi.mock('./Logger', () => ({ logger: { error: (...a: unknown[]) => loggerError(...a) } }));

describe('runAfterResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules the work with next/server after()', async () => {
    const { runAfterResponse } = await import('./AfterResponse');
    const work = vi.fn().mockResolvedValue(undefined);

    runAfterResponse('sync', work);

    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();

    await afterMock.mock.calls[0]![0]();

    expect(work).toHaveBeenCalled();
  });

  it('falls back to fire-and-forget outside a request scope', async () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error('`after` was called outside a request scope');
    });
    const { runAfterResponse } = await import('./AfterResponse');
    const work = vi.fn().mockResolvedValue(undefined);

    runAfterResponse('sync', work);
    await vi.waitFor(() => expect(work).toHaveBeenCalled());
  });

  it('logs, and never throws, when the work fails', async () => {
    const { runAfterResponse } = await import('./AfterResponse');

    runAfterResponse('sync', async () => {
      throw new Error('provider down');
    });
    await afterMock.mock.calls[0]![0]();

    expect(loggerError).toHaveBeenCalledWith('[AfterResponse] sync failed', { error: 'provider down' });

    // A non-Error rejection reason (as some libraries produce) is stringified.
    const reason: unknown = 'plain';
    runAfterResponse('sync2', () => Promise.reject(reason));
    await afterMock.mock.calls[1]![0]();

    expect(loggerError).toHaveBeenCalledWith('[AfterResponse] sync2 failed', { error: 'plain' });
  });
});
