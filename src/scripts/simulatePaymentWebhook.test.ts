import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyIQProWebhookSignature } from '@/libs/IQPro';
import { verifySquareWebhookSignature } from '@/libs/Square';
import {
  buildIQProResource,
  buildSquareWebhook,
  loadOrCreateDevKeypair,
  parseArgs,
  signIQProWebhook,
  signSquareWebhook,
} from './simulatePaymentWebhook';

// The simulator is only useful if its output passes the app's REAL verifiers;
// these tests guard against the harness drifting from the routes.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIC = publicKey.export({ type: 'spki', format: 'pem' }).toString();

describe('IQPro simulation', () => {
  it('builds a declined subscription Sale with the documented fields', () => {
    const r = buildIQProResource({ scenario: 'declined', subscriptionId: 'seed_sub_1', customerId: 'cus_1', amount: 50, reason: 'Do not honor' });

    expect(r).toMatchObject({ subscriptionId: 'seed_sub_1', status: 'DECLINED', processorResponseText: 'Do not honor', transactionRemit: { amount: 50 }, customer: { customerId: 'cus_1' } });
  });

  it('builds an approved subscription Sale, and a one-time Sale with NO subscriptionId', () => {
    expect(buildIQProResource({ scenario: 'approved', subscriptionId: 's' })).toMatchObject({ status: 'PENDINGSETTLEMENT', transactionRemit: { amount: 103.75 } });
    expect(buildIQProResource({ scenario: 'one-time', subscriptionId: 's', transactionId: 'tx_9' })).not.toHaveProperty('subscriptionId');
    expect(buildIQProResource({ scenario: 'one-time', transactionId: 'tx_9' }).transactionId).toBe('tx_9');
  });

  it('produces a body the app verifier accepts, and a tampered one it rejects', () => {
    const resource = buildIQProResource({ scenario: 'declined', subscriptionId: 'seed_sub_1' });
    const body = signIQProWebhook(resource, PRIVATE);
    const parsed = JSON.parse(body);

    expect(verifyIQProWebhookSignature({ rawBody: body, resource: parsed.resource, signature: parsed.signature, publicKeyPem: PUBLIC })).toBe(true);

    const tampered = signIQProWebhook(resource, PRIVATE, { tamper: true });
    const tp = JSON.parse(tampered);

    expect(tp.resource.status).toBe('SETTLED');
    expect(verifyIQProWebhookSignature({ rawBody: tampered, resource: tp.resource, signature: tp.signature, publicKeyPem: PUBLIC })).toBe(false);
  });

  it('creates a dev keypair once and reuses it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sim-keys-'));
    try {
      const first = loadOrCreateDevKeypair(dir);
      const second = loadOrCreateDevKeypair(dir);

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.publicKeyPem).toBe(first.publicKeyPem);
      expect(first.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Square simulation', () => {
  const URL_ = 'http://localhost:3000/webhook/square';

  it('builds invoice failure / payment and card events', () => {
    const failed = JSON.parse(buildSquareWebhook({ scenario: 'invoice-failed', subscriptionId: 'sub_1' }));
    const paid = JSON.parse(buildSquareWebhook({ scenario: 'invoice-paid', subscriptionId: 'sub_1', amountMinor: 5000 }));
    const card = JSON.parse(buildSquareWebhook({ scenario: 'card-updated', customerId: 'cus_1' }));

    expect(failed).toMatchObject({ type: 'invoice.scheduled_charge_failed', data: { object: { invoice: { subscription_id: 'sub_1', status: 'UNPAID' } } } });
    expect(failed.data.object.invoice.payment_requests[0].computed_amount_money.amount).toBe(10375);
    expect(paid).toMatchObject({ type: 'invoice.payment_made', data: { object: { invoice: { status: 'PAID' } } } });
    expect(paid.data.object.invoice.payment_requests[0].total_completed_amount_money.amount).toBe(5000);
    expect(card).toMatchObject({ type: 'card.updated', data: { object: { card: { customer_id: 'cus_1' } } } });
  });

  it('signs so the app verifier accepts it', () => {
    const body = buildSquareWebhook({ scenario: 'invoice-failed', subscriptionId: 'sub_1' });
    const signatureHeader = signSquareWebhook(body, 'test_key_not_real', URL_);

    expect(verifySquareWebhookSignature({ signatureKey: 'test_key_not_real', notificationUrl: URL_, rawBody: body, signatureHeader })).toBe(true);
    expect(verifySquareWebhookSignature({ signatureKey: 'test_key_not_real', notificationUrl: URL_, rawBody: `${body} `, signatureHeader })).toBe(false);
  });
});

describe('parseArgs', () => {
  it('parses --key=value and bare flags', () => {
    expect(parseArgs(['--provider=iqpro', '--tamper', '--repeat=2', 'ignored'])).toEqual({ provider: 'iqpro', tamper: true, repeat: '2' });
  });
});
