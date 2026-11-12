import type { Queryable } from './steps';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { controlPglite } from '@/libs/__mocks__/ControlDb';
import { controlDb } from '@/libs/ControlDb';
import { orgSignupRequestSchema } from '@/models/ControlSchema';
import {
  markSignupProvisioned,
  markSignupProvisioning,
  readSignupRequest,
  recordSignupClerkOrg,
  recordSignupFailure,
  reportSignupStep,
} from './signupRequests';

vi.mock('@/libs/ControlDb');

const t = orgSignupRequestSchema;
const ID = '6f1c2b8e-0000-4000-8000-000000000001';
const control = controlPglite as unknown as Queryable;

async function insert(status: string, overrides: Partial<typeof t.$inferInsert> = {}) {
  await controlDb.insert(t).values({
    id: ID,
    status,
    academyName: 'Riverside Jiu-Jitsu',
    slug: 'riverside-jiu-jitsu',
    ownerName: 'Jordan Rivera',
    ownerEmail: 'jordan@example.com',
    ownerPhone: '555 010 0199',
    confirmTokenHash: 'c'.repeat(64),
    confirmExpiresAt: new Date(Date.now() + 60_000),
    statusTokenHash: 's'.repeat(64),
    ...overrides,
  });
}

async function row() {
  const [found] = await controlDb.select().from(t).where(eq(t.id, ID));
  return found!;
}

describe('signupRequests (CLI side)', () => {
  beforeEach(async () => {
    await controlDb.delete(t);
  });

  it('reads a request', async () => {
    await insert('dispatched');

    expect(await readSignupRequest(control, ID)).toEqual({
      id: ID,
      status: 'dispatched',
      academyName: 'Riverside Jiu-Jitsu',
      slug: 'riverside-jiu-jitsu',
      ownerName: 'Jordan Rivera',
      ownerEmail: 'jordan@example.com',
      ownerPhone: '555 010 0199',
      clerkOrgId: null,
    });
    expect(await readSignupRequest(control, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it.each(['dispatched', 'provisioning', 'failed'])('claims a %s request', async (status) => {
    await insert(status, { alertSentAt: new Date() });

    expect(await markSignupProvisioning(control, ID, 2, 'https://github.com/run/1')).toBe(true);

    const claimed = await row();

    expect(claimed.status).toBe('provisioning');
    expect(claimed.attempt).toBe(2);
    expect(claimed.workflowRunUrl).toBe('https://github.com/run/1');
    // A re-run of a FAILED request must be able to alert again.
    expect(claimed.alertSentAt === null).toBe(status === 'failed');
  });

  it.each(['awaiting_confirmation', 'confirmed', 'expired', 'provisioned'])('refuses to claim a %s request', async (status) => {
    await insert(status);

    expect(await markSignupProvisioning(control, ID, 1, null)).toBe(false);
    expect((await row()).status).toBe(status);
  });

  it('writes heartbeats in UTC, comparable with the app\'s clock', async () => {
    await insert('dispatched');
    await markSignupProvisioning(control, ID, 1, null);
    await reportSignupStep(control, ID, 'seed');

    const reported = await row();

    expect(reported.currentStep).toBe('seed');
    expect(Math.abs(reported.heartbeatAt!.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('reports steps only while provisioning', async () => {
    await insert('failed');
    await reportSignupStep(control, ID, 'seed');

    expect((await row()).currentStep).toBeNull();
  });

  it('records the Clerk org id once', async () => {
    await insert('provisioning');
    await recordSignupClerkOrg(control, ID, 'org_first');
    await recordSignupClerkOrg(control, ID, 'org_second');

    expect((await row()).clerkOrgId).toBe('org_first');
  });

  it('marks provisioned, with an optional note', async () => {
    await insert('provisioning', { lastError: 'old' });
    await markSignupProvisioned(control, ID);

    expect((await row())).toMatchObject({ status: 'provisioned', lastError: null });
    expect((await row()).provisionedAt).toBeInstanceOf(Date);

    await controlDb.delete(t);
    await insert('provisioning');
    await markSignupProvisioned(control, ID, 'readiness reported problems');

    expect((await row()).lastError).toBe('readiness reported problems');
  });

  it('keeps an attempt-1 failure provisioning, and fails on the final attempt', async () => {
    await insert('provisioning');
    await recordSignupFailure(control, ID, 'seed exploded', { final: false });

    expect(await row()).toMatchObject({ status: 'provisioning', lastError: 'seed exploded' });

    await recordSignupFailure(control, ID, 'seed exploded again', { final: true, workflowRunUrl: 'https://github.com/run/2' });

    expect(await row()).toMatchObject({ status: 'failed', lastError: 'seed exploded again', workflowRunUrl: 'https://github.com/run/2' });
  });

  it('never fails a request that already finished', async () => {
    await insert('provisioned');
    await recordSignupFailure(control, ID, 'late', { final: true });

    expect(await row()).toMatchObject({ status: 'provisioned', lastError: null });
  });

  it('truncates a very long error', async () => {
    await insert('provisioning');
    await recordSignupFailure(control, ID, 'x'.repeat(10_000), { final: true });

    expect((await row()).lastError).toHaveLength(4000);
  });
});
