/**
 * Single source of truth for the member lifecycle status vocabulary.
 *
 * The literal values here MUST match the `member.status` column default/comment
 * in `models/Schema.ts` and every place that filters/writes a member status
 * (MemberFilterBar, MembersTable, ReportsService, DashboardService, the IQPro
 * webhook handler). Previously these literals were re-typed independently and
 * drifted — the Add Member wizard once wrote `'past due'` (space) while every
 * filter matched `'past_due'` (underscore), so declined-payment members
 * silently vanished from past-due views. Import from here to keep them in sync.
 */
export const MEMBER_STATUS = {
  ACTIVE: 'active',
  HOLD: 'hold',
  TRIAL: 'trial',
  CANCELLED: 'cancelled',
  PAST_DUE: 'past_due',
} as const;

export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];

/** All member-status values, for building Zod enums. */
export const MEMBER_STATUS_VALUES = Object.values(MEMBER_STATUS) as [MemberStatus, ...MemberStatus[]];
