import type Stripe from 'stripe';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Env } from '@/libs/Env';
import { auditLogger, logger } from '@/libs/Logger';
import { getClientIP, isRateLimitingEnabled, webhookRateLimiter } from '@/libs/RateLimit';
import { stripe } from '@/libs/Stripe';
import { runWithTenant } from '@/libs/TenantContext';
import { getBootstrapTenantDb, WEBHOOK_BOOTSTRAP_ORG_ID } from '@/libs/WebhookTenantScope';
import { processWebhookEvent } from '@/services/BillingService';

/**
 * Applies rate limiting to webhook requests.
 * Returns a 429 response if rate limit is exceeded.
 */
async function applyWebhookRateLimit(request: Request): Promise<NextResponse | null> {
  if (!isRateLimitingEnabled()) {
    return null;
  }

  const clientIP = getClientIP(request);
  const result = await webhookRateLimiter.limit(clientIP);

  if (!result.success) {
    auditLogger.warn(`[RATE_LIMIT] Webhook rate limit exceeded for IP:${clientIP}`, {
      identifierType: 'ip',
      identifier: clientIP,
      remaining: result.remaining,
      reset: new Date(result.reset).toISOString(),
    });

    return NextResponse.json(
      {
        error: 'Too Many Requests',
        retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
          'Retry-After': String(Math.ceil((result.reset - Date.now()) / 1000)),
        },
      },
    );
  }

  return null;
}

export const POST = async (request: Request) => {
  // Apply rate limiting before processing
  const rateLimitResponse = await applyWebhookRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = await request.text();
  const signature = (await headers()).get('Stripe-Signature');

  if (!signature) {
    logger.error('Stripe-Signature header not found');
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Webhook signature verification failed: ${errorMessage}`);
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
  }

  // Sessionless, like the IQPro webhook: Stripe identifies the account by
  // customer id, not Clerk org. See WebhookTenantScope for why a bootstrap
  // scope is correct during the no-op phase and what replaces it.
  //
  // This route becomes scope-free in phase A2: `organization` moves to the
  // control plane, so `updateStripeSubscription` will target `controlDb`
  // directly and need no tenant at all.
  await runWithTenant(
    { orgId: WEBHOOK_BOOTSTRAP_ORG_ID, db: getBootstrapTenantDb(), source: 'webhook' },
    () => processWebhookEvent(event),
  );

  return NextResponse.json({ received: true });
};
