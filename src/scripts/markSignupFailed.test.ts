import type { Queryable } from './onboarding/steps';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { controlPglite } from '@/libs/__mocks__/ControlDb';
import { controlDb } from '@/libs/ControlDb';
import { orgSignupRequestSchema } from '@/models/ControlSchema';
import { JOB_FAILED_MESSAGE, markSignupFailed, runMarkSignupFailed } from './markSignupFailed';

vi.mock('@/libs/ControlDb');

const t = orgSignupRequestSchema;
const ID = '6f1c2b8e-0000-4000-8000-000000000002';
const control = controlPglite as unknown as Queryable;

async function insert(status: string, lastError: string | null = null) {
  await controlDb.insert(t).values({
    id: ID,
    status,
    academyName: 'Riverside',
    ownerName: 'Jordan',
    ownerEmail: 'jordan@example.com',
    ownerPhone: '5550100199',
    confirmTokenHash: 'c'.repeat(64),
    confirmExpiresAt: new Date(),
    statusTokenHash: 's'.repeat(64),
    lastError,
  });
}

async function row() {
  const [found] = await controlDb.select().from(t).where(eq(t.id, ID));
  return found!;
}

describe('markSignupFailed', () => {
  beforeEach(async () => {
    await controlDb.delete(t);
  });

  it('fails a request the job never finished, explaining why', async () => {
    await insert('dispatched');
    await markSignupFailed(control, ID, 'https://github.com/run/3');

    expect(await row()).toMatchObject({ status: 'failed', lastError: JOB_FAILED_MESSAGE, workflowRunUrl: 'https://github.com/run/3' });
  });

  it('keeps the specific error org:create recorded', async () => {
    await insert('provisioning', 'Seed reference data failed (exit 1).');
    await markSignupFailed(control, ID, null);

    expect(await row()).toMatchObject({ status: 'failed', lastError: 'Seed reference data failed (exit 1).' });
  });

  it('leaves a provisioned request alone', async () => {
    await insert('provisioned');
    await markSignupFailed(control, ID, null);

    expect((await row()).status).toBe('provisioned');
  });

  it('retries a failed write, then gives up', async () => {
    const flaky = { query: vi.fn().mockRejectedValue(new Error('connection reset')) } as unknown as Queryable;

    await expect(markSignupFailed(flaky, ID, null, 0)).rejects.toThrow('connection reset');
  });

  describe('runMarkSignupFailed (the CLI entry)', () => {
    it('masks the control URL, marks the request, and closes the pool', async () => {
      await insert('dispatched');
      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const end = vi.fn(async () => {});

      await runMarkSignupFailed(
        ['node', 'markSignupFailed.ts', `--request=${ID}`, '--runUrl=https://github.com/run/9'],
        { CONTROL_DATABASE_URL: 'postgresql://u:pw123@control.example.test/db' },
        () => ({ query: control.query.bind(control), end }),
      );

      expect(await row()).toMatchObject({ status: 'failed', workflowRunUrl: 'https://github.com/run/9' });
      expect(write).toHaveBeenCalledWith('::add-mask::postgresql://u:pw123@control.example.test/db\n');
      expect(write).toHaveBeenCalledWith('::add-mask::control.example.test\n');
      expect(end).toHaveBeenCalled();

      write.mockRestore();
    });

    it('closes the pool even when marking fails', async () => {
      const end = vi.fn(async () => {});
      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const failing = { query: vi.fn().mockRejectedValue(new Error('down')), end };

      await expect(runMarkSignupFailed(['--request=x'], { CONTROL_DATABASE_URL: 'postgresql://h/db' }, () => failing))
        .rejects
        .toThrow('down');
      expect(end).toHaveBeenCalled();

      write.mockRestore();
    }, 10_000);

    it('requires --request and CONTROL_DATABASE_URL', async () => {
      await expect(runMarkSignupFailed([], { CONTROL_DATABASE_URL: 'postgresql://h/db' })).rejects.toThrow('Usage');
      await expect(runMarkSignupFailed(['--request=x'], {})).rejects.toThrow('CONTROL_DATABASE_URL');
    });
  });
});
