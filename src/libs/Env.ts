import { createEnv } from '@t3-oss/env-nextjs';
import * as z from 'zod';

export const Env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
    BILLING_PLAN_ENV: z.enum(['dev', 'test', 'prod']),
    // Upstash Redis for rate limiting (optional - rate limiting disabled if not configured)
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    // IQPro payment processor for member payments (optional - payments disabled if not configured)
    IQPRO_CLIENT_ID: z.string().min(1).optional(),
    IQPRO_CLIENT_SECRET: z.string().min(1).optional(),
    IQPRO_SCOPE: z.string().min(1).optional(),
    IQPRO_OAUTH_URL: z.string().url().optional(),
    IQPRO_BASE_URL: z.string().url().optional(),
    IQPRO_GATEWAY_ID: z.string().min(1).optional(),
    IQPRO_WEBHOOK_SECRET: z.string().min(1).optional(),
    // Service fee % applied to every transaction (membership + taxable).
    // Passed to IQPro as a paymentAdjustment of type "ServiceFee" (percentage,
    // not flatAmount — IQPro rejects flatAmount on ServiceFee adjustments).
    SERVICE_FEE_PCT: z.string().optional(),
    // Resend email service (optional - email sending disabled if not configured)
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
    NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST: z.string().optional(),
  },
  shared: {
    NODE_ENV: z.enum(['test', 'development', 'production']).optional(),
  },
  // You need to destructure all the keys manually
  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    BILLING_PLAN_ENV: process.env.BILLING_PLAN_ENV,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    IQPRO_CLIENT_ID: process.env.IQPRO_CLIENT_ID,
    IQPRO_CLIENT_SECRET: process.env.IQPRO_CLIENT_SECRET,
    IQPRO_SCOPE: process.env.IQPRO_SCOPE,
    IQPRO_OAUTH_URL: process.env.IQPRO_OAUTH_URL,
    IQPRO_BASE_URL: process.env.IQPRO_BASE_URL,
    IQPRO_GATEWAY_ID: process.env.IQPRO_GATEWAY_ID,
    IQPRO_WEBHOOK_SECRET: process.env.IQPRO_WEBHOOK_SECRET,
    SERVICE_FEE_PCT: process.env.SERVICE_FEE_PCT,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: process.env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN,
    NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST: process.env.NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST,
    NODE_ENV: process.env.NODE_ENV,
  },
});
