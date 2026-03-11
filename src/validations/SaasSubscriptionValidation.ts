import { z } from 'zod';

export const SubscribeValidation = z.object({
  planId: z.enum(['basic', 'growth']),
  billingCycle: z.enum(['monthly', 'annual']),
  orgName: z.string().min(1),
  adminEmail: z.string().email(),

  // Card fields
  cardToken: z.string().optional(),
  cardFirstSix: z.string().max(6).optional(),
  cardLastFour: z.string().max(4).optional(),
  cardExpiry: z.string().optional(),
  cardNumber: z.string().optional(), // fallback for dev
});

export const ChangePlanValidation = z.object({
  newPlanId: z.enum(['basic', 'growth']),
  newBillingCycle: z.enum(['monthly', 'annual']),
});

export const CancelSubscriptionValidation = z.object({
  endOfPeriod: z.boolean(),
});
