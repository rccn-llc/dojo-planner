/**
 * Send a SIGNED payment-provider webhook to a locally running app, to test the
 * failed-payment loop (webhook → transactions list / member detail → retry)
 * without a live gateway. Square's sandbox cannot produce a failed renewal at
 * all, and IQPro's sandbox decline triggers are not public — this is the
 * deterministic substitute.
 *
 * ── IQPro signing ───────────────────────────────────────────────────────────
 *
 * IQPro signs `resource` with the gateway's RSA private key. Locally the
 * simulator holds a DEV keypair in `.simulator-keys/` (gitignored — a private
 * key never enters the repo) and the app verifies against its public half via
 * `IQPRO_WEBHOOK_PUBLIC_KEY_OVERRIDE`, which the app refuses in production.
 * The first run creates the keypair and prints the value to put in .env.local.
 *
 * ── Square signing ──────────────────────────────────────────────────────────
 *
 * HMAC-SHA256 over notificationUrl + body with the org's webhook signature key
 * (`--squareKey=` or `SQUARE_WEBHOOK_SIGNATURE_KEY`).
 *
 * Usage (app running on :3000, org seeded — seed ids are printed by the seed):
 *   npx tsx src/scripts/simulatePaymentWebhook.ts --provider=iqpro --scenario=declined --subscriptionId=seed_sub_x [--attempt=2] [--repeat=2]
 *   npx tsx src/scripts/simulatePaymentWebhook.ts --provider=iqpro --scenario=approved --subscriptionId=seed_sub_x
 *   npx tsx src/scripts/simulatePaymentWebhook.ts --provider=iqpro --scenario=one-time --transactionId=tx_unknown
 *   npx tsx src/scripts/simulatePaymentWebhook.ts --provider=iqpro --scenario=declined --subscriptionId=seed_sub_x --tamper   # expect 401
 *   npx tsx src/scripts/simulatePaymentWebhook.ts --provider=square --scenario=invoice-failed --subscriptionId=seed_sub_y
 *   npx tsx src/scripts/simulatePaymentWebhook.ts --provider=square --scenario=invoice-paid --subscriptionId=seed_sub_y
 *   npx tsx src/scripts/simulatePaymentWebhook.ts --provider=square --scenario=card-updated --customerId=seed_cus_z
 */
