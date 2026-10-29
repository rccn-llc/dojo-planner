/**
 * IQPro SANDBOX ONLY: put a test member on a $1.00 DAILY subscription, so a
 * real failed-renewal → decline webhooks → overdue → card update → retry loop
 * can be exercised in days instead of months.
 *
 * Why a script and not a product feature: the app offers no Daily plan, and
 * should not — this exists only to shorten the sandbox billing cycle.
 *
 * ── Prerequisites ───────────────────────────────────────────────────────────
 *
 *  1. A member created through the app's normal Add Member flow with an
 *     APPROVING sandbox card (e.g. Visa 4264281555555555), so they have an
 *     IQPro customer and a saved card. No card number ever passes through this
 *     script — it reuses the vaulted payment method.
 *  2. The dev server reachable from the internet (e.g. `cloudflared tunnel
 *     --url http://localhost:3000`), and an iQ Pro+ Developer Hub → Webhooks →
 *     Transaction webhook pointing at `<tunnel>/webhook/iqpro`.
 *     `IQPRO_WEBHOOK_PUBLIC_KEY_OVERRIDE` must be UNSET, so the app verifies
 *     with the gateway's real key.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 *
 * Creates the IQPro subscription (billingPeriodId 1 = Daily, unit 36 = Days,
 * both read from IQPro's /api/constants), adds a local `member_membership`
 * pointing at it, and records the `tenant_external_ref` rows the webhook route
 * needs to route its charges to this org.
 *
 * Usage (IQPRO_* from .env.local; DATABASE_URL = the local tenant DB, default the PGlite server):
 *   npx tsx src/scripts/iqproSandboxDailySubscription.ts --orgId=org_x --memberId=<uuid> [--amount=1.00] [--hour=14 --minute=30] [--planSlug=month-to-month-gold]
 *   npx tsx src/scripts/iqproSandboxDailySubscription.ts --cancel=<subscriptionId>
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { Pool } from 'pg';
import { loadEnvFile } from '../libs/EnvFiles';
import { IQPRO_BILLING_PERIOD, IQPRO_SUBSCRIPTION_STATUS, IQPRO_UNIT } from '../libs/IQProConstants';

/** IQPro `/api/constants/billingperiod`: 1 = Daily. */
export const IQPRO_BILLING_PERIOD_DAILY = IQPRO_BILLING_PERIOD.DAILY;
/** IQPro `/api/constants/units`: 36 = Days. */
export const IQPRO_UNIT_DAYS = IQPRO_UNIT.DAYS;

/** `CancelSubscription` body: `cancel` is REQUIRED — `{}` returns 400. */
export const CANCEL_NOW_BODY = { cancel: { now: true, endOfBillingPeriod: false } };

export type SandboxEnv = {
  IQPRO_CLIENT_ID: string;
  IQPRO_CLIENT_SECRET: string;
  IQPRO_SCOPE: string;
  IQPRO_OAUTH_URL: string;
  IQPRO_BASE_URL: string;
  IQPRO_GATEWAY_ID: string;
};

/** Refuse anything that is not the sandbox: this script creates real billing objects. */
export function assertSandbox(env: Partial<SandboxEnv>): asserts env is SandboxEnv {
  for (const key of ['IQPRO_CLIENT_ID', 'IQPRO_CLIENT_SECRET', 'IQPRO_SCOPE', 'IQPRO_OAUTH_URL', 'IQPRO_BASE_URL', 'IQPRO_GATEWAY_ID'] as const) {
    if (!env[key]) {
      throw new Error(`${key} is not set.`);
    }
  }
  if (!env.IQPRO_BASE_URL!.includes('sandbox') || !env.IQPRO_OAUTH_URL!.includes('sandbox')) {
    throw new Error('Refusing: IQPRO_BASE_URL / IQPRO_OAUTH_URL are not the IQPro SANDBOX. This script is sandbox-only.');
  }
}

