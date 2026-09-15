/**
 * What the browser needs in order to collect a card, for whichever provider an
 * organization uses.
 *
 * ── Why one union rather than two endpoints ─────────────────────────────────
 *
 * The provider identity and its credentials are needed at the same instant, by
 * the same component. Splitting them across two calls means they can disagree,
 * and on the payment path a disagreement means tokenizing against the wrong
 * merchant account. A discriminated union makes that state unrepresentable.
 *
 * The same reasoning applies one level down: `resolvePaymentProviderConfig`
 * reads the provider column and the credential blob from a SINGLE row
 * snapshot, because two reads can straddle a provider switch.
 *
 * ⚠️ The Square branch carries ONLY browser-safe fields. `accessToken` and
 * `webhookSignatureKey` are merchant secrets and must never appear here — see
 * the test that asserts their absence.
 */

import type { PAYMENT_PROVIDER } from './PaymentProvider';
import type { TokenizationIframeConfig } from '@/libs/IQPro';

/**
 * The three values Square's Web Payments SDK needs in the browser.
 *
 * `applicationId` and `locationId` are per-ORGANIZATION, which is why they come
 * over the wire rather than from `NEXT_PUBLIC_SQUARE_APPLICATION_ID` — a
 * build-time constant cannot serve multiple orgs.
 *
 * `environment` selects the SDK script URL at runtime, so it must travel too.
 */
export type SquareCardConfig = {
  applicationId: string;
  locationId: string;
  environment: 'sandbox' | 'production';
};

export type ClientTokenizationConfig
  = | { provider: typeof PAYMENT_PROVIDER.IQPRO; iqpro: TokenizationIframeConfig }
    | { provider: typeof PAYMENT_PROVIDER.SQUARE; square: SquareCardConfig };
