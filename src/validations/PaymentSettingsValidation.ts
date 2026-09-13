import * as z from 'zod';
import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';

/**
 * Per-org merchant credentials, discriminated on `provider`.
 *
 * A union rather than one flat object because the two providers share no
 * credential fields: IQPro needs clientId/clientSecret/gatewayId, Square needs
 * an access token, location, application and webhook key. A flat schema would
 * have to make every field optional, which would let a half-filled Square save
 * through and leave the org pointing at a provider it cannot reach.
 *
 * Secrets (`clientSecret`, `accessToken`) are optional on update: they are
 * never sent back to the browser, so blank or omitted means "keep the stored
 * one". `updatePaymentProviderConfig` does that merge.
 */
const IQProCredentialsValidation = z.object({
  provider: z.literal(PAYMENT_PROVIDER.IQPRO),
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().max(500).optional(),
  gatewayId: z.string().trim().min(1).max(100),
});

const SquareCredentialsValidation = z.object({
  provider: z.literal(PAYMENT_PROVIDER.SQUARE),
  accessToken: z.string().trim().max(500).optional(),
  locationId: z.string().trim().min(1).max(100),
  applicationId: z.string().trim().min(1).max(200),
  environment: z.enum(['sandbox', 'production']),
  webhookSignatureKey: z.string().trim().max(500).optional(),
});

export const UpdatePaymentProviderConfigValidation = z.discriminatedUnion('provider', [
  IQProCredentialsValidation,
  SquareCredentialsValidation,
]);

export type UpdatePaymentProviderConfigInput = z.infer<typeof UpdatePaymentProviderConfigValidation>;