/**
 * The InsertSubscription body for a daily charge at `hour:minute`. Mirrors
 * `IQProPaymentService.createSubscription` (two addresses, auto-charged saved
 * card) with the daily cadence and no service-fee adjustment, so the webhook's
 * amount is exactly `amount`.
 */
export function buildDailySubscriptionPayload(p: {
  customerId: string;
  paymentMethodId: string;
  cardProcessorId: string | null;
  amount: number;
  firstName: string;
  lastName: string;
  email: string;
  /** Two-letter US state. IQPro rejects a placeholder ("Invalid state for specified country"). */
  state: string;
  hour: number;
  minute: number;
  /** The gateway's IANA time zone (`GET /api/gateway/{id}` → `timezone`). */
  timeZone?: string;
  now?: Date;
}): Record<string, unknown> {
  const start = gatewayStartTime(p.now ?? new Date(), p.timeZone ?? 'UTC');
  return {
    customerId: p.customerId,
    // ACTIVE, not the app's SCHEDULED: see gatewayStartTime.
    subscriptionStatusId: IQPRO_SUBSCRIPTION_STATUS.ACTIVE,
    name: 'Sandbox daily test',
    prefix: 'SBXDAILY',
    recurrence: {
      termStartDate: start,
      billingStartDate: start,
      isAutoRenewed: true,
      allowProration: false,
      trialLengthInDays: 0,
      invoiceLengthInDays: 1,
      billingPeriodId: IQPRO_BILLING_PERIOD_DAILY,
      schedule: { minutes: [p.minute], hours: [p.hour] },
    },
    paymentMethod: {
      customerPaymentMethodId: p.paymentMethodId,
      isAutoCharged: true,
      ...(p.cardProcessorId ? { cardProcessorId: p.cardProcessorId } : {}),
    },
    addresses: [
      { isBilling: true, isShipping: false, isRemittance: false, firstName: p.firstName, lastName: p.lastName, email: p.email, state: p.state, country: 'US' },
      { isBilling: false, isShipping: false, isRemittance: true, firstName: p.firstName, lastName: p.lastName, email: p.email, country: 'US' },
    ],
    lineItems: [{
      name: 'Sandbox daily test',
      description: 'Daily sandbox charge (failed-payment testing)',
      quantity: 1,
      unitPrice: p.amount,
      discount: 0,
      unitOfMeasureId: IQPRO_UNIT_DAYS,
    }],
  };
}

/** Wall-clock parts of `date` in `timeZone`. */
function wallClock(date: Date, timeZone: string): { y: string; mo: string; d: string; h: number; mi: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { y: parts.year!, mo: parts.month!, d: parts.day!, h: Number(parts.hour), mi: Number(parts.minute) };
}

/**
 * Default run time: ~10 minutes from now, in the GATEWAY's time zone.
 * Sandbox: a schedule of 04:20 on a `US/Central` gateway is 04:20 Central, not
 * 04:20 UTC.
 */
export function defaultRunTime(now = new Date(), timeZone = 'UTC'): { hour: number; minute: number } {
  const t = wallClock(new Date(now.getTime() + 10 * 60 * 1000), timeZone);
  return { hour: t.h, minute: t.mi };
}

/**
 * Two minutes from now on the gateway's wall clock, written with a `Z`.
 *
 * ⚠️ Sandbox findings (US/Central gateway, CDT = UTC−5):
 *  - IQPro STORES a start date as if its clock time were gateway-local: we sent
 *    04:10Z and it stored 09:10Z. So the effective start is the clock time read
 *    as Central — here, two minutes from now.
 *  - It VALIDATES the status against the start as real UTC: a future start must
 *    be SCHEDULED, a past one ACTIVE. This string is ~5h in the past as UTC, so
 *    it needs ACTIVE ("Status provided is Scheduled but status expected is
 *    Active"). The app sends real `now`, which validates as SCHEDULED.
 *  - Start date and schedule can be edited only while DRAFT.
 */
