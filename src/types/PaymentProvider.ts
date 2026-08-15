/**
 * Single source of truth for which payment processor an organization uses.
 *
 * The literal values here MUST match the CHECK constraint on
 * `organization.payment_provider` in `models/Schema.ts` and
 * `migrations/0000_baseline.sql`. Drizzle has no CHECK helper in this
 * codebase's usage, so the database enforces the constraint and this type
 * enforces it in TypeScript — they have to be kept in step by hand, the same
 * way `MEMBER_STATUS` mirrors the `member.status` vocabulary.
 *
 * Scope: this governs MEMBER-facing money movement for an organization —
 * memberships, lifecycle fees, events, and the kiosk store. It does NOT govern
 * platform SaaS billing (dojo-planner charging its customer orgs), which is
 * IQPro-only and lives in the `saas_*` columns.
 */
export const PAYMENT_PROVIDER = {
  IQPRO: 'iqpro',
  SQUARE: 'square',
} as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDER)[keyof typeof PAYMENT_PROVIDER];

/** All payment-provider values, for building Zod enums. */
export const PAYMENT_PROVIDER_VALUES = Object.values(PAYMENT_PROVIDER) as [
  PaymentProvider,
  ...PaymentProvider[],
];