import { Buffer } from 'node:buffer';
import { constants, createHmac, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export type IQProScenario = 'declined' | 'approved' | 'one-time';
export type SquareScenario = 'invoice-failed' | 'invoice-paid' | 'card-updated';

/** The IQPro `resource` for a scenario, per the iQ Pro+ webhook guides. */
export function buildIQProResource(opts: {
  scenario: IQProScenario;
  subscriptionId?: string;
  transactionId?: string;
  customerId?: string;
  amount?: number;
  reason?: string;
}): Record<string, unknown> {
  const declined = opts.scenario === 'declined';
  return {
    transactionId: opts.transactionId ?? `sim_tx_${randomUUID()}`,
    // One-time Sales carry no subscriptionId — that is how the app tells them apart.
    ...(opts.scenario !== 'one-time' && opts.subscriptionId ? { subscriptionId: opts.subscriptionId } : {}),
    type: 'SALE',
    status: declined ? 'DECLINED' : 'PENDINGSETTLEMENT',
    response: declined ? 'Declined' : 'Approved',
    responseCode: declined ? 200 : 100,
    processorResponseText: declined ? (opts.reason ?? 'Insufficient funds') : 'Approved',
    transactionRemit: { amount: opts.amount ?? 103.75 },
    transactionPaymentMethod: { card: { maskedCard: '424242******4242', cardType: 'VISA', expirationDate: '03/29' } },
    customer: { customerId: opts.customerId ?? `sim_cus_${randomUUID()}`, name: 'Simulated Member' },
    createdDateTime: new Date().toISOString(),
  };
}

/**
 * The exact request body, with `resource` serialized ONCE and that same text
 * signed — what IQPro does, and what the app's raw-substring check verifies.
 */
export function signIQProWebhook(resource: Record<string, unknown>, privateKeyPem: string, opts: { tamper?: boolean } = {}): string {
  const resourceText = JSON.stringify(resource);
  const signature = sign('sha256', Buffer.from(resourceText, 'utf8'), { key: privateKeyPem, padding: constants.RSA_PKCS1_PADDING }).toString('base64');
  // Tamper AFTER signing so the signature no longer matches.
  const sentResource = opts.tamper ? resourceText.replace(/"status":"[A-Z]+"/, '"status":"SETTLED"') : resourceText;
  return `{"resourceType":"TRANSACTION","subType":"Sale","resource":${sentResource},"traceId":"sim-${randomUUID()}","actionDateTime":"${new Date().toISOString()}","hashAlg":"SHA256","signatureAlg":"RSA","signature":"${signature}"}`;
}

/** A Square webhook body for a scenario. */
export function buildSquareWebhook(opts: {
  scenario: SquareScenario;
  subscriptionId?: string;
  customerId?: string;
  amountMinor?: number;
}): string {
  const eventId = `sim_evt_${randomUUID()}`;
  if (opts.scenario === 'card-updated') {
    return JSON.stringify({
      type: 'card.updated',
      event_id: eventId,
      data: { type: 'card', id: `ccof:${randomUUID()}`, object: { card: { id: `ccof:${randomUUID()}`, customer_id: opts.customerId, last_4: '4242' } } },
    });
  }
  const failed = opts.scenario === 'invoice-failed';
  const amount = opts.amountMinor ?? 10375;
  return JSON.stringify({
    type: failed ? 'invoice.scheduled_charge_failed' : 'invoice.payment_made',
    event_id: eventId,
    data: {
      type: 'invoice',
      id: `inv:${randomUUID()}`,
      object: {
        invoice: {
          id: `sim_inv_${randomUUID()}`,
          subscription_id: opts.subscriptionId,
          status: failed ? 'UNPAID' : 'PAID',
          updated_at: new Date().toISOString(),
          payment_requests: [{
            computed_amount_money: { amount, currency: 'USD' },
            total_completed_amount_money: { amount: failed ? 0 : amount, currency: 'USD' },
          }],
        },
      },
    },
  });
}

export function signSquareWebhook(body: string, signatureKey: string, notificationUrl: string): string {
  return createHmac('sha256', signatureKey).update(notificationUrl + body).digest('base64');
}

const KEY_DIR = '.simulator-keys';

/** Load (or create on first run) the dev IQPro keypair. */
export function loadOrCreateDevKeypair(dir = KEY_DIR): { privateKeyPem: string; publicKeyPem: string; created: boolean } {
  const priv = path.join(dir, 'iqpro-webhook-private.pem');
  const pub = path.join(dir, 'iqpro-webhook-public.pem');
  if (existsSync(priv) && existsSync(pub)) {
    return { privateKeyPem: readFileSync(priv, 'utf8'), publicKeyPem: readFileSync(pub, 'utf8'), created: false };
  }
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  mkdirSync(dir, { recursive: true });
  writeFileSync(priv, privateKeyPem, { mode: 0o600 });
  writeFileSync(pub, publicKeyPem);
  return { privateKeyPem, publicKeyPem, created: true };
}

export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) {
      out[m[1]!] = m[2] ?? true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args.url ?? 'http://localhost:3000').replace(/\/$/, '');
  const repeat = Number(args.repeat ?? 1);
  const provider = args.provider;

  let url: string;
  let headers: Record<string, string>;
  let body: string;

  if (provider === 'iqpro') {
    const keys = loadOrCreateDevKeypair();
    if (keys.created) {
      const bare = keys.publicKeyPem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
      console.info(`Created a dev IQPro webhook keypair in ${KEY_DIR}/.\nAdd this to .env.local and restart the dev server, then re-run:\n\nIQPRO_WEBHOOK_PUBLIC_KEY_OVERRIDE=${bare}\n`);
      return;
    }
    const resource = buildIQProResource({
      scenario: (args.scenario as IQProScenario) ?? 'declined',
      subscriptionId: typeof args.subscriptionId === 'string' ? args.subscriptionId : undefined,
      transactionId: typeof args.transactionId === 'string' ? args.transactionId : undefined,
      customerId: typeof args.customerId === 'string' ? args.customerId : undefined,
      amount: args.amount ? Number(args.amount) : undefined,
      reason: typeof args.reason === 'string' ? args.reason : undefined,
    });
    body = signIQProWebhook(resource, keys.privateKeyPem, { tamper: args.tamper === true });
    url = `${baseUrl}/webhook/iqpro`;
    headers = { 'content-type': 'application/json' };
  } else if (provider === 'square') {
    const key = typeof args.squareKey === 'string' ? args.squareKey : process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (!key) {
      throw new Error('Pass --squareKey=<the org\'s Square webhook signature key> or set SQUARE_WEBHOOK_SIGNATURE_KEY.');
    }
    body = buildSquareWebhook({
      scenario: (args.scenario as SquareScenario) ?? 'invoice-failed',
      subscriptionId: typeof args.subscriptionId === 'string' ? args.subscriptionId : undefined,
      customerId: typeof args.customerId === 'string' ? args.customerId : undefined,
    });
    url = `${baseUrl}/webhook/square`;
    // --tamper signs different bytes than are sent, so verification must fail.
    const signedBody = args.tamper === true ? `${body} ` : body;
    headers = { 'content-type': 'application/json', 'x-square-hmacsha256-signature': signSquareWebhook(signedBody, key, url) };
  } else {
    throw new Error('--provider=iqpro|square is required.');
  }

  // --repeat sends the IDENTICAL body again: it must be recorded once.
  for (let i = 0; i < repeat; i++) {
    const res = await fetch(url, { method: 'POST', headers, body });
    console.info(`${i + 1}/${repeat} POST ${url} → ${res.status} ${await res.text()}`);
  }
}

if (process.argv[1]?.endsWith('simulatePaymentWebhook.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