export function gatewayStartTime(now: Date, timeZone: string): string {
  const t = wallClock(new Date(now.getTime() + 2 * 60 * 1000), timeZone);
  return `${t.y}-${t.mo}-${t.d}T${String(t.h).padStart(2, '0')}:${String(t.mi).padStart(2, '0')}:00.000Z`;
}

export function parseArgs(argv: string[]): Record<string, string> {
  return Object.fromEntries(argv.flatMap((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [[m[1]!, m[2]!]] : [];
  }));
}

async function iqpro(env: SandboxEnv) {
  const tokenRes = await fetch(env.IQPRO_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.IQPRO_CLIENT_ID, client_secret: env.IQPRO_CLIENT_SECRET, scope: env.IQPRO_SCOPE }),
  });
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) {
    throw new Error(`IQPro token request failed (${tokenRes.status}). An expired client secret shows as AADB2C90085.`);
  }
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${env.IQPRO_BASE_URL}${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`IQPro ${method} ${path} → ${res.status}: ${text}`);
    }
    return (text ? JSON.parse(text) : {}) as { data?: Record<string, unknown> };
  };
  return call;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // .env.local only (shell variables still win) — it holds the sandbox credentials.
  loadEnvFile(path.join(process.cwd(), '.env.local'));
  const env: Partial<SandboxEnv> = {
    IQPRO_CLIENT_ID: process.env.IQPRO_CLIENT_ID,
    IQPRO_CLIENT_SECRET: process.env.IQPRO_CLIENT_SECRET,
    IQPRO_SCOPE: process.env.IQPRO_SCOPE,
    IQPRO_OAUTH_URL: process.env.IQPRO_OAUTH_URL,
    IQPRO_BASE_URL: process.env.IQPRO_BASE_URL,
    IQPRO_GATEWAY_ID: process.env.IQPRO_GATEWAY_ID,
  };
  assertSandbox(env);
  const call = await iqpro(env);

  if (args.cancel) {
    // IQPro rejects an empty body (400); `cancel` is required.
    await call('POST', `/api/gateway/${env.IQPRO_GATEWAY_ID}/subscription/${args.cancel}/cancel`, CANCEL_NOW_BODY);
    console.info(`Cancelled sandbox subscription ${args.cancel}.`);
    return;
  }

  const { orgId, memberId } = args;
  if (!orgId || !memberId) {
    throw new Error('--orgId and --memberId are required (or --cancel=<subscriptionId>).');
  }
  const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const { rows: [member] } = await pool.query(
      `SELECT m.first_name, m.last_name, m.email, m.provider_customer_id, pm.provider_payment_method_id,
              (SELECT a.state FROM address a WHERE a.member_id = m.id
                ORDER BY (a.type = 'billing') DESC, a.is_default DESC LIMIT 1) AS state
         FROM member m JOIN payment_method pm ON pm.member_id = m.id AND pm.status = 'active'
        WHERE m.id = $1 AND m.organization_id = $2 AND pm.provider_payment_method_id IS NOT NULL
        ORDER BY pm.is_default DESC LIMIT 1`,
      [memberId, orgId],
    );
    if (!member?.provider_customer_id || member.provider_customer_id.startsWith('seed_')) {
      throw new Error('That member has no real IQPro customer + saved card. Add them through the app (Add Member) with an approving sandbox card first.');
    }

    const { rows: [plan] } = await pool.query(
      `SELECT id, name FROM membership_plan WHERE organization_id = $1 ${args.planSlug ? 'AND slug = $2' : ''} ORDER BY created_at LIMIT 1`,
      args.planSlug ? [orgId, args.planSlug] : [orgId],
    );
    if (!plan) {
      throw new Error('No membership plan found for the org (pass --planSlug).');
    }

    const gateway = await call('GET', `/api/gateway/${env.IQPRO_GATEWAY_ID}`);
    const gatewayData = (gateway.data ?? gateway) as { processors?: Array<{ processorId: string; isDefaultCard?: boolean }>; timezone?: string };
    const processors = gatewayData.processors ?? [];
    const cardProcessorId = (processors.find(x => x.isDefaultCard) ?? processors[0])?.processorId ?? null;
    // Schedules run in the gateway's own time zone (sandbox: US/Central).
    const timeZone = gatewayData.timezone ?? 'UTC';

    const { hour, minute } = args.hour ? { hour: Number(args.hour), minute: Number(args.minute ?? 0) } : defaultRunTime(new Date(), timeZone);
    const payload = buildDailySubscriptionPayload({
      customerId: member.provider_customer_id,
      paymentMethodId: member.provider_payment_method_id,
      cardProcessorId,
      amount: Number(args.amount ?? '1.00'),
      firstName: member.first_name,
      lastName: member.last_name,
      email: member.email,
      state: /^[A-Z]{2}$/i.test(member.state ?? '') ? member.state.toUpperCase() : 'CA',
      hour,
      minute,
      timeZone,
    });
    const created = await call('POST', `/api/gateway/${env.IQPRO_GATEWAY_ID}/subscription`, payload);
    const sub = (created.data ?? created) as { subscriptionId?: string; id?: string };
    const subscriptionId = sub.subscriptionId ?? sub.id;
    if (!subscriptionId) {
      throw new Error(`IQPro returned no subscription id: ${JSON.stringify(created)}`);
    }

    const membershipId = randomUUID();
    await pool.query(
      `INSERT INTO member_membership (id, member_id, membership_plan_id, status, billing_type, provider_subscription_id)
       VALUES ($1, $2, $3, 'active', 'autopay', $4)`,
      [membershipId, memberId, plan.id, subscriptionId],
    );

    // Routing refs live in the control plane. Locally that is the SAME
    // database, and pglite-server accepts one connection, so reuse `pool`
    // rather than open a second one it would refuse — after the subscription
    // already exists, which would leave its webhooks unroutable.
    const controlUrl = process.env.CONTROL_DATABASE_URL ?? databaseUrl;
    const control = controlUrl === databaseUrl ? pool : new Pool({ connectionString: controlUrl, max: 1 });
    try {
      for (const [refType, refId] of [['provider_subscription', subscriptionId], ['provider_customer', member.provider_customer_id]]) {
        await control.query(
          'INSERT INTO tenant_external_ref (ref_type, ref_id, org_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [refType, refId, orgId],
        );
      }
    } finally {
      if (control !== pool) {
        await control.end().catch(() => {});
      }
    }

    console.info(`
Created sandbox DAILY subscription ${subscriptionId}
  member:     ${member.first_name} ${member.last_name} (${memberId})
  membership: ${membershipId} on "${plan.name}"
  charges:    $${payload.lineItems && (payload.lineItems as Array<{ unitPrice: number }>)[0]!.unitPrice} daily at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${timeZone} (gateway time)

Next:
  1. Watch the dev server log for "[IQPro Webhook] Received" at that time — a PAID renewal row should appear.
  2. Make it decline: open IQPro's "update your card" email (or the subscription in the iQ Pro+ portal) and
     switch the card to the sandbox decline card 4124939999999990 ("Not sufficient funds").
     The next runs should produce declined rows: attempt 1/3, 2/3, 3/3 → overdue.
  3. Update the card back to 4264281555555555, open the member (or wait for the daily job): the
     "Card updated — ready to retry" label should appear. Retry from the modal; it should pay the invoice,
     and IQPro must NOT charge again for that cycle.
  4. Clean up: npx tsx src/scripts/iqproSandboxDailySubscription.ts --cancel=${subscriptionId}
`);
  } finally {
    await pool.end().catch(() => {});
  }
}

if (process.argv[1]?.endsWith('iqproSandboxDailySubscription.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
