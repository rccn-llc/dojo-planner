/**
 * The webhook subscriptions an operator must create by hand after onboarding.
 * Neither provider lets us create them through the API we use, and both
 * webhook routes refuse events they cannot verify — so a missing subscription
 * means failed renewals are silently never recorded.
 */

/** Production app origin; preview deployments have per-branch URLs. */
export const APP_URL = 'https://app.dojoplanner.com';

/**
 * Every Square event `webhook/square/route.ts` acts on. Keep in step with its
 * `handleWebhookEvent` switch — an event missing here is never delivered.
 */
export const SQUARE_WEBHOOK_EVENTS = [
  'invoice.payment_made',
  'invoice.scheduled_charge_failed',
  'subscription.updated',
  'payment.updated',
  'card.created',
  'card.updated',
  'card.automatically_updated',
  'card.disabled',
] as const;

type Target = 'production' | 'preview';

function webhookUrl(target: Target, path: string): string {
  return target === 'production' ? `${APP_URL}${path}` : `<Preview URL>${path}`;
}

/**
 * Square only sends status changes (paid invoices, failed charges, cancelled
 * subscriptions, captured payments, card changes) if a webhook subscription
 * exists — and its URL is an HMAC input, so it must match exactly.
 */
export function squareWebhookReminder(target: Target): string {
  return `
   ⚠️  Square webhooks — Square Developer Dashboard → Webhooks → Add subscription:
       URL:     ${webhookUrl(target, '/webhook/square')}   (exactly; it is part of the signature)
       Events:  ${SQUARE_WEBHOOK_EVENTS.join(', ')}
       Its signature key must be the Webhook Signature Key entered above.`;
}

/**
 * IQPro signs each webhook with the GATEWAY's key, and `webhookPublicKey`
 * stays null until a webhook exists for the gateway — until then every
 * delivery is refused (401).
 */
export function iqproWebhookReminder(target: Target): string {
  return `
   ⚠️  IQPro webhooks — iQ Pro+ → Developer Hub → Webhooks → Create New:
       Type:    Transaction
       URL:     ${webhookUrl(target, '/webhook/iqpro')}
       Without it no renewal, decline or retry is recorded for this gateway.`;
}
