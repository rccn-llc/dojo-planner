import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { iqproWebhookReminder, SQUARE_WEBHOOK_EVENTS, squareWebhookReminder } from './webhookReminders';

describe('webhook reminders', () => {
  it('lists every Square event the webhook route handles', () => {
    // Drift guard: an event the route handles but the operator never
    // subscribes to is simply never delivered.
    const route = readFileSync(path.join(process.cwd(), 'src/app/[locale]/webhook/square/route.ts'), 'utf8');
    const handled = [...route.matchAll(/case '([a-z_.]+)':/g)].map(m => m[1]);

    expect([...SQUARE_WEBHOOK_EVENTS].sort()).toEqual([...new Set(handled)].sort());
  });

  it('prints the exact production Square URL and every event', () => {
    const text = squareWebhookReminder('production');

    expect(text).toContain('https://app.dojoplanner.com/webhook/square');

    for (const event of SQUARE_WEBHOOK_EVENTS) {
      expect(text).toContain(event);
    }
  });

  it('prints a placeholder URL for preview', () => {
    expect(squareWebhookReminder('preview')).toContain('<Preview URL>/webhook/square');
    expect(iqproWebhookReminder('preview')).toContain('<Preview URL>/webhook/iqpro');
  });

  it('tells the operator to create an IQPro Transaction webhook', () => {
    const text = iqproWebhookReminder('production');

    expect(text).toContain('Developer Hub');
    expect(text).toContain('Transaction');
    expect(text).toContain('https://app.dojoplanner.com/webhook/iqpro');
  });
});
