import * as z from 'zod';

/**
 * Schema for both per-org (customer payments) and platform (SaaS billing)
 * IQPro merchant credentials. `clientSecret` is optional on update — a blank
 * or omitted value means "keep the existing secret unchanged".
 */
export const UpdateIQProConfigValidation = z.object({
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().max(500).optional(),
  gatewayId: z.string().trim().min(1).max(100),
});

export type UpdateIQProConfigInput = z.infer<typeof UpdateIQProConfigValidation>;
