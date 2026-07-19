/**
 * Database Seed Script
 *
 * Populates the database with sample data for development and testing.
 * Based on mock data from the codebase.
 *
 * Usage:
 *   npx tsx src/scripts/seed.ts              # Seed all organizations
 *   npx tsx src/scripts/seed.ts --orgId=org_xxx  # Seed specific organization
 *   npx tsx src/scripts/seed.ts --reset      # Clear and re-seed
 *
 * SaaS subscription provisioning (for --orgId):
 *   By default the seed writes an ACTIVE SaaS subscription onto the org so the
 *   dashboard access gate doesn't redirect freshly-seeded orgs. When platform
 *   IQPro credentials resolve (Platform Settings or IQPRO_* env) AND
 *   CLERK_SECRET_KEY is set, it attempts REAL provisioning via subscribe():
 *   it looks up the org's academy_owner in Clerk, creates a real IQPro
 *   customer + subscription, and stores the owner's Clerk userId on the org.
 *   If creds/owner are unavailable (e.g. local PGLite) it falls back to
 *   synthetic IDs plus a synthetic responsible owner so the owner-aware gate
 *   doesn't lock out local orgs.
 *
 *   SaaS flags:
 *     --skipSaas               Don't touch SaaS fields at all
 *     --saasPlan=basic|growth  Plan to provision (default: basic)
 *     --saasCycle=monthly|annual (default: monthly)
 *     --saasEmail=<email>      Billing email for the IQPro customer
 *     --saasOrgName=<name>     Org display name for the IQPro customer
 *     --ownerClerkId=<id>      Synthetic responsible owner userId for the fallback
 *     --saasCard=<pan>         Sandbox test PAN for real provisioning (default 4111...)
 *     --saasExpiry=<MMYY>      Card expiry for real provisioning (default 1230)
 */

import type { SaasPlanId } from '../utils/SaasPlans';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { Pool } from 'pg';
import {
  addressSchema,
  attendanceSchema,
  auditEventSchema,
  catalogCategorySchema,
  catalogItemCategorySchema,
  catalogItemImageSchema,
  catalogItemSchema,
  catalogItemVariantSchema,
  classEnrollmentSchema,
  classInstructorSchema,
  classScheduleExceptionSchema,
  classScheduleInstanceSchema,
  classSchema,
  classTagSchema,
  couponSchema,
  couponUsageSchema,
  eventBillingSchema,
  eventInstructorSchema,
  eventRegistrationSchema,
  eventSchema,
  eventSessionSchema,
  eventTagSchema,
  familyMemberSchema,
  memberMembershipSchema,
  memberSchema,
  membershipPlanSchema,
  membershipTagSchema,
  membershipWaiverSchema,
  noteSchema,
  organizationSchema,
  paymentMethodSchema,
  programSchema,
  signedWaiverSchema,
  tagSchema,
  transactionSchema,
  waiverMergeFieldSchema,
  waiverTemplateSchema,
} from '../models/Schema';
import { computeNextPaymentDate, normalizeFrequency } from '../utils/PaymentSchedule';

// Parse command line arguments
const args = process.argv.slice(2);
const orgIdArg = args.find(arg => arg.startsWith('--orgId='));
const specificOrgId = orgIdArg ? orgIdArg.split('=')[1] : undefined;
const shouldReset = args.includes('--reset');

// SaaS-subscription seed options
function argValue(name: string): string | undefined {
  const found = args.find(arg => arg.startsWith(`${name}=`));
  return found ? found.split('=')[1] : undefined;
}
const skipSaas = args.includes('--skipSaas');
const saasPlan = (argValue('--saasPlan') ?? 'basic') as SaasPlanId;
const saasCycle = (argValue('--saasCycle') ?? 'monthly') as 'monthly' | 'annual';
const saasEmail = argValue('--saasEmail');
const saasOrgName = argValue('--saasOrgName');
const ownerClerkIdArg = argValue('--ownerClerkId');
const saasCard = argValue('--saasCard') ?? '4111111111111111';
const saasExpiry = argValue('--saasExpiry') ?? '1230';

// Database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  max: 1,
});
const db = drizzle({ client: pool });

// =============================================================================
// SEED DATA
// =============================================================================

// Programs (inferred from classes)
const programsData = [
  { name: 'Adult BJJ', slug: 'adult-bjj', description: 'Brazilian Jiu-Jitsu for adults', color: '#3b82f6' },
  { name: 'Kids Program', slug: 'kids-program', description: 'BJJ training for children', color: '#06b6d4' },
  { name: 'Competition Team', slug: 'competition-team', description: 'Training for competitors', color: '#a855f7' },
  { name: 'Special Programs', slug: 'special-programs', description: 'Women\'s classes and open mat', color: '#ec4899' },
];

// Class tags
const classTagsData = [
  { name: 'Event', slug: 'event', color: '#0ea5e9', entityType: 'class' },
  { name: 'Beginner', slug: 'beginner', color: '#22c55e', entityType: 'class' },
  { name: 'Advanced', slug: 'advanced', color: '#ef4444', entityType: 'class' },
  { name: 'Adults', slug: 'adults', color: '#3b82f6', entityType: 'class' },
  { name: 'Kids', slug: 'kids', color: '#06b6d4', entityType: 'class' },
  { name: 'Gi', slug: 'gi', color: '#8b5cf6', entityType: 'class' },
  { name: 'No-Gi', slug: 'no-gi', color: '#f97316', entityType: 'class' },
  { name: 'Intermediate', slug: 'intermediate', color: '#eab308', entityType: 'class' },
  { name: 'Competition', slug: 'competition', color: '#ec4899', entityType: 'class' },
];

// Membership tags
const membershipTagsData = [
  { name: 'Active', slug: 'active', color: '#22c55e', entityType: 'membership' },
  { name: 'Trial', slug: 'trial', color: '#f59e0b', entityType: 'membership' },
  { name: 'Inactive', slug: 'inactive', color: '#ef4444', entityType: 'membership' },
  { name: 'Monthly', slug: 'monthly', color: '#3b82f6', entityType: 'membership' },
  { name: 'Punchcard', slug: 'punchcard', color: '#8b5cf6', entityType: 'membership' },
];

// Classes data
const classesData = [
  {
    name: 'BJJ Fundamentals I',
    slug: 'bjj-fundamentals-i',
    description: 'Covers core positions, escapes, and submissions. Ideal for students in their first 6 months.',
    color: '#22c55e',
    programSlug: 'adult-bjj',
    defaultDurationMinutes: 60,
    tags: ['beginner', 'adults', 'gi'],
    schedule: [
      { dayOfWeek: 1, startTime: '06:00', endTime: '07:00' }, // Monday 6 AM
      { dayOfWeek: 3, startTime: '06:00', endTime: '07:00' }, // Wednesday 6 AM
      { dayOfWeek: 5, startTime: '18:00', endTime: '19:00' }, // Friday 6 PM
    ],
  },
  {
    name: 'BJJ Fundamentals II',
    slug: 'bjj-fundamentals-ii',
    description: 'Learn core BJJ techniques like sweeps, submissions, and escapes.',
    color: '#22c55e',
    programSlug: 'adult-bjj',
    defaultDurationMinutes: 90,
    tags: ['beginner', 'adults', 'gi'],
    schedule: [
      { dayOfWeek: 2, startTime: '06:00', endTime: '07:30' }, // Tuesday 6 AM
      { dayOfWeek: 4, startTime: '06:00', endTime: '07:30' }, // Thursday 6 AM
      { dayOfWeek: 2, startTime: '18:00', endTime: '19:30' }, // Tuesday 6 PM
      { dayOfWeek: 4, startTime: '18:00', endTime: '19:30' }, // Thursday 6 PM
    ],
  },
  {
    name: 'BJJ Intermediate',
    slug: 'bjj-intermediate',
    description: 'Covers intermediate curriculum. Builds on Fundamentals.',
    color: '#eab308',
    programSlug: 'adult-bjj',
    defaultDurationMinutes: 60,
    tags: ['intermediate', 'adults', 'gi'],
    schedule: [
      { dayOfWeek: 1, startTime: '19:00', endTime: '20:00' }, // Monday 7 PM
      { dayOfWeek: 3, startTime: '19:00', endTime: '20:00' }, // Wednesday 7 PM
    ],
  },
  {
    name: 'BJJ Advanced',
    slug: 'bjj-advanced',
    description: 'Advanced curriculum requiring at least blue belt.',
    color: '#a855f7',
    programSlug: 'adult-bjj',
    defaultDurationMinutes: 60,
    allowWalkIns: 'No', // Blue-belt+ prerequisite — not open to walk-ins.
    tags: ['advanced', 'adults', 'no-gi'],
    schedule: [
      { dayOfWeek: 3, startTime: '19:00', endTime: '20:00' }, // Wednesday 7 PM
      { dayOfWeek: 5, startTime: '19:00', endTime: '20:00' }, // Friday 7 PM
      { dayOfWeek: 5, startTime: '11:00', endTime: '12:00' }, // Friday 11 AM
    ],
  },
  {
    name: 'Kids Class',
    slug: 'kids-class',
    description: 'Builds coordination, focus, and basic grappling skills through games.',
    color: '#06b6d4',
    programSlug: 'kids-program',
    defaultDurationMinutes: 60,
    minAge: 6,
    maxAge: 12,
    tags: ['beginner', 'kids', 'gi'],
    schedule: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '17:00' }, // Tuesday 4 PM
      { dayOfWeek: 4, startTime: '16:00', endTime: '17:00' }, // Thursday 4 PM
    ],
  },
  {
    name: 'Advanced No-Gi',
    slug: 'advanced-no-gi',
    description: 'High percentage transitions, leg entanglements, and situational sparring.',
    color: '#f97316',
    programSlug: 'adult-bjj',
    defaultDurationMinutes: 60,
    tags: ['advanced', 'adults', 'no-gi'],
    schedule: [
      { dayOfWeek: 6, startTime: '12:00', endTime: '13:00' }, // Saturday 12 PM
      { dayOfWeek: 0, startTime: '12:00', endTime: '13:00' }, // Sunday 12 PM
    ],
  },
  {
    name: 'Women\'s BJJ',
    slug: 'womens-bjj',
    description: 'Technique focused class with optional sparring for women.',
    color: '#ec4899',
    programSlug: 'special-programs',
    defaultDurationMinutes: 60,
    tags: ['adults', 'gi'],
    schedule: [
      { dayOfWeek: 2, startTime: '17:00', endTime: '18:00' }, // Tuesday 5 PM
    ],
  },
  {
    name: 'Open Mat',
    slug: 'open-mat',
    description: 'Open training session. Bring your skill level to practice freely.',
    color: '#ef4444',
    programSlug: 'special-programs',
    defaultDurationMinutes: 120,
    tags: ['adults', 'gi'],
    schedule: [
      { dayOfWeek: 6, startTime: '10:00', endTime: '12:00' }, // Saturday 10 AM
      { dayOfWeek: 0, startTime: '10:00', endTime: '12:00' }, // Sunday 10 AM
    ],
  },
  {
    name: 'Competition Team',
    slug: 'competition-team',
    description: 'Advanced training for competition preparation.',
    color: '#a855f7',
    programSlug: 'competition-team',
    defaultDurationMinutes: 60,
    allowWalkIns: 'No', // Competition training is invite/roster only — no drop-ins.
    tags: ['advanced', 'competition', 'gi'],
    schedule: [
      { dayOfWeek: 1, startTime: '20:00', endTime: '21:00' }, // Monday 8 PM
      { dayOfWeek: 3, startTime: '20:00', endTime: '21:00' }, // Wednesday 8 PM
      { dayOfWeek: 5, startTime: '20:00', endTime: '21:00' }, // Friday 8 PM
    ],
  },
  {
    name: 'Kids Advanced',
    slug: 'kids-advanced',
    description: 'For students ages 10-15 with at least one stripe on a grey belt.',
    color: '#0ea5e9',
    programSlug: 'kids-program',
    defaultDurationMinutes: 60,
    minAge: 10,
    maxAge: 15,
    tags: ['advanced', 'kids', 'gi'],
    schedule: [
      { dayOfWeek: 2, startTime: '17:00', endTime: '18:00' }, // Tuesday 5 PM
      { dayOfWeek: 4, startTime: '17:00', endTime: '18:00' }, // Thursday 5 PM
    ],
  },
  {
    name: 'Open Mat - Weeknight',
    slug: 'open-mat-weeknight',
    description: 'Friday-night open training. Drill, roll, and ask questions.',
    color: '#ef4444',
    programSlug: 'special-programs',
    defaultDurationMinutes: 90,
    tags: ['adults', 'gi'],
    schedule: [
      { dayOfWeek: 5, startTime: '20:00', endTime: '21:30' }, // Friday 8 PM
    ],
  },
  {
    name: 'Beginner No-Gi',
    slug: 'beginner-no-gi',
    description: 'Intro no-gi techniques for students new to grappling without the kimono.',
    color: '#f97316',
    programSlug: 'adult-bjj',
    defaultDurationMinutes: 60,
    tags: ['beginner', 'adults', 'no-gi'],
    schedule: [
      { dayOfWeek: 6, startTime: '09:00', endTime: '10:00' }, // Saturday 9 AM
    ],
  },
  {
    name: 'Self-Defense Workshop',
    slug: 'self-defense-workshop',
    description: 'Practical situational self-defense for adults of all levels.',
    color: '#8b5cf6',
    programSlug: 'special-programs',
    defaultDurationMinutes: 75,
    tags: ['adults', 'gi'],
    schedule: [
      { dayOfWeek: 0, startTime: '13:00', endTime: '14:15' }, // Sunday 1 PM
    ],
  },
];

// Event pricing type. `validUntilDaysFromAnchor` is computed relative to the
// event's first session (e.g. -7 = "early bird ends 1 week before").
type EventPricing = {
  name: string;
  price: number;
  memberOnly?: boolean;
  validUntilDaysFromAnchor?: number;
};

// Events data. Session dates are expressed as day-offsets from the first
// session's anchor (`anchorDaysFromNow`) — so a 3-day seminar starting 6 weeks
// out becomes `anchorDaysFromNow: 42, sessions: [{dayOffset: 0,...}, {dayOffset: 1,...}]`.
type EventSession = {
  dayOffset: number;
  startTime: string;
  endTime: string;
};

const eventsData: Array<{
  name: string;
  slug: string;
  description: string;
  eventType: string;
  maxCapacity?: number;
  anchorDaysFromNow: number;
  sessions: EventSession[];
  pricing: EventPricing[];
}> = [
  {
    name: 'BJJ Fundamentals Seminar Series',
    slug: 'bjj-fundamentals-seminar',
    description: 'A comprehensive 3-day seminar covering essential BJJ fundamentals with world-class instruction.',
    eventType: 'seminar',
    anchorDaysFromNow: 42, // +6 weeks
    sessions: [
      { dayOffset: 0, startTime: '10:00', endTime: '13:00' },
      { dayOffset: 0, startTime: '15:00', endTime: '18:00' },
      { dayOffset: 1, startTime: '10:00', endTime: '13:00' },
      { dayOffset: 1, startTime: '15:00', endTime: '18:00' },
      { dayOffset: 2, startTime: '10:00', endTime: '13:00' },
    ],
    pricing: [
      { name: 'Early Bird', price: 149.99, validUntilDaysFromAnchor: -14 },
      { name: 'Regular', price: 199.99 },
    ],
  },
  {
    name: 'Guest Instructor: Master Rodriguez',
    slug: 'master-rodriguez-workshop',
    description: 'One-day exclusive training session with IBJJF World Champion.',
    eventType: 'workshop',
    maxCapacity: 40,
    anchorDaysFromNow: 70, // +10 weeks
    sessions: [
      { dayOffset: 0, startTime: '11:00', endTime: '14:00' },
    ],
    pricing: [
      { name: 'Member Price', price: 60, memberOnly: true },
      { name: 'Non-Member', price: 75 },
    ],
  },
  {
    name: 'Local BJJ Tournament',
    slug: 'local-bjj-tournament',
    description: 'In-house tournament open to adults and kids divisions. Spectators welcome.',
    eventType: 'tournament',
    maxCapacity: 120,
    anchorDaysFromNow: 98, // +14 weeks
    sessions: [
      { dayOffset: 0, startTime: '08:00', endTime: '17:00' },
    ],
    pricing: [
      { name: 'Adult Competitor', price: 85 },
      { name: 'Kids Competitor', price: 55 },
      { name: 'Spectator', price: 20 },
    ],
  },
  {
    name: 'Summer BJJ Camp',
    slug: 'summer-bjj-camp',
    description: '5-day immersive training camp with daily drills, rolling, and guest instruction.',
    eventType: 'camp',
    maxCapacity: 60,
    anchorDaysFromNow: 140, // +20 weeks
    sessions: [
      { dayOffset: 0, startTime: '09:00', endTime: '17:00' },
      { dayOffset: 1, startTime: '09:00', endTime: '17:00' },
      { dayOffset: 2, startTime: '09:00', endTime: '17:00' },
      { dayOffset: 3, startTime: '09:00', endTime: '17:00' },
      { dayOffset: 4, startTime: '09:00', endTime: '15:00' },
    ],
    pricing: [
      { name: 'Member', price: 499 },
      { name: 'Non-Member', price: 649 },
      { name: 'Kids', price: 299 },
    ],
  },
  {
    name: 'Women\'s Self-Defense Workshop',
    slug: 'womens-self-defense-past',
    description: 'A past workshop — kept seeded so reports show historical event-registration data.',
    eventType: 'workshop',
    maxCapacity: 30,
    anchorDaysFromNow: -84, // -12 weeks (past)
    sessions: [
      { dayOffset: 0, startTime: '13:00', endTime: '16:00' },
    ],
    pricing: [
      { name: 'Member', price: 0, memberOnly: true },
      { name: 'Non-Member', price: 40 },
    ],
  },
];

// Coupons data
const couponsData = [
  { code: 'CTA_FAMILY_1', name: 'Family Member Discount', discountType: 'percentage', discountValue: 15, applicableTo: 'membership', usageLimit: 100, status: 'active' },
  { code: 'NEWSTUDENT50', name: 'New Student Special', discountType: 'fixed', discountValue: 50, applicableTo: 'membership', usageLimit: 50, status: 'active' },
  { code: 'FREETRIAL7', name: '7 Day Free Trial', discountType: 'free_days', discountValue: 7, applicableTo: 'membership', usageLimit: null, status: 'active' },
  { code: 'BLACKFRIDAY', name: 'Black Friday Sale', discountType: 'percentage', discountValue: 25, applicableTo: 'event', usageLimit: 200, status: 'expired' },
  { code: 'SUMMER2024', name: 'Summer Promotion', discountType: 'percentage', discountValue: 20, applicableTo: 'all', usageLimit: 100, status: 'inactive' },
  { code: 'HOLIDAY25', name: 'Holiday Special', discountType: 'fixed', discountValue: 25, applicableTo: 'membership', usageLimit: 75, status: 'active' },
  { code: 'REFERRAL10', name: 'Referral Bonus', discountType: 'percentage', discountValue: 10, applicableTo: 'membership', usageLimit: null, status: 'active' },
  { code: 'FLASH20', name: 'Flash Sale', discountType: 'fixed', discountValue: 20, applicableTo: 'event', usageLimit: 50, status: 'expired' },
  { code: 'NEWYEAR25', name: 'New Year Special', discountType: 'percentage', discountValue: 25, applicableTo: 'all', usageLimit: 150, status: 'active' },
  { code: 'LOYALTY15', name: 'Loyalty Reward', discountType: 'percentage', discountValue: 15, applicableTo: 'membership', usageLimit: 100, status: 'active' },
  { code: 'SPRING10', name: 'Spring Sale', discountType: 'fixed', discountValue: 10, applicableTo: 'event', usageLimit: 40, status: 'active' },
  { code: 'VIP50', name: 'VIP Member Discount', discountType: 'fixed', discountValue: 50, applicableTo: 'membership', usageLimit: 20, status: 'inactive' },
];

// Members data — 14 records covering every lifecycle state + member type the
// UI distinguishes. `joinedMonthsAgo` and `lifecycleEventMonthsAgo` are
// relative offsets converted to real Dates at seed time via monthsFromNow().
// `planSlug` picks each member's membership; cancelled / past_due / hold
// members use their plan to drive cancellation/hold-fee transactions and the
// matching audit-log rows.
type MemberSeed = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string;
  status: 'active' | 'trial' | 'hold' | 'cancelled' | 'past_due';
  memberType: 'individual' | 'family-member' | 'head-of-household';
  planSlug: string | null; // null = no membership (rare; reserved for future)
  joinedMonthsAgo: number; // how long ago they signed up
  lifecycleEventMonthsAgo?: number; // hold / cancellation timestamp (months ago)
};

const membersData: MemberSeed[] = [
  // Individuals — every status represented.
  { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '+1234567890', dateOfBirth: '1990-01-15', status: 'active', memberType: 'individual', planSlug: '12-month-gold', joinedMonthsAgo: 28 },
  { firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.johnson@example.com', phone: '+1987654321', dateOfBirth: '1985-03-22', status: 'active', memberType: 'individual', planSlug: 'month-to-month-gold', joinedMonthsAgo: 4 },
  { firstName: 'Mike', lastName: 'Rodriguez', email: 'mike.rodriguez@example.com', phone: '+1555123456', dateOfBirth: '1992-07-10', status: 'trial', memberType: 'individual', planSlug: '7-day-trial', joinedMonthsAgo: 0 },
  { firstName: 'Emma', lastName: 'Wilson', email: 'emma.wilson@example.com', phone: '+1303555100', dateOfBirth: '1995-11-03', status: 'hold', memberType: 'individual', planSlug: '12-month-gold', joinedMonthsAgo: 18, lifecycleEventMonthsAgo: 3 },
  { firstName: 'David', lastName: 'Brown', email: 'david.brown@example.com', phone: '+1777888999', dateOfBirth: '1988-09-18', status: 'cancelled', memberType: 'individual', planSlug: '12-month-gold', joinedMonthsAgo: 22, lifecycleEventMonthsAgo: 2 },
  { firstName: 'Lisa', lastName: 'Martinez', email: 'lisa.martinez@example.com', phone: '+1444555666', dateOfBirth: '1991-12-07', status: 'past_due', memberType: 'individual', planSlug: '12-month-gold', joinedMonthsAgo: 20 },
  // Heads of household.
  { firstName: 'Alex', lastName: 'Thompson', email: 'alex.thompson@example.com', phone: '+1222333444', dateOfBirth: '1983-04-25', status: 'active', memberType: 'head-of-household', planSlug: 'family-plan', joinedMonthsAgo: 16 },
  { firstName: 'Isabella', lastName: 'Chen', email: 'isabella.chen@example.com', phone: '+1666777888', dateOfBirth: '1981-08-12', status: 'active', memberType: 'head-of-household', planSlug: 'competition-team', joinedMonthsAgo: 19 },
  // Family members linked to HOHs above (linkages created in §11b).
  { firstName: 'Noah', lastName: 'Thompson', email: 'noah.thompson@example.com', phone: null, dateOfBirth: '2014-06-20', status: 'active', memberType: 'family-member', planSlug: 'kids-monthly', joinedMonthsAgo: 16 },
  { firstName: 'Olivia', lastName: 'Thompson', email: 'olivia.thompson@example.com', phone: null, dateOfBirth: '2016-09-10', status: 'active', memberType: 'family-member', planSlug: 'kids-monthly', joinedMonthsAgo: 16 },
  { firstName: 'Maria', lastName: 'Thompson', email: 'maria.thompson@example.com', phone: '+1222333445', dateOfBirth: '1985-02-14', status: 'active', memberType: 'family-member', planSlug: 'month-to-month-gold', joinedMonthsAgo: 16 },
  { firstName: 'Ethan', lastName: 'Chen', email: 'ethan.chen@example.com', phone: null, dateOfBirth: '2013-11-30', status: 'hold', memberType: 'family-member', planSlug: 'kids-monthly', joinedMonthsAgo: 19, lifecycleEventMonthsAgo: 1 },
  { firstName: 'Liam', lastName: 'Chen', email: 'liam.chen@example.com', phone: null, dateOfBirth: '2015-04-05', status: 'active', memberType: 'family-member', planSlug: 'kids-monthly', joinedMonthsAgo: 19 },
  // One more individual on a punchcard for variety.
  { firstName: 'Sophia', lastName: 'Park', email: 'sophia.park@example.com', phone: '+1909555200', dateOfBirth: '1994-07-22', status: 'active', memberType: 'individual', planSlug: '10-class-punchcard', joinedMonthsAgo: 2 },
];

// Schedule exceptions — dates expressed as offsets in days from seedNow so
// they stay fresh on every re-seed (mix of past and future).
type ScheduleException = {
  classSlug: string;
  daysFromNow: number;
  exceptionType: 'modified' | 'cancelled';
  newStartTime?: string;
  newEndTime?: string;
  newInstructorClerkId?: string | null;
  reason: string;
};

const scheduleExceptionsData: ScheduleException[] = [
  // Past — for "what happened" history.
  { classSlug: 'bjj-fundamentals-i', daysFromNow: -21, exceptionType: 'modified', newInstructorClerkId: null, reason: 'Coach Alex out sick - Professor Jessica substituting' },
  { classSlug: 'bjj-fundamentals-i', daysFromNow: -14, exceptionType: 'cancelled', reason: 'Gym closed for maintenance' },
  { classSlug: 'kids-class', daysFromNow: -10, exceptionType: 'cancelled', reason: 'Snow day — gym closed' },
  { classSlug: 'beginner-no-gi', daysFromNow: -7, exceptionType: 'modified', newStartTime: '10:00', newEndTime: '11:00', reason: 'Holiday weekend — later start' },
  // Future — for "what's coming".
  { classSlug: 'competition-team', daysFromNow: 3, exceptionType: 'modified', newStartTime: '19:30', newEndTime: '20:30', reason: 'Earlier start time this week' },
  { classSlug: 'bjj-intermediate', daysFromNow: 7, exceptionType: 'modified', newStartTime: '19:30', newEndTime: '20:30', reason: 'Time change for upcoming tournament prep' },
  { classSlug: 'self-defense-workshop', daysFromNow: 14, exceptionType: 'cancelled', reason: 'Instructor at out-of-town seminar' },
  { classSlug: 'open-mat-weeknight', daysFromNow: 21, exceptionType: 'modified', newStartTime: '19:00', newEndTime: '21:00', reason: 'Extended open mat — visiting black belt' },
];

// Membership plans
// `frequency` is null for one-time / non-recurring plans (punchcards, free trials).
// For recurring plans it is one of: 'Weekly' | 'Monthly' | 'Semi-Annual' | 'Annual'.
// `holdFeeFrequency` is null when there's no hold fee; otherwise 'one-time' or one
// of the recurring cadences (drives whether holding creates a new IQPro subscription).
// `holdLimitPerYear` is null or 0 = unlimited; otherwise enforced via 12-month
// audit-event count in MemberPaymentService.holdMembershipLifecycle.
const membershipPlansData: Array<{
  name: string;
  slug: string;
  category: string;
  program: string;
  programSlug: string;
  price: number;
  signupFee: number;
  cancellationFee: number;
  holdFeeAmount: number;
  holdFeeFrequency: string | null;
  holdLimitPerYear: number | null;
  frequency: string | null;
  contractLength: string;
  accessLevel: string;
  description: string;
  isTrial: boolean;
}> = [
  { name: '12 Month Commitment (Gold)', slug: '12-month-gold', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 149, signupFee: 99, cancellationFee: 199, holdFeeAmount: 15, holdFeeFrequency: 'Monthly', holdLimitPerYear: 2, frequency: 'Monthly', contractLength: '12 Months', accessLevel: 'Unlimited', description: 'Best value — 12-month commitment with unlimited classes and recurring hold fee while paused.', isTrial: false },
  { name: 'Month to Month (Gold)', slug: 'month-to-month-gold', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 179, signupFee: 99, cancellationFee: 0, holdFeeAmount: 25, holdFeeFrequency: 'one-time', holdLimitPerYear: null, frequency: 'Monthly', contractLength: 'Month-to-Month', accessLevel: 'Unlimited', description: 'Flexible month-to-month with no cancellation fee. Unlimited holds.', isTrial: false },
  { name: '7-Day Free Trial', slug: '7-day-trial', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 0, signupFee: 0, cancellationFee: 0, holdFeeAmount: 0, holdFeeFrequency: null, holdLimitPerYear: null, frequency: null, contractLength: '7 Days', accessLevel: 'Unlimited', description: 'Try us out — 7 days of unlimited classes, no commitment.', isTrial: true },
  { name: 'Kids Monthly', slug: 'kids-monthly', category: 'Kids Brazilian Jiu-Jitsu', program: 'Kids', programSlug: 'kids-program', price: 99, signupFee: 50, cancellationFee: 0, holdFeeAmount: 10, holdFeeFrequency: 'one-time', holdLimitPerYear: 4, frequency: 'Monthly', contractLength: 'Month-to-Month', accessLevel: 'Kids Classes', description: 'Monthly plan for kids program. Generous hold policy for family travel.', isTrial: false },
  { name: 'Kids Annual', slug: 'kids-annual', category: 'Kids Brazilian Jiu-Jitsu', program: 'Kids', programSlug: 'kids-program', price: 990, signupFee: 50, cancellationFee: 100, holdFeeAmount: 25, holdFeeFrequency: 'Annual', holdLimitPerYear: 1, frequency: 'Annual', contractLength: '12 Months', accessLevel: 'Kids Classes', description: 'Annual prepay with $200 savings. One hold per year allowed.', isTrial: false },
  { name: 'Competition Team', slug: 'competition-team', category: 'Competition', program: 'Competition', programSlug: 'competition-team', price: 199, signupFee: 0, cancellationFee: 99, holdFeeAmount: 50, holdFeeFrequency: 'Monthly', holdLimitPerYear: 1, frequency: 'Monthly', contractLength: 'Month-to-Month', accessLevel: 'Unlimited + Comp Classes', description: 'Competition track — includes all adult and comp classes. Strict hold limit.', isTrial: false },
  { name: 'Family Plan (HOH)', slug: 'family-plan', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 299, signupFee: 150, cancellationFee: 250, holdFeeAmount: 30, holdFeeFrequency: 'Monthly', holdLimitPerYear: 2, frequency: 'Monthly', contractLength: '12 Months', accessLevel: 'Unlimited (HOH + dependents)', description: 'Head-of-household plan covering the primary member; dependents add on at family-member rates.', isTrial: false },
  { name: 'Weekly Drop-In', slug: 'weekly-dropin', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 35, signupFee: 0, cancellationFee: 0, holdFeeAmount: 0, holdFeeFrequency: null, holdLimitPerYear: null, frequency: 'Weekly', contractLength: 'Week-to-Week', accessLevel: 'Unlimited', description: 'Weekly recurring drop-in for travelers and casual training.', isTrial: false },
  { name: 'Semi-Annual Pass', slug: 'semi-annual-pass', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 800, signupFee: 100, cancellationFee: 50, holdFeeAmount: 0, holdFeeFrequency: null, holdLimitPerYear: null, frequency: 'Semi-Annual', contractLength: '6 Months', accessLevel: 'Unlimited', description: 'Pay every 6 months. No hold fee.', isTrial: false },
  { name: '10-Class Punch Card', slug: '10-class-punchcard', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 200, signupFee: 0, cancellationFee: 0, holdFeeAmount: 0, holdFeeFrequency: null, holdLimitPerYear: null, frequency: null, contractLength: 'N/A', accessLevel: '10 Classes', description: 'Pay-as-you-go punchcard for 10 classes. No expiration.', isTrial: false },
];

// Catalog categories
const catalogCategoriesData = [
  { name: 'Gis', slug: 'gis', description: 'Brazilian Jiu-Jitsu kimonos' },
  { name: 'Belts', slug: 'belts', description: 'Ranking belts for all levels' },
  { name: 'Apparel', slug: 'apparel', description: 'Rash guards, shorts, and training gear' },
  { name: 'Accessories', slug: 'accessories', description: 'Gear bags, patches, and more' },
  { name: 'Seminars & Events', slug: 'seminars-events', description: 'Access passes for special events' },
];

// Catalog items with variants
type VariantData = {
  name: string;
  price: number;
  stockQuantity: number;
};

type CatalogItemData = {
  type: 'merchandise' | 'event_access';
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  sku?: string;
  basePrice: number;
  compareAtPrice?: number;
  maxPerOrder: number;
  trackInventory: boolean;
  lowStockThreshold: number;
  isFeatured: boolean;
  categories: string[]; // category slugs
  variants: VariantData[]; // user-defined variants with name, price, and stock
  eventSlug?: string; // for event_access items
  imageUrl?: string; // placeholder image URL
};

const catalogItemsData: CatalogItemData[] = [
  // Gis - variants by size and color
  {
    type: 'merchandise',
    name: 'Academy White Gi',
    slug: 'academy-white-gi',
    description: 'Premium pearl weave gi with academy patches. Durable construction designed for daily training. Pre-shrunk cotton blend ensures a consistent fit wash after wash.',
    shortDescription: 'Premium pearl weave gi with academy patches',
    sku: 'GI-WHT',
    basePrice: 129.99,
    compareAtPrice: 159.99,
    maxPerOrder: 3,
    trackInventory: true,
    lowStockThreshold: 5,
    isFeatured: true,
    categories: ['gis'],
    variants: [
      { name: 'A0 White', price: 129.99, stockQuantity: 8 },
      { name: 'A1 White', price: 129.99, stockQuantity: 12 },
      { name: 'A2 White', price: 129.99, stockQuantity: 15 },
      { name: 'A3 White', price: 139.99, stockQuantity: 10 },
      { name: 'A4 White', price: 149.99, stockQuantity: 6 },
      { name: 'A5 White', price: 159.99, stockQuantity: 3 },
    ],
    imageUrl: 'https://placehold.co/600x600/f8fafc/1e293b?text=White+Gi',
  },
  {
    type: 'merchandise',
    name: 'Academy Blue Gi',
    slug: 'academy-blue-gi',
    description: 'Competition-approved blue gi with reinforced stitching. Perfect for tournaments and daily training. IBJJF approved.',
    shortDescription: 'Competition-approved blue gi',
    sku: 'GI-BLU',
    basePrice: 139.99,
    maxPerOrder: 3,
    trackInventory: true,
    lowStockThreshold: 5,
    isFeatured: false,
    categories: ['gis'],
    variants: [
      { name: 'A1 Blue', price: 139.99, stockQuantity: 8 },
      { name: 'A2 Blue', price: 139.99, stockQuantity: 10 },
      { name: 'A3 Blue', price: 149.99, stockQuantity: 7 },
      { name: 'A4 Blue', price: 159.99, stockQuantity: 4 },
    ],
    imageUrl: 'https://placehold.co/600x600/1e40af/ffffff?text=Blue+Gi',
  },
  {
    type: 'merchandise',
    name: 'Kids Training Gi',
    slug: 'kids-training-gi',
    description: 'Lightweight and durable gi designed for young practitioners. Easy-care fabric that withstands frequent washing.',
    shortDescription: 'Durable gi for young practitioners',
    sku: 'GI-KIDS',
    basePrice: 69.99,
    maxPerOrder: 2,
    trackInventory: true,
    lowStockThreshold: 5,
    isFeatured: false,
    categories: ['gis'],
    variants: [
      { name: 'M0 White', price: 59.99, stockQuantity: 10 },
      { name: 'M1 White', price: 64.99, stockQuantity: 12 },
      { name: 'M2 White', price: 69.99, stockQuantity: 8 },
      { name: 'M3 White', price: 74.99, stockQuantity: 6 },
    ],
    imageUrl: 'https://placehold.co/600x600/f8fafc/1e293b?text=Kids+Gi',
  },

  // Belts - variants by size
  {
    type: 'merchandise',
    name: 'White Belt',
    slug: 'white-belt',
    description: 'Standard white belt for beginners. Cotton construction with reinforced stitching.',
    shortDescription: 'Beginner ranking belt',
    sku: 'BELT-WHT',
    basePrice: 15.99,
    maxPerOrder: 2,
    trackInventory: true,
    lowStockThreshold: 10,
    isFeatured: false,
    categories: ['belts'],
    variants: [
      { name: 'A0', price: 15.99, stockQuantity: 20 },
      { name: 'A1', price: 15.99, stockQuantity: 25 },
      { name: 'A2', price: 15.99, stockQuantity: 30 },
      { name: 'A3', price: 15.99, stockQuantity: 25 },
      { name: 'A4', price: 15.99, stockQuantity: 15 },
    ],
    imageUrl: 'https://placehold.co/600x600/f8fafc/1e293b?text=White+Belt',
  },
  {
    type: 'merchandise',
    name: 'Blue Belt',
    slug: 'blue-belt',
    description: 'Premium blue belt for intermediate practitioners. Pearl weave construction.',
    shortDescription: 'Intermediate ranking belt',
    sku: 'BELT-BLU',
    basePrice: 19.99,
    maxPerOrder: 2,
    trackInventory: true,
    lowStockThreshold: 8,
    isFeatured: false,
    categories: ['belts'],
    variants: [
      { name: 'A1', price: 19.99, stockQuantity: 15 },
      { name: 'A2', price: 19.99, stockQuantity: 18 },
      { name: 'A3', price: 19.99, stockQuantity: 12 },
      { name: 'A4', price: 19.99, stockQuantity: 8 },
    ],
    imageUrl: 'https://placehold.co/600x600/1e40af/ffffff?text=Blue+Belt',
  },
  {
    type: 'merchandise',
    name: 'Purple Belt',
    slug: 'purple-belt',
    description: 'Premium purple belt for advanced practitioners. Pearl weave construction.',
    shortDescription: 'Advanced ranking belt',
    sku: 'BELT-PUR',
    basePrice: 24.99,
    maxPerOrder: 2,
    trackInventory: true,
    lowStockThreshold: 5,
    isFeatured: false,
    categories: ['belts'],
    variants: [
      { name: 'A1', price: 24.99, stockQuantity: 8 },
      { name: 'A2', price: 24.99, stockQuantity: 10 },
      { name: 'A3', price: 24.99, stockQuantity: 6 },
      { name: 'A4', price: 24.99, stockQuantity: 4 },
    ],
    imageUrl: 'https://placehold.co/600x600/7c3aed/ffffff?text=Purple+Belt',
  },
  {
    type: 'merchandise',
    name: 'Brown Belt',
    slug: 'brown-belt',
    description: 'Premium brown belt. Pearl weave construction with reinforced core.',
    shortDescription: 'Expert ranking belt',
    sku: 'BELT-BRN',
    basePrice: 29.99,
    maxPerOrder: 2,
    trackInventory: true,
    lowStockThreshold: 3,
    isFeatured: false,
    categories: ['belts'],
    variants: [
      { name: 'A1', price: 29.99, stockQuantity: 0 },
      { name: 'A2', price: 29.99, stockQuantity: 0 },
      { name: 'A3', price: 29.99, stockQuantity: 0 },
    ],
    imageUrl: 'https://placehold.co/600x600/78350f/ffffff?text=Brown+Belt',
  },
  {
    type: 'merchandise',
    name: 'Black Belt',
    slug: 'black-belt',
    description: 'Premium black belt for masters. Satin finish with embroidered bar.',
    shortDescription: 'Master ranking belt',
    sku: 'BELT-BLK',
    basePrice: 49.99,
    maxPerOrder: 1,
    trackInventory: true,
    lowStockThreshold: 2,
    isFeatured: false,
    categories: ['belts'],
    variants: [
      { name: 'A1', price: 49.99, stockQuantity: 0 },
      { name: 'A2', price: 49.99, stockQuantity: 0 },
      { name: 'A3', price: 49.99, stockQuantity: 0 },
    ],
    imageUrl: 'https://placehold.co/600x600/0f172a/ffffff?text=Black+Belt',
  },

  // Apparel - variants by size
  {
    type: 'merchandise',
    name: 'Academy Rash Guard - Long Sleeve',
    slug: 'rash-guard-long-sleeve',
    description: 'Compression fit rash guard with academy logo. Moisture-wicking fabric for no-gi training.',
    shortDescription: 'Long sleeve compression rash guard',
    sku: 'RG-LS',
    basePrice: 49.99,
    maxPerOrder: 5,
    trackInventory: true,
    lowStockThreshold: 5,
    isFeatured: true,
    categories: ['apparel'],
    variants: [
      { name: 'Small', price: 49.99, stockQuantity: 18 },
      { name: 'Medium', price: 49.99, stockQuantity: 25 },
      { name: 'Large', price: 49.99, stockQuantity: 20 },
      { name: 'X-Large', price: 54.99, stockQuantity: 13 },
    ],
    imageUrl: 'https://placehold.co/600x600/0f172a/ffffff?text=Rash+Guard',
  },
  {
    type: 'merchandise',
    name: 'Academy Rash Guard - Short Sleeve',
    slug: 'rash-guard-short-sleeve',
    description: 'Compression fit short sleeve rash guard. Perfect for hot training sessions.',
    shortDescription: 'Short sleeve compression rash guard',
    sku: 'RG-SS',
    basePrice: 39.99,
    maxPerOrder: 5,
    trackInventory: true,
    lowStockThreshold: 5,
    isFeatured: false,
    categories: ['apparel'],
    variants: [
      { name: 'Small', price: 39.99, stockQuantity: 12 },
      { name: 'Medium', price: 39.99, stockQuantity: 15 },
      { name: 'Large', price: 39.99, stockQuantity: 10 },
      { name: 'X-Large', price: 44.99, stockQuantity: 6 },
    ],
    imageUrl: 'https://placehold.co/600x600/0f172a/ffffff?text=Short+Sleeve',
  },
  {
    type: 'merchandise',
    name: 'No-Gi Shorts',
    slug: 'no-gi-shorts',
    description: 'Durable fight shorts with no pockets or zippers. Stretch fabric allows full range of motion.',
    shortDescription: 'Grappling shorts for no-gi training',
    sku: 'SHORTS',
    basePrice: 44.99,
    maxPerOrder: 5,
    trackInventory: true,
    lowStockThreshold: 5,
    isFeatured: false,
    categories: ['apparel'],
    variants: [
      { name: 'Small Black', price: 44.99, stockQuantity: 10 },
      { name: 'Medium Black', price: 44.99, stockQuantity: 12 },
      { name: 'Large Black', price: 44.99, stockQuantity: 10 },
      { name: 'X-Large Black', price: 49.99, stockQuantity: 6 },
      { name: 'XX-Large Black', price: 54.99, stockQuantity: 4 },
    ],
    imageUrl: 'https://placehold.co/600x600/0f172a/ffffff?text=Fight+Shorts',
  },
  {
    type: 'merchandise',
    name: 'Academy T-Shirt',
    slug: 'academy-tshirt',
    description: 'Soft cotton blend t-shirt with academy logo. Perfect for casual wear.',
    shortDescription: 'Cotton t-shirt with academy logo',
    sku: 'TSHIRT',
    basePrice: 29.99,
    maxPerOrder: 10,
    trackInventory: true,
    lowStockThreshold: 10,
    isFeatured: false,
    categories: ['apparel'],
    variants: [
      { name: 'Small Black', price: 29.99, stockQuantity: 20 },
      { name: 'Medium Black', price: 29.99, stockQuantity: 25 },
      { name: 'Large Black', price: 29.99, stockQuantity: 20 },
      { name: 'X-Large Black', price: 29.99, stockQuantity: 15 },
      { name: 'Small White', price: 29.99, stockQuantity: 15 },
      { name: 'Medium White', price: 29.99, stockQuantity: 18 },
      { name: 'Large White', price: 29.99, stockQuantity: 15 },
      { name: 'X-Large White', price: 29.99, stockQuantity: 10 },
    ],
    imageUrl: 'https://placehold.co/600x600/374151/ffffff?text=T-Shirt',
  },

  // Accessories - single variant or no variants
  {
    type: 'merchandise',
    name: 'Gear Bag',
    slug: 'gear-bag',
    description: 'Large capacity gear bag with ventilated compartment for wet gear. Multiple pockets for organization.',
    shortDescription: 'Spacious bag for all your training gear',
    sku: 'BAG',
    basePrice: 59.99,
    maxPerOrder: 2,
    trackInventory: true,
    lowStockThreshold: 5,
    isFeatured: false,
    categories: ['accessories'],
    variants: [{ name: 'Standard', price: 59.99, stockQuantity: 15 }],
    imageUrl: 'https://placehold.co/600x600/1e293b/ffffff?text=Gear+Bag',
  },
  {
    type: 'merchandise',
    name: 'Academy Patch',
    slug: 'academy-patch',
    description: 'Embroidered academy patch for your gi. Iron-on backing for easy application.',
    shortDescription: 'Embroidered gi patch',
    sku: 'PATCH',
    basePrice: 9.99,
    maxPerOrder: 10,
    trackInventory: true,
    lowStockThreshold: 20,
    isFeatured: false,
    categories: ['accessories'],
    variants: [{ name: 'Standard', price: 9.99, stockQuantity: 50 }],
    imageUrl: 'https://placehold.co/600x600/1e293b/ffffff?text=Patch',
  },
  {
    type: 'merchandise',
    name: 'Mouth Guard',
    slug: 'mouth-guard',
    description: 'Boil-and-bite mouth guard with protective case. Essential for sparring.',
    shortDescription: 'Protective mouth guard with case',
    sku: 'MOUTH',
    basePrice: 14.99,
    maxPerOrder: 3,
    trackInventory: true,
    lowStockThreshold: 15,
    isFeatured: false,
    categories: ['accessories'],
    variants: [{ name: 'Standard', price: 14.99, stockQuantity: 0 }],
    imageUrl: 'https://placehold.co/600x600/1e293b/ffffff?text=Mouth+Guard',
  },

  // Event Access - no variants needed
  {
    type: 'event_access',
    name: 'BJJ Fundamentals Seminar Pass',
    slug: 'fundamentals-seminar-pass',
    description: 'Full access pass for the 3-day BJJ Fundamentals Seminar Series. Includes all sessions and lunch.',
    shortDescription: '3-day seminar full access',
    sku: 'SEM-FUND',
    basePrice: 199.99,
    compareAtPrice: 249.99,
    maxPerOrder: 4,
    trackInventory: false,
    lowStockThreshold: 0,
    isFeatured: true,
    categories: ['seminars-events'],
    variants: [],
    eventSlug: 'bjj-fundamentals-seminar',
    imageUrl: 'https://placehold.co/600x600/059669/ffffff?text=Seminar+Pass',
  },
  {
    type: 'event_access',
    name: 'Master Rodriguez Workshop',
    slug: 'master-rodriguez-workshop',
    description: 'Exclusive training session with IBJJF World Champion Master Rodriguez. Limited to 40 participants.',
    shortDescription: 'Training with world champion',
    sku: 'SEM-ROD',
    basePrice: 75,
    maxPerOrder: 2,
    trackInventory: false,
    lowStockThreshold: 0,
    isFeatured: true,
    categories: ['seminars-events'],
    variants: [],
    eventSlug: 'master-rodriguez-workshop',
    imageUrl: 'https://placehold.co/600x600/7c3aed/ffffff?text=Workshop',
  },
];

// Waiver templates
const waiverTemplatesData = [
  {
    name: 'Standard Adult Waiver',
    slug: 'standard-adult-waiver',
    version: 1,
    content: `WAIVER AND RELEASE OF LIABILITY

By signing this waiver of liability and assumption of risk agreement, I acknowledge that participation in martial arts training at <academy> involves inherent risks, including but not limited to: physical contact, falls, sprains, strains, fractures, and other injuries.

I, the undersigned, hereby release, waive, discharge, and covenant not to sue <academy>, its owners (<academy_owners>), instructors, staff, and agents from any and all liability, claims, demands, actions, or causes of action arising out of any loss, damage, or injury, including death, that may be sustained by me while participating in any martial arts training or activities.

I understand and agree that:
1. I am voluntarily participating in these activities with full knowledge of the risks involved
2. I am physically fit and have no medical conditions that would prevent safe participation
3. I will follow all safety rules and instructions provided by instructors
4. I will notify the academy immediately of any injuries or health concerns
5. This waiver applies to all current and future training sessions and activities

I have read this waiver, fully understand its terms, and sign it voluntarily.`,
    description: 'Standard liability waiver for adult members (16+)',
    isActive: true,
    isDefault: true,
    requiresGuardian: true,
    guardianAgeThreshold: 16,
    membershipSlugs: ['12-month-gold', 'month-to-month-gold', 'competition-team', '10-class-punchcard'],
  },
  {
    name: 'Kids Program Waiver',
    slug: 'kids-program-waiver',
    version: 1,
    content: `YOUTH PARTICIPANT WAIVER AND RELEASE OF LIABILITY

As the parent or legal guardian of the minor participant, I acknowledge that participation in martial arts training at <academy> involves inherent risks appropriate for youth activities, including but not limited to: physical contact during supervised training, controlled falls, and minor bumps or bruises.

I, the undersigned parent/guardian, hereby release, waive, discharge, and covenant not to sue <academy>, its owners (<academy_owners>), instructors, staff, and agents from any and all liability, claims, demands, actions, or causes of action arising out of any loss, damage, or injury that may be sustained by my child while participating in youth martial arts training.

I understand and agree that:
1. My child is voluntarily participating with my full knowledge and consent
2. My child is physically fit to participate in age-appropriate martial arts activities
3. I will ensure my child follows all safety rules and instructions
4. I will inform the academy of any medical conditions, allergies, or special needs
5. I authorize emergency medical treatment if needed and I cannot be reached
6. This waiver applies to all current and future training sessions

I have read this waiver, fully understand its terms, and sign it voluntarily as the parent/legal guardian.`,
    description: 'Waiver for kids program requiring parent/guardian signature',
    isActive: true,
    isDefault: false,
    requiresGuardian: true,
    guardianAgeThreshold: 18,
    membershipSlugs: ['kids-monthly'],
  },
  {
    name: 'Free Trial Waiver',
    slug: 'free-trial-waiver',
    version: 1,
    content: `TRIAL PARTICIPANT WAIVER AND RELEASE OF LIABILITY

By signing this waiver, I acknowledge that I am participating in a trial session at <academy> and understand that martial arts training involves physical contact and inherent risks.

I, the undersigned, hereby release <academy>, its owners (<academy_owners>), instructors, and staff from any liability for injuries that may occur during my trial period.

I confirm that:
1. I am physically capable of participating in introductory martial arts training
2. I will follow all safety instructions provided
3. I understand this is a trial to evaluate the program
4. I will notify staff immediately of any health concerns

I have read and agree to these terms.`,
    description: 'Simplified waiver for trial members',
    isActive: true,
    isDefault: false,
    requiresGuardian: true,
    guardianAgeThreshold: 16,
    membershipSlugs: ['7-day-trial'],
  },
];

// =============================================================================
// SEED FUNCTIONS
// =============================================================================

async function clearSeededData(organizationId: string) {
  console.info(`  🗑️  Clearing existing seed data for org ${organizationId}...`);

  // Delete in reverse dependency order

  // Clear catalog data first (catalog_item references event)
  await db.delete(catalogItemCategorySchema).where(sql`${catalogItemCategorySchema.catalogItemId} IN (SELECT id FROM catalog_item WHERE organization_id = ${organizationId})`);
  await db.delete(catalogItemImageSchema).where(sql`${catalogItemImageSchema.catalogItemId} IN (SELECT id FROM catalog_item WHERE organization_id = ${organizationId})`);
  await db.delete(catalogItemVariantSchema).where(sql`${catalogItemVariantSchema.catalogItemId} IN (SELECT id FROM catalog_item WHERE organization_id = ${organizationId})`);
  await db.delete(catalogItemSchema).where(eq(catalogItemSchema.organizationId, organizationId));
  await db.delete(catalogCategorySchema).where(eq(catalogCategorySchema.organizationId, organizationId));

  // Clear waiver data (signed_waiver and membership_waiver reference waiver_template)
  await db.delete(signedWaiverSchema).where(eq(signedWaiverSchema.organizationId, organizationId));
  await db.delete(membershipWaiverSchema).where(sql`${membershipWaiverSchema.waiverTemplateId} IN (SELECT id FROM waiver_template WHERE organization_id = ${organizationId})`);
  await db.delete(waiverMergeFieldSchema).where(eq(waiverMergeFieldSchema.organizationId, organizationId));
  await db.delete(waiverTemplateSchema).where(eq(waiverTemplateSchema.organizationId, organizationId));

  // Clear transaction and payment data (references member)
  await db.delete(transactionSchema).where(eq(transactionSchema.organizationId, organizationId));
  await db.delete(paymentMethodSchema).where(sql`${paymentMethodSchema.memberId} IN (SELECT id FROM member WHERE organization_id = ${organizationId})`);

  // Clear audit_event rows for this org (references member / membership IDs that
  // are about to be deleted, so must run before those FK targets).
  await db.delete(auditEventSchema).where(eq(auditEventSchema.organizationId, organizationId));

  // Clear class and event dependencies, ordered by foreign-key depth so each
  // delete only happens after everything that references it has been removed.

  // 1) Tables that reference other "child" tables first.
  // event_registration references event_billing, event_session, and event.
  await db.delete(eventRegistrationSchema).where(sql`${eventRegistrationSchema.eventId} IN (SELECT id FROM event WHERE organization_id = ${organizationId})`);

  // attendance references class_schedule_instance and event_session, but those
  // schemas don't cascade — clear it before its FK targets.
  await db.delete(attendanceSchema).where(eq(attendanceSchema.organizationId, organizationId));

  // class_enrollment references member + class.
  await db.delete(classEnrollmentSchema).where(sql`${classEnrollmentSchema.classId} IN (SELECT id FROM class WHERE organization_id = ${organizationId})`);

  // class_schedule_exception references class_schedule_instance.
  await db.delete(classScheduleExceptionSchema).where(sql`${classScheduleExceptionSchema.classScheduleInstanceId} IN (SELECT csi.id FROM class_schedule_instance csi JOIN class c ON csi.class_id = c.id WHERE c.organization_id = ${organizationId})`);

  // 2) Now safe to clear the schedule instances and event sessions/billings.
  await db.delete(classScheduleInstanceSchema).where(sql`${classScheduleInstanceSchema.classId} IN (SELECT id FROM class WHERE organization_id = ${organizationId})`);
  await db.delete(classInstructorSchema).where(sql`${classInstructorSchema.classId} IN (SELECT id FROM class WHERE organization_id = ${organizationId})`);
  await db.delete(classTagSchema).where(sql`${classTagSchema.classId} IN (SELECT id FROM class WHERE organization_id = ${organizationId})`);
  await db.delete(eventSessionSchema).where(sql`${eventSessionSchema.eventId} IN (SELECT id FROM event WHERE organization_id = ${organizationId})`);
  await db.delete(eventBillingSchema).where(sql`${eventBillingSchema.eventId} IN (SELECT id FROM event WHERE organization_id = ${organizationId})`);
  await db.delete(eventInstructorSchema).where(sql`${eventInstructorSchema.eventId} IN (SELECT id FROM event WHERE organization_id = ${organizationId})`);
  await db.delete(eventTagSchema).where(sql`${eventTagSchema.eventId} IN (SELECT id FROM event WHERE organization_id = ${organizationId})`);

  // 3) Member-side: coupon_usage and family_member reference member; clear
  // them before clearing members.
  await db.delete(couponUsageSchema).where(sql`${couponUsageSchema.memberId} IN (SELECT id FROM member WHERE organization_id = ${organizationId})`);
  await db.delete(familyMemberSchema).where(sql`${familyMemberSchema.memberId} IN (SELECT id FROM member WHERE organization_id = ${organizationId})`);

  // 4) Membership plans, tags, and members.
  await db.delete(membershipTagSchema).where(sql`${membershipTagSchema.membershipPlanId} IN (SELECT id FROM membership_plan WHERE organization_id = ${organizationId})`);
  await db.delete(memberMembershipSchema).where(sql`${memberMembershipSchema.memberId} IN (SELECT id FROM member WHERE organization_id = ${organizationId})`);
  await db.delete(addressSchema).where(sql`${addressSchema.memberId} IN (SELECT id FROM member WHERE organization_id = ${organizationId})`);
  await db.delete(noteSchema).where(sql`${noteSchema.memberId} IN (SELECT id FROM member WHERE organization_id = ${organizationId})`);
  await db.delete(classSchema).where(eq(classSchema.organizationId, organizationId));
  await db.delete(eventSchema).where(eq(eventSchema.organizationId, organizationId));
  await db.delete(memberSchema).where(eq(memberSchema.organizationId, organizationId));
  await db.delete(membershipPlanSchema).where(eq(membershipPlanSchema.organizationId, organizationId));
  await db.delete(couponSchema).where(eq(couponSchema.organizationId, organizationId));
  await db.delete(tagSchema).where(eq(tagSchema.organizationId, organizationId));
  await db.delete(programSchema).where(eq(programSchema.organizationId, organizationId));
}

async function seedOrganization(organizationId: string) {
  console.info(`\n📦 Seeding organization: ${organizationId}`);

  if (shouldReset) {
    await clearSeededData(organizationId);
  }

  // Anchor all relative dates to a single instant so a re-seed always
  // produces dates that are coherent with "today" — not stale 2025/2026
  // literals. Every event date, schedule exception, member join date, etc.
  // is computed off these helpers.
  const seedNow = new Date();
  const daysFromNow = (days: number, hours = 10, minutes = 0): Date => {
    const d = new Date(seedNow);
    d.setDate(d.getDate() + days);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };
  const monthsFromNow = (months: number): Date => {
    const d = new Date(seedNow);
    d.setMonth(d.getMonth() + months);
    return d;
  };

  // 1. Seed Programs
  console.info('  📚 Seeding programs...');
  const programIdMap: Record<string, string> = {};
  for (const program of programsData) {
    const id = randomUUID();
    programIdMap[program.slug] = id;
    await db.insert(programSchema).values({
      id,
      organizationId,
      ...program,
    }).onConflictDoNothing();
  }

  // 2. Seed Tags
  console.info('  🏷️  Seeding tags...');
  const tagIdMap: Record<string, string> = {};
  const allTags = [...classTagsData, ...membershipTagsData];
  for (const tag of allTags) {
    const id = randomUUID();
    tagIdMap[`${tag.entityType}-${tag.slug}`] = id;
    await db.insert(tagSchema).values({
      id,
      organizationId,
      name: tag.name,
      slug: tag.slug,
      color: tag.color,
      entityType: tag.entityType,
    }).onConflictDoNothing();
  }

  // 3. Seed Classes
  console.info('  🥋 Seeding classes...');
  const classIdMap: Record<string, string> = {};
  for (const classData of classesData) {
    const id = randomUUID();
    classIdMap[classData.slug] = id;
    const programId = programIdMap[classData.programSlug];

    await db.insert(classSchema).values({
      id,
      organizationId,
      programId,
      name: classData.name,
      slug: classData.slug,
      description: classData.description,
      color: classData.color,
      defaultDurationMinutes: classData.defaultDurationMinutes,
      minAge: classData.minAge,
      maxAge: classData.maxAge,
      allowWalkIns: 'allowWalkIns' in classData ? classData.allowWalkIns : 'Yes',
    }).onConflictDoNothing();

    // Link tags to class
    for (const tagSlug of classData.tags) {
      const tagId = tagIdMap[`class-${tagSlug}`];
      if (tagId) {
        await db.insert(classTagSchema).values({
          classId: id,
          tagId,
        }).onConflictDoNothing();
      }
    }

    // Create schedule instances
    const scheduleInstanceIds: string[] = [];
    for (const schedule of classData.schedule) {
      const scheduleId = randomUUID();
      scheduleInstanceIds.push(scheduleId);
      await db.insert(classScheduleInstanceSchema).values({
        id: scheduleId,
        classId: id,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      }).onConflictDoNothing();
    }

    // Create schedule exceptions for this class
    const classExceptions = scheduleExceptionsData.filter(e => e.classSlug === classData.slug);
    for (const exception of classExceptions) {
      // Use the first schedule instance for this class (simplified - in production would match by day)
      const scheduleInstanceId = scheduleInstanceIds[0];
      if (scheduleInstanceId) {
        await db.insert(classScheduleExceptionSchema).values({
          id: randomUUID(),
          classScheduleInstanceId: scheduleInstanceId,
          exceptionDate: daysFromNow(exception.daysFromNow),
          exceptionType: exception.exceptionType,
          newStartTime: exception.newStartTime,
          newEndTime: exception.newEndTime,
          newInstructorClerkId: exception.newInstructorClerkId,
          reason: exception.reason,
        }).onConflictDoNothing();
      }
    }
  }

  // 4. Seed Events
  console.info('  🎪 Seeding events...');
  const eventIdMap: Record<string, string> = {};
  const eventBillingIdMap: Record<string, string[]> = {};
  for (const eventData of eventsData) {
    const eventId = randomUUID();
    eventIdMap[eventData.slug] = eventId;
    eventBillingIdMap[eventData.slug] = [];
    await db.insert(eventSchema).values({
      id: eventId,
      organizationId,
      name: eventData.name,
      slug: eventData.slug,
      description: eventData.description,
      eventType: eventData.eventType,
      maxCapacity: eventData.maxCapacity,
    }).onConflictDoNothing();

    // Create event sessions — each session date is the event's anchor + dayOffset.
    for (const session of eventData.sessions) {
      await db.insert(eventSessionSchema).values({
        id: randomUUID(),
        eventId,
        sessionDate: daysFromNow(eventData.anchorDaysFromNow + session.dayOffset),
        startTime: session.startTime,
        endTime: session.endTime,
      }).onConflictDoNothing();
    }

    // Create event pricing
    for (const pricing of eventData.pricing) {
      const billingId = randomUUID();
      eventBillingIdMap[eventData.slug]!.push(billingId);
      await db.insert(eventBillingSchema).values({
        id: billingId,
        eventId,
        name: pricing.name,
        price: pricing.price,
        memberOnly: pricing.memberOnly ?? false,
        validUntil: pricing.validUntilDaysFromAnchor !== undefined
          ? daysFromNow(eventData.anchorDaysFromNow + pricing.validUntilDaysFromAnchor)
          : null,
      }).onConflictDoNothing();
    }
  }

  // 5. Seed Coupons
  console.info('  🎫 Seeding coupons...');
  for (const coupon of couponsData) {
    await db.insert(couponSchema).values({
      id: randomUUID(),
      organizationId,
      code: coupon.code,
      name: coupon.name,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      applicableTo: coupon.applicableTo,
      usageLimit: coupon.usageLimit,
      status: coupon.status,
    }).onConflictDoNothing();
  }

  // 6. Seed Membership Plans
  console.info('  💳 Seeding membership plans...');
  const membershipPlanIdMap: Record<string, string> = {};
  for (const plan of membershipPlansData) {
    const id = randomUUID();
    membershipPlanIdMap[plan.slug] = id;
    await db.insert(membershipPlanSchema).values({
      id,
      organizationId,
      programId: programIdMap[plan.programSlug] ?? null,
      name: plan.name,
      slug: plan.slug,
      category: plan.category,
      program: plan.program,
      price: plan.price,
      signupFee: plan.signupFee,
      cancellationFee: plan.cancellationFee,
      holdFeeAmount: plan.holdFeeAmount,
      holdFeeFrequency: plan.holdFeeFrequency,
      holdLimitPerYear: plan.holdLimitPerYear,
      frequency: plan.frequency,
      contractLength: plan.contractLength,
      accessLevel: plan.accessLevel,
      description: plan.description,
      isActive: true,
      isTrial: plan.isTrial,
    }).onConflictDoNothing();
  }

  // 7. Seed Members + member_memberships
  //
  // Each member gets a synthetic iqproCustomerId so vaulted-charge code paths
  // that read it don't break in local/preview. Status maps directly to
  // member.status, while member_membership.status mirrors it (with cancelled
  // memberships getting an endDate and hold members getting an
  // iqproHoldFeeSubscriptionId when their plan has a recurring hold fee).
  console.info('  👥 Seeding members...');
  const memberIds: string[] = [];
  const memberJoinDates: Date[] = []; // index-aligned with membersData
  const memberMembershipIdByIndex: (string | null)[] = []; // null = no membership

  for (let i = 0; i < membersData.length; i++) {
    const member = membersData[i]!;
    const id = randomUUID();
    memberIds.push(id);

    // joinDate is "N months ago" from seedNow.
    const joinDate = monthsFromNow(-member.joinedMonthsAgo);
    memberJoinDates.push(joinDate);

    // Compute statusChangedAt for non-active statuses so the timeline UI has
    // a real date to show.
    const statusChangedAt = member.lifecycleEventMonthsAgo !== undefined
      ? monthsFromNow(-member.lifecycleEventMonthsAgo)
      : null;

    await db.insert(memberSchema).values({
      id,
      organizationId,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      dateOfBirth: member.dateOfBirth ? new Date(member.dateOfBirth) : null,
      status: member.status,
      statusChangedAt,
      memberType: member.memberType,
      iqproCustomerId: `seed_cus_${randomUUID()}`,
      clerkUserId: null,
    }).onConflictDoNothing();

    // Assign a membership for every member that has a planSlug. Trial =
    // one-time, everything else = autopay. Status on the membership row
    // mirrors the member's lifecycle (active / hold / cancelled). past_due
    // gets an active membership row — the payment failures are tracked via
    // the transaction table, not the membership status.
    if (member.planSlug) {
      const plan = membershipPlansData.find(p => p.slug === member.planSlug);
      const planId = membershipPlanIdMap[member.planSlug];
      if (planId && plan) {
        const isTrial = plan.isTrial;
        const isAutopay = !isTrial && plan.frequency !== null;
        const membershipStatus = member.status === 'cancelled'
          ? 'cancelled'
          : member.status === 'hold' ? 'hold' : 'active';
        // Recurring hold fee → seed an iqproHoldFeeSubscriptionId on hold
        // members whose plan has a recurring hold-fee cadence.
        const hasRecurringHoldFee = member.status === 'hold'
          && plan.holdFeeAmount > 0
          && plan.holdFeeFrequency !== null
          && plan.holdFeeFrequency !== 'one-time';

        const mmId = randomUUID();
        memberMembershipIdByIndex.push(mmId);
        await db.insert(memberMembershipSchema).values({
          id: mmId,
          memberId: id,
          membershipPlanId: planId,
          status: membershipStatus,
          billingType: isAutopay ? 'autopay' : 'one-time',
          startDate: joinDate,
          endDate: member.status === 'cancelled' && statusChangedAt ? statusChangedAt : null,
          iqproSubscriptionId: isAutopay ? `seed_sub_${randomUUID()}` : null,
          iqproHoldFeeSubscriptionId: hasRecurringHoldFee ? `seed_hold_${randomUUID()}` : null,
        }).onConflictDoNothing();
      } else {
        memberMembershipIdByIndex.push(null);
      }
    } else {
      memberMembershipIdByIndex.push(null);
    }
  }

  // 7b. Family relationships — link HOH ↔ family members bidirectionally so
  // the HOH detail page shows family members and family-member detail pages
  // resolve back to the HOH. Indexes refer to membersData.
  console.info('  👨‍👩‍👧 Seeding family relationships...');
  const familyLinks: Array<{ hohIdx: number; memberIdx: number; relationshipHohToMember: string; relationshipMemberToHoh: string }> = [
    // Alex (idx 6) → Noah, Olivia (children), Maria (spouse)
    { hohIdx: 6, memberIdx: 8, relationshipHohToMember: 'parent', relationshipMemberToHoh: 'child' },
    { hohIdx: 6, memberIdx: 9, relationshipHohToMember: 'parent', relationshipMemberToHoh: 'child' },
    { hohIdx: 6, memberIdx: 10, relationshipHohToMember: 'spouse', relationshipMemberToHoh: 'spouse' },
    // Isabella (idx 7) → Ethan, Liam (children)
    { hohIdx: 7, memberIdx: 11, relationshipHohToMember: 'parent', relationshipMemberToHoh: 'child' },
    { hohIdx: 7, memberIdx: 12, relationshipHohToMember: 'parent', relationshipMemberToHoh: 'child' },
  ];
  let familyLinkCount = 0;
  for (const link of familyLinks) {
    const hohId = memberIds[link.hohIdx]!;
    const memberId = memberIds[link.memberIdx]!;
    await db.insert(familyMemberSchema).values({
      memberId: hohId,
      relatedMemberId: memberId,
      relationship: link.relationshipHohToMember,
    }).onConflictDoNothing();
    await db.insert(familyMemberSchema).values({
      memberId,
      relatedMemberId: hohId,
      relationship: link.relationshipMemberToHoh,
    }).onConflictDoNothing();
    familyLinkCount += 2;
  }

  // 8. Seed Catalog Categories
  console.info('  🏷️  Seeding catalog categories...');
  const categoryIdMap: Record<string, string> = {};
  for (const category of catalogCategoriesData) {
    const id = randomUUID();
    categoryIdMap[category.slug] = id;
    await db.insert(catalogCategorySchema).values({
      id,
      organizationId,
      name: category.name,
      slug: category.slug,
      description: category.description,
    }).onConflictDoNothing();
  }

  // 9. Seed Catalog Items with Sizes and Images
  console.info('  📦 Seeding catalog items...');

  for (const item of catalogItemsData) {
    const itemId = randomUUID();

    await db.insert(catalogItemSchema).values({
      id: itemId,
      organizationId,
      type: item.type,
      name: item.name,
      slug: item.slug,
      description: item.description,
      shortDescription: item.shortDescription,
      sku: item.sku,
      basePrice: item.basePrice,
      compareAtPrice: item.compareAtPrice,
      eventId: item.eventSlug ? eventIdMap[item.eventSlug] : null,
      maxPerOrder: item.maxPerOrder,
      trackInventory: item.trackInventory,
      lowStockThreshold: item.lowStockThreshold,
      isFeatured: item.isFeatured,
    }).onConflictDoNothing();

    // Link item to categories
    for (const catSlug of item.categories) {
      const catId = categoryIdMap[catSlug];
      if (catId) {
        await db.insert(catalogItemCategorySchema).values({
          catalogItemId: itemId,
          categoryId: catId,
        }).onConflictDoNothing();
      }
    }

    // Create variants with stock
    for (const [i, variant] of item.variants.entries()) {
      await db.insert(catalogItemVariantSchema).values({
        id: randomUUID(),
        catalogItemId: itemId,
        name: variant.name,
        price: variant.price,
        stockQuantity: variant.stockQuantity,
        sortOrder: i,
      }).onConflictDoNothing();
    }

    // Create primary image
    if (item.imageUrl) {
      await db.insert(catalogItemImageSchema).values({
        id: randomUUID(),
        catalogItemId: itemId,
        url: item.imageUrl,
        thumbnailUrl: item.imageUrl.replace('600x600', '200x200'),
        altText: item.name,
        isPrimary: true,
        sortOrder: 0,
      }).onConflictDoNothing();
    }
  }

  // 10. Seed Waiver Templates
  console.info('  📜 Seeding waiver templates...');
  const waiverIdMap: Record<string, string> = {};
  for (const waiver of waiverTemplatesData) {
    const id = randomUUID();
    waiverIdMap[waiver.slug] = id;
    await db.insert(waiverTemplateSchema).values({
      id,
      organizationId,
      name: waiver.name,
      slug: waiver.slug,
      version: waiver.version,
      content: waiver.content,
      description: waiver.description,
      isActive: waiver.isActive,
      isDefault: waiver.isDefault,
      requiresGuardian: waiver.requiresGuardian,
      guardianAgeThreshold: waiver.guardianAgeThreshold,
    }).onConflictDoNothing();

    // Link waiver to membership plans
    for (const membershipSlug of waiver.membershipSlugs) {
      const membershipPlanId = membershipPlanIdMap[membershipSlug];
      const waiverTemplateId = waiverIdMap[waiver.slug];
      if (membershipPlanId && waiverTemplateId) {
        await db.insert(membershipWaiverSchema).values({
          membershipPlanId,
          waiverTemplateId,
          isRequired: true,
          sortOrder: 0,
        }).onConflictDoNothing();
      }
    }
  }

  // 11. Seed Signed Waivers for every member with a membership.
  //
  // The waiver template matches the plan (kids → kids waiver, trial → trial
  // waiver, everything else → standard adult). Each row includes the full
  // membership-plan snapshot (price, frequency, signup fee, contract length,
  // isTrial) and is linked to the actual member_membership row. A couple of
  // members get a coupon snapshot too so the legal-snapshot UI has signal.
  console.info('  ✍️  Seeding signed waivers...');
  const placeholderSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Map plan-slug → waiver-template-slug. Plans not in the map fall back to
  // the default waiver (set by isDefault in waiverTemplatesData).
  const planToWaiverSlug: Record<string, string> = {
    'kids-monthly': 'kids-program-waiver',
    'kids-annual': 'kids-program-waiver',
    '7-day-trial': 'free-trial-waiver',
  };
  const defaultWaiverSlug = waiverTemplatesData.find(w => w.isDefault)?.slug ?? 'standard-adult-waiver';

  // Coupon snapshots stamped on a couple of members for legal-record variety.
  const couponSnapshots: Record<number, { code: string; type: string; amount: string; discountedPrice: number }> = {
    1: { code: 'NEWSTUDENT50', type: 'Fixed Amount', amount: '$50', discountedPrice: 129 }, // Sarah, $179 - $50
    6: { code: 'CTA_FAMILY_1', type: 'Percentage', amount: '15%', discountedPrice: 254.15 }, // Alex (HOH), $299 * 0.85
  };

  let signedWaiverCount = 0;
  for (let i = 0; i < membersData.length; i++) {
    const member = membersData[i]!;
    const memberId = memberIds[i]!;
    const mmId = memberMembershipIdByIndex[i];
    if (!mmId || !member.planSlug) {
      continue;
    }
    const plan = membershipPlansData.find(p => p.slug === member.planSlug);
    if (!plan) {
      continue;
    }
    const waiverSlug = planToWaiverSlug[member.planSlug] ?? defaultWaiverSlug;
    const waiver = waiverTemplatesData.find(w => w.slug === waiverSlug);
    const waiverTemplateId = waiverIdMap[waiverSlug];
    if (!waiver || !waiverTemplateId) {
      continue;
    }

    // Render placeholders with the default merge-field values.
    const renderedContent = waiver.content
      .replace(/<academy>/g, 'Your Academy')
      .replace(/<academy_owners>/g, 'Academy Owners');

    const dob = member.dateOfBirth ? new Date(member.dateOfBirth) : null;
    const signingDate = memberJoinDates[i]!;
    let ageAtSigning: number | null = null;
    if (dob) {
      ageAtSigning = signingDate.getFullYear() - dob.getFullYear();
      const monthDiff = signingDate.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && signingDate.getDate() < dob.getDate())) {
        ageAtSigning--;
      }
    }
    const isMinor = ageAtSigning !== null && ageAtSigning < waiver.guardianAgeThreshold;
    const coupon = couponSnapshots[i];

    await db.insert(signedWaiverSchema).values({
      id: randomUUID(),
      organizationId,
      waiverTemplateId,
      waiverTemplateVersion: waiver.version,
      memberId,
      memberMembershipId: mmId,
      // Plan snapshot — what the member legally signed up for.
      membershipPlanName: plan.name,
      membershipPlanPrice: plan.price,
      membershipPlanFrequency: plan.frequency,
      membershipPlanContractLength: plan.contractLength,
      membershipPlanSignupFee: plan.signupFee,
      membershipPlanIsTrial: plan.isTrial,
      // Coupon snapshot (when applicable).
      couponCode: coupon?.code ?? null,
      couponType: coupon?.type ?? null,
      couponAmount: coupon?.amount ?? null,
      couponDiscountedPrice: coupon?.discountedPrice ?? null,
      signatureDataUrl: placeholderSignature,
      signedByName: isMinor ? `Guardian of ${member.firstName}` : `${member.firstName} ${member.lastName}`,
      signedByEmail: member.email,
      signedByRelationship: isMinor ? 'parent' : null,
      // Minors sign alongside the guardian (#268).
      memberSignatureDataUrl: isMinor ? placeholderSignature : null,
      memberSignedByName: isMinor ? `${member.firstName} ${member.lastName}` : null,
      memberFirstName: member.firstName,
      memberLastName: member.lastName,
      memberEmail: member.email,
      memberDateOfBirth: dob,
      memberAgeAtSigning: ageAtSigning,
      renderedContent,
      ipAddress: '127.0.0.1',
      userAgent: 'seed-script',
      signedAt: signingDate,
    }).onConflictDoNothing();

    signedWaiverCount++;
  }

  // 12. Seed Waiver Merge Fields
  console.info('  🔖 Seeding waiver merge fields...');
  const mergeFieldsData = [
    { key: 'academy', label: 'Academy Name', defaultValue: 'Your Academy', description: 'The name of your martial arts academy' },
    { key: 'academy_owners', label: 'Academy Owners', defaultValue: 'Academy Owners', description: 'Names of the academy owner(s)' },
  ];
  for (const field of mergeFieldsData) {
    await db.insert(waiverMergeFieldSchema).values({
      id: randomUUID(),
      organizationId,
      key: field.key,
      label: field.label,
      defaultValue: field.defaultValue,
      description: field.description,
    }).onConflictDoNothing();
  }

  // 13. Seed Payment Methods
  //
  // One PM per member with a synthetic iqproPaymentMethodId so the vaulted-
  // charge code paths have something to find. Last4 is a stable per-member
  // value used in transaction descriptions below. Family members share a
  // last4 with their HOH (since real-world they're billed to HOH's card).
  console.info('  💳 Seeding payment methods...');
  const last4ByIndex = ['4242', '5678', '1111', '3456', '7890', '2222', '9999', '8888', '9999', '9999', '9999', '8888', '8888', '4111'];
  const pmTypeByIndex: Array<'card' | 'bank_transfer'> = ['card', 'card', 'card', 'card', 'card', 'card', 'card', 'card', 'card', 'card', 'card', 'card', 'card', 'bank_transfer'];
  let paymentMethodCount = 0;
  for (let i = 0; i < membersData.length; i++) {
    const memberId = memberIds[i]!;
    const type = pmTypeByIndex[i] ?? 'card';
    const last4 = last4ByIndex[i] ?? '0000';
    const isCard = type === 'card';
    await db.insert(paymentMethodSchema).values({
      id: randomUUID(),
      memberId,
      type,
      // Cards store a BIN (first 6) for the BIN(6)+last4 masked display; the
      // bank_transfer member stores a Checking/Savings account type + last4.
      firstSix: isCard ? '424242' : null,
      last4,
      accountType: isCard ? null : 'Checking',
      iqproPaymentMethodId: `seed_pm_${randomUUID()}`,
      isDefault: true,
    }).onConflictDoNothing();
    paymentMethodCount++;
  }

  // 14. Update member_membership payment dates + member createdAt.
  //
  // The membership row was created in §7 with startDate set; here we compute
  // firstPaymentDate + nextPaymentDate using the plan's actual frequency
  // (weekly / monthly / semi-annual / annual / null). Active members with a
  // recurring plan get nextPaymentDate projected into the future; trial /
  // punchcard / cancelled / hold members get null.
  console.info('  📅 Updating membership dates...');

  // Helper: starting from joinDate, advance by one billing cycle at a time
  // until the next payment lands in the future. Mirrors what a real autopay
  // subscription's nextPaymentDate would be after months/years of charges.
  const projectNextPaymentDate = (joinDate: Date, planSlug: string): Date | null => {
    const plan = membershipPlansData.find(p => p.slug === planSlug);
    const frequency = normalizeFrequency(plan?.frequency ?? null);
    if (frequency === null) {
      return null;
    }
    let cursor = new Date(joinDate);
    // Cap iterations defensively (e.g. annual plan joined decades ago would
    // still terminate, but we don't want a runaway loop).
    for (let i = 0; i < 1000; i++) {
      cursor = computeNextPaymentDate(cursor, frequency);
      if (cursor > seedNow) {
        return cursor;
      }
    }
    return cursor;
  };

  for (let i = 0; i < membersData.length; i++) {
    const member = membersData[i]!;
    const memberId = memberIds[i]!;
    const joinDate = memberJoinDates[i]!;
    const mmId = memberMembershipIdByIndex[i];

    if (mmId && member.planSlug) {
      const plan = membershipPlansData.find(p => p.slug === member.planSlug);
      // Only project a next payment for currently-billing memberships.
      const billing = member.status === 'active' && plan?.frequency !== null && !plan?.isTrial
        ? projectNextPaymentDate(joinDate, member.planSlug)
        : null;

      await db.update(memberMembershipSchema)
        .set({
          firstPaymentDate: joinDate,
          nextPaymentDate: billing,
        })
        .where(eq(memberMembershipSchema.id, mmId));
    }

    await db.update(memberSchema)
      .set({ createdAt: joinDate })
      .where(eq(memberSchema.id, memberId));
  }

  // 14b. Seed Notes (1-3 per member, dated within their tenure)
  console.info('  📝 Seeding notes...');
  const noteTemplates = [
    'Welcome call completed. Member is excited to start training.',
    'Member requested schedule of upcoming seminars. Sent via email.',
    'Updated emergency contact information at member request.',
    'Discussed progression timeline with member. Ready for intermediate class next month.',
    'Member paused membership for two weeks due to travel. Resumed on return.',
    'Reviewed billing details with member; no changes needed.',
  ];
  const noteAuthors = [
    { id: 'seed-author-frontdesk', name: 'Front Desk' },
    { id: 'seed-author-instructor', name: 'Lead Instructor' },
    { id: 'seed-author-owner', name: 'Academy Owner' },
  ];
  for (let i = 0; i < memberIds.length; i++) {
    const memberId = memberIds[i]!;
    const joinDate = memberJoinDates[i] ?? new Date();
    const noteCount = (i % 3) + 1; // 1, 2, or 3 notes per member
    for (let n = 0; n < noteCount; n++) {
      const template = noteTemplates[(i + n) % noteTemplates.length]!;
      const author = noteAuthors[(i + n) % noteAuthors.length]!;
      const createdAt = new Date(joinDate.getTime() + (n + 1) * 14 * 24 * 60 * 60 * 1000); // +14 days each
      await db.insert(noteSchema).values({
        id: randomUUID(),
        memberId,
        content: template,
        status: 'active',
        createdByUserId: author.id,
        createdByName: author.name,
        createdAt,
        updatedAt: createdAt,
      }).onConflictDoNothing();
    }
  }

  // 15. Seed Transactions
  console.info('  💰 Seeding transactions...');
  let transactionCount = 0;

  // Helper to create a transaction. Accepts an optional iqproTransactionId
  // so the first-charge signup_fee + membership_payment rows can be linked
  // (mirrors the wizard, which writes one IQPro Sale → two local rows).
  async function createTransaction(values: {
    organizationId: string;
    memberId: string;
    memberMembershipId?: string;
    eventRegistrationId?: string;
    iqproTransactionId?: string;
    transactionType: string;
    amount: number;
    status: string;
    paymentMethod: string;
    description: string;
    createdAt: Date;
    processedAt?: Date;
  }) {
    await db.insert(transactionSchema).values({
      id: randomUUID(),
      organizationId: values.organizationId,
      memberId: values.memberId,
      memberMembershipId: values.memberMembershipId ?? null,
      eventRegistrationId: values.eventRegistrationId ?? null,
      iqproTransactionId: values.iqproTransactionId ?? null,
      transactionType: values.transactionType,
      amount: values.amount,
      currency: 'USD',
      status: values.status,
      paymentMethod: values.paymentMethod,
      description: values.description,
      createdAt: values.createdAt,
      processedAt: values.processedAt ?? null,
    }).onConflictDoNothing();
    transactionCount++;
  }

  // Derive transaction config from the member seed. Each member with a
  // recurring plan gets monthly-payment rows from joinDate to either today
  // or their lifecycleEventMonthsAgo (for cancelled members). past_due
  // members get 2 trailing failedMonths so the dashboard reflects the
  // status. Trial / punchcard / one-time-pay members get no recurring
  // payment rows — just the signup_fee (or nothing for trial).
  type MemberTxConfig = {
    index: number;
    planSlug: string;
    price: number;
    signupFee: number;
    startMonth: Date;
    endMonth: Date | null;
    paymentMethod: 'card' | 'bank_transfer' | 'cash';
    last4: string;
    failedMonths?: Date[];
  };

  const memberTxConfigs: MemberTxConfig[] = membersData
    .map((m, idx): MemberTxConfig | null => {
      if (!m.planSlug) {
        return null;
      }
      const plan = membershipPlansData.find(p => p.slug === m.planSlug);
      if (!plan) {
        return null;
      }
      const startMonth = memberJoinDates[idx]!;
      let endMonth: Date | null = null;
      if (m.status === 'cancelled' && m.lifecycleEventMonthsAgo !== undefined) {
        endMonth = monthsFromNow(-m.lifecycleEventMonthsAgo);
      } else if (m.status === 'hold' && m.lifecycleEventMonthsAgo !== undefined) {
        // Hold members stop receiving membership_payment rows at hold time.
        endMonth = monthsFromNow(-m.lifecycleEventMonthsAgo);
      } else if (plan.isTrial) {
        // Trial — 7 days then ends.
        endMonth = new Date(startMonth);
        endMonth.setDate(endMonth.getDate() + 7);
      }
      const failedMonths = m.status === 'past_due'
        ? [monthsFromNow(-1), monthsFromNow(0)]
        : undefined;
      return {
        index: idx,
        planSlug: m.planSlug,
        price: plan.price,
        signupFee: plan.signupFee,
        startMonth,
        endMonth,
        paymentMethod: pmTypeByIndex[idx] === 'bank_transfer' ? 'bank_transfer' : 'card',
        last4: last4ByIndex[idx] ?? '',
        failedMonths,
      };
    })
    .filter((c): c is MemberTxConfig => c !== null);

  // Generate membership payment transactions. The first charge (signup fee +
  // first month's membership payment) shares ONE iqproTransactionId — mirrors
  // the wizard's "one IQPro Sale → two local tx rows" pattern. Each subsequent
  // recurring cycle gets its own iqproTransactionId.
  for (const config of memberTxConfigs) {
    const memberId = memberIds[config.index]!;
    const mmId = memberMembershipIdByIndex[config.index] ?? undefined;

    // Synthetic IQPro transaction id for the first-charge Sale that bundles
    // signup fee + first month. Same id on both rows; null when there's no
    // signup fee or no first-month charge (trial).
    const firstChargeIqproId = `seed_tx_${randomUUID()}`;

    // Signup fee (row 1 of the first-charge pair)
    if (config.signupFee > 0) {
      const joinDate = memberJoinDates[config.index]!;
      await createTransaction({
        organizationId,
        memberId,
        memberMembershipId: mmId,
        iqproTransactionId: firstChargeIqproId,
        transactionType: 'signup_fee',
        amount: config.signupFee,
        status: 'paid',
        paymentMethod: config.paymentMethod,
        description: config.last4 ? `Signup fee - Card ending ${config.last4}` : 'Signup fee - Bank transfer',
        createdAt: joinDate,
        processedAt: joinDate,
      });
    }

    // Skip monthly payments for trial members
    if (config.price === 0) {
      continue;
    }

    // Monthly membership payments
    const startMonth = new Date(config.startMonth);
    const endDate = config.endMonth || seedNow;
    const totalMonths = (endDate.getFullYear() - startMonth.getFullYear()) * 12 + (endDate.getMonth() - startMonth.getMonth()) + 1;

    for (let mi = 0; mi < totalMonths; mi++) {
      const paymentDate = new Date(startMonth);
      paymentDate.setMonth(paymentDate.getMonth() + mi);

      // Determine status
      let status = 'paid';
      let processedAt: Date | undefined = new Date(paymentDate);
      processedAt.setDate(processedAt.getDate() + 1);

      // Check if this is a failed month
      if (config.failedMonths) {
        const isFailed = config.failedMonths.some(fm =>
          fm.getFullYear() === paymentDate.getFullYear() && fm.getMonth() === paymentDate.getMonth(),
        );
        if (isFailed) {
          status = 'declined';
          processedAt = undefined;
        }
      }

      const desc = config.last4
        ? `Monthly membership - Card ending ${config.last4}`
        : 'Monthly membership - Bank transfer';

      // First month: row 2 of the first-charge pair — shares the signup
      // fee's iqproTransactionId. Subsequent months: each cycle is its own
      // IQPro Sale, so each gets a fresh synthetic id.
      const iqproTransactionId = mi === 0
        ? firstChargeIqproId
        : `seed_tx_${randomUUID()}`;

      await createTransaction({
        organizationId,
        memberId,
        memberMembershipId: mmId,
        iqproTransactionId,
        transactionType: 'membership_payment',
        amount: config.price,
        status,
        paymentMethod: config.paymentMethod,
        description: desc,
        createdAt: new Date(paymentDate),
        processedAt: status === 'paid' ? processedAt : undefined,
      });
    }
  }

  // Event registration transactions. Dates expressed as days-from-now so
  // they stay fresh on re-seed. Mix of future events (signups happening now
  // for upcoming events) and the past event (historical attendance).
  type EventTxRow = {
    memberIndex: number;
    eventSlug: string;
    billingIndex: number;
    amount: number;
    daysFromNow: number;
    method: 'card' | 'bank_transfer' | 'cash';
    desc: string;
    status: string;
  };
  const eventTxData: EventTxRow[] = [
    // Upcoming fundamentals seminar — recent signups by active members.
    { memberIndex: 0, eventSlug: 'bjj-fundamentals-seminar', billingIndex: 0, amount: 149.99, daysFromNow: -10, method: 'card', desc: 'BJJ Fundamentals Seminar - Card ending 4242', status: 'paid' },
    { memberIndex: 1, eventSlug: 'bjj-fundamentals-seminar', billingIndex: 0, amount: 149.99, daysFromNow: -8, method: 'card', desc: 'BJJ Fundamentals Seminar - Card ending 5678', status: 'paid' },
    { memberIndex: 3, eventSlug: 'bjj-fundamentals-seminar', billingIndex: 1, amount: 199.99, daysFromNow: -5, method: 'card', desc: 'BJJ Fundamentals Seminar - Card ending 3456', status: 'paid' },
    { memberIndex: 6, eventSlug: 'bjj-fundamentals-seminar', billingIndex: 0, amount: 149.99, daysFromNow: -7, method: 'card', desc: 'BJJ Fundamentals Seminar - Card ending 9999', status: 'paid' },
    // Master Rodriguez workshop signups.
    { memberIndex: 0, eventSlug: 'master-rodriguez-workshop', billingIndex: 0, amount: 60, daysFromNow: -3, method: 'card', desc: 'Master Rodriguez Workshop - Card ending 4242', status: 'paid' },
    { memberIndex: 1, eventSlug: 'master-rodriguez-workshop', billingIndex: 0, amount: 60, daysFromNow: -2, method: 'card', desc: 'Master Rodriguez Workshop - Card ending 5678', status: 'paid' },
    { memberIndex: 3, eventSlug: 'master-rodriguez-workshop', billingIndex: 0, amount: 60, daysFromNow: -4, method: 'cash', desc: 'Master Rodriguez Workshop - Cash', status: 'paid' },
    { memberIndex: 6, eventSlug: 'master-rodriguez-workshop', billingIndex: 0, amount: 60, daysFromNow: -1, method: 'card', desc: 'Master Rodriguez Workshop - Card ending 9999', status: 'pending' },
    { memberIndex: 7, eventSlug: 'master-rodriguez-workshop', billingIndex: 1, amount: 75, daysFromNow: 0, method: 'bank_transfer', desc: 'Master Rodriguez Workshop - Bank transfer', status: 'processing' },
    // Refunded registration on the cancelled member.
    { memberIndex: 4, eventSlug: 'bjj-fundamentals-seminar', billingIndex: 0, amount: 149.99, daysFromNow: -45, method: 'card', desc: 'BJJ Fundamentals Seminar - Card ending 7890', status: 'refunded' },
    // Past women's self-defense workshop — historical signups for the −12-week event.
    { memberIndex: 1, eventSlug: 'womens-self-defense-past', billingIndex: 0, amount: 0, daysFromNow: -95, method: 'card', desc: 'Women\'s Self-Defense Workshop - Member', status: 'paid' },
    { memberIndex: 10, eventSlug: 'womens-self-defense-past', billingIndex: 0, amount: 0, daysFromNow: -92, method: 'card', desc: 'Women\'s Self-Defense Workshop - Member', status: 'paid' },
    { memberIndex: 13, eventSlug: 'womens-self-defense-past', billingIndex: 1, amount: 40, daysFromNow: -90, method: 'card', desc: 'Women\'s Self-Defense Workshop - Non-member', status: 'paid' },
  ];

  for (const tx of eventTxData) {
    const memberId = memberIds[tx.memberIndex]!;
    const eventId = eventIdMap[tx.eventSlug];
    const billingIds = eventBillingIdMap[tx.eventSlug];
    if (!eventId || !billingIds) {
      continue;
    }
    const billingId = billingIds[tx.billingIndex];
    const txDate = daysFromNow(tx.daysFromNow);

    const registrationId = randomUUID();
    const regStatus = tx.status === 'refunded' ? 'cancelled' : 'registered';
    await db.insert(eventRegistrationSchema).values({
      id: registrationId,
      memberId,
      eventId,
      eventBillingId: billingId ?? null,
      status: regStatus,
      amountPaid: tx.amount,
      registeredAt: txDate,
      cancelledAt: tx.status === 'refunded' ? daysFromNow(tx.daysFromNow + 7) : null,
    }).onConflictDoNothing();

    await createTransaction({
      organizationId,
      memberId,
      eventRegistrationId: registrationId,
      transactionType: 'event_registration',
      amount: tx.amount,
      status: tx.status,
      paymentMethod: tx.method,
      description: tx.desc,
      createdAt: txDate,
      processedAt: tx.status === 'paid' ? daysFromNow(tx.daysFromNow + 1) : undefined,
    });
  }

  // Refund transactions (independent of event refunds above).
  const refundTxData = [
    { memberIndex: 4, amount: -179, daysFromNow: -60, method: 'card', desc: 'Membership refund - Card ending 7890' },
    { memberIndex: 0, amount: -75, daysFromNow: -120, method: 'card', desc: 'Event refund - Card ending 4242' },
    { memberIndex: 3, amount: -149, daysFromNow: -45, method: 'card', desc: 'Membership overpayment refund - Card ending 3456' },
  ];

  for (const tx of refundTxData) {
    const memberId = memberIds[tx.memberIndex]!;
    const txDate = daysFromNow(tx.daysFromNow);
    await createTransaction({
      organizationId,
      memberId,
      transactionType: 'refund',
      amount: tx.amount,
      status: 'paid',
      paymentMethod: tx.method,
      description: tx.desc,
      createdAt: txDate,
      processedAt: daysFromNow(tx.daysFromNow + 1),
    });
  }

  // Adjustment transactions.
  const adjustmentTxData = [
    { memberIndex: 5, amount: -25, daysFromNow: -150, method: 'card', desc: 'Loyalty discount adjustment' },
    { memberIndex: 0, amount: 15, daysFromNow: -90, method: 'card', desc: 'Late fee adjustment' },
    { memberIndex: 7, amount: -10, daysFromNow: -30, method: 'bank_transfer', desc: 'Promo credit adjustment' },
  ];

  for (const tx of adjustmentTxData) {
    const memberId = memberIds[tx.memberIndex]!;
    const txDate = daysFromNow(tx.daysFromNow);
    await createTransaction({
      organizationId,
      memberId,
      transactionType: 'adjustment',
      amount: tx.amount,
      status: 'paid',
      paymentMethod: tx.method,
      description: tx.desc,
      createdAt: txDate,
      processedAt: txDate,
    });
  }

  // Lifecycle-fee transactions. Mirror the same shape the real Cancel /
  // Hold endpoints produce: cancellation_fee tied to the cancelled member,
  // hold_fee tied to held members (one-time for kids plan, recurring monthly
  // rows for the adult-12-month plan with monthly hold-fee).
  for (let i = 0; i < membersData.length; i++) {
    const m = membersData[i]!;
    if (!m.planSlug || m.lifecycleEventMonthsAgo === undefined) {
      continue;
    }
    const plan = membershipPlansData.find(p => p.slug === m.planSlug);
    if (!plan) {
      continue;
    }
    const memberId = memberIds[i]!;
    const mmId = memberMembershipIdByIndex[i] ?? undefined;
    const eventDate = monthsFromNow(-m.lifecycleEventMonthsAgo);
    const last4 = last4ByIndex[i] ?? '';
    const method = pmTypeByIndex[i] === 'bank_transfer' ? 'bank_transfer' : 'card';
    const last4Suffix = method === 'card' ? `Card ending ${last4}` : 'Bank transfer';

    if (m.status === 'cancelled' && plan.cancellationFee > 0) {
      await createTransaction({
        organizationId,
        memberId,
        memberMembershipId: mmId,
        iqproTransactionId: `seed_tx_${randomUUID()}`,
        transactionType: 'cancellation_fee',
        amount: plan.cancellationFee,
        status: 'paid',
        paymentMethod: method,
        description: `Cancellation fee (${plan.name}) - ${last4Suffix}`,
        createdAt: eventDate,
        processedAt: eventDate,
      });
    }

    if (m.status === 'hold' && plan.holdFeeAmount > 0) {
      if (plan.holdFeeFrequency === 'one-time') {
        await createTransaction({
          organizationId,
          memberId,
          memberMembershipId: mmId,
          iqproTransactionId: `seed_tx_${randomUUID()}`,
          transactionType: 'hold_fee',
          amount: plan.holdFeeAmount,
          status: 'paid',
          paymentMethod: method,
          description: `Hold fee (${plan.name}) - ${last4Suffix}`,
          createdAt: eventDate,
          processedAt: eventDate,
        });
      } else if (plan.holdFeeFrequency === 'Monthly') {
        // One row per month the member has been on hold (capped at 12).
        const monthsHeld = Math.min(12, m.lifecycleEventMonthsAgo);
        for (let h = 0; h < monthsHeld; h++) {
          const holdMonth = monthsFromNow(-m.lifecycleEventMonthsAgo + h);
          await createTransaction({
            organizationId,
            memberId,
            memberMembershipId: mmId,
            iqproTransactionId: `seed_tx_${randomUUID()}`,
            transactionType: 'hold_fee',
            amount: plan.holdFeeAmount,
            status: 'paid',
            paymentMethod: method,
            description: `Recurring hold fee (${plan.name}) - ${last4Suffix}`,
            createdAt: holdMonth,
            processedAt: holdMonth,
          });
        }
      }
    }
  }

  // 15b. Lifecycle audit events. The hold-limit check in
  // MemberPaymentService.holdMembershipLifecycle reads from audit_event with
  // action='memberMembership.hold' + entityId=memberMembershipId + status=
  // 'success' over the trailing 12 months. Without these rows, the limit
  // check has nothing to count against. We also write member.create rows
  // for every seeded member so the audit-log report screen has signal.
  console.info('  📓 Seeding lifecycle audit events...');
  let auditEventCount = 0;
  const writeAudit = async (values: {
    userId?: string;
    action: string;
    entityType: string;
    entityId: string | null;
    timestamp: Date;
  }) => {
    await db.insert(auditEventSchema).values({
      id: randomUUID(),
      organizationId,
      userId: values.userId ?? 'seed-system',
      action: values.action,
      entityType: values.entityType,
      entityId: values.entityId,
      role: 'org:admin',
      status: 'success',
      changes: null,
      error: null,
      ipAddress: '127.0.0.1',
      userAgent: 'seed-script',
      requestId: null,
      timestamp: values.timestamp,
    }).onConflictDoNothing();
    auditEventCount++;
  };

  for (let i = 0; i < membersData.length; i++) {
    const m = membersData[i]!;
    const memberId = memberIds[i]!;
    const joinDate = memberJoinDates[i]!;
    const mmId = memberMembershipIdByIndex[i] ?? null;

    // member.create on every member at their join date.
    await writeAudit({
      action: 'member.create',
      entityType: 'member',
      entityId: memberId,
      timestamp: joinDate,
    });

    // Hold / cancel lifecycle events on the matching members.
    if (m.lifecycleEventMonthsAgo !== undefined && mmId) {
      const eventDate = monthsFromNow(-m.lifecycleEventMonthsAgo);
      const plan = m.planSlug ? membershipPlansData.find(p => p.slug === m.planSlug) : null;

      if (m.status === 'hold') {
        await writeAudit({
          action: 'memberMembership.hold',
          entityType: 'membership',
          entityId: mmId,
          timestamp: eventDate,
        });
        if (plan && plan.holdFeeAmount > 0) {
          await writeAudit({
            action: 'holdFee.charge',
            entityType: 'membership',
            entityId: mmId,
            timestamp: eventDate,
          });
        }
      }

      if (m.status === 'cancelled') {
        await writeAudit({
          action: 'memberMembership.cancel',
          entityType: 'membership',
          entityId: mmId,
          timestamp: eventDate,
        });
        if (plan && plan.cancellationFee > 0) {
          await writeAudit({
            action: 'cancellationFee.charge',
            entityType: 'membership',
            entityId: mmId,
            timestamp: eventDate,
          });
        }
      }
    }
  }

  // Give John (idx 0, on 12-month-gold which has holdLimitPerYear=2) one
  // prior memberMembership.hold audit row from 4 months ago so testers can
  // verify the hold-limit check by holding him a second time (allowed) and
  // a third time (should fail). Limit is checked against his current mmId.
  const johnMmId = memberMembershipIdByIndex[0];
  if (johnMmId) {
    await writeAudit({
      action: 'memberMembership.hold',
      entityType: 'membership',
      entityId: johnMmId,
      timestamp: monthsFromNow(-4),
    });
  }

  // 16. Seed Attendance Records.
  //
  // Spread realistic attendance across the last 8 weeks for active / trial /
  // hold members. Cancelled and past_due get a handful of historical rows so
  // their per-member attendance tab isn't empty either. Records include
  // checkOutTime (class end), checkedInByClerkId (front desk for manual,
  // null for kiosk), instructorClerkId rotated round-robin, and a short
  // note on ~20% of rows.
  console.info('  📋 Seeding attendance records...');
  let attendanceCount = 0;

  // Re-query the class schedule instances for this org so we know the day-
  // of-week and end time for each (used to compute attendanceDate +
  // checkOutTime).
  const orgScheduleInstances = await db
    .select({
      id: classScheduleInstanceSchema.id,
      classId: classScheduleInstanceSchema.classId,
      dayOfWeek: classScheduleInstanceSchema.dayOfWeek,
      startTime: classScheduleInstanceSchema.startTime,
      endTime: classScheduleInstanceSchema.endTime,
    })
    .from(classScheduleInstanceSchema)
    .innerJoin(classSchema, eq(classScheduleInstanceSchema.classId, classSchema.id))
    .where(eq(classSchema.organizationId, organizationId));

  const attendanceNotes = [
    'Great class — worked on guard passes.',
    'Tweaked left knee during sparring; cleared to roll next week.',
    'New stripe earned today.',
    'Stayed late for open mat.',
  ];
  const instructors = ['seed-instructor-1', 'seed-instructor-2', 'seed-instructor-3'];

  if (orgScheduleInstances.length > 0) {
    const today = new Date(seedNow);
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < memberIds.length; i++) {
      const member = membersData[i]!;
      const memberId = memberIds[i]!;

      // Active / trial / hold get a healthy 6-15 rows over 8 weeks.
      // Cancelled / past_due get 2-3 rows so their history isn't empty.
      let rowCount: number;
      let maxDaysBack: number;
      if (member.status === 'active' || member.status === 'trial' || member.status === 'hold') {
        rowCount = 6 + (i % 10); // 6..15
        maxDaysBack = 56; // 8 weeks
      } else {
        rowCount = 2 + (i % 2); // 2..3
        maxDaysBack = 120;
      }

      for (let n = 0; n < rowCount; n++) {
        const instance = orgScheduleInstances[(i * 7 + n) % orgScheduleInstances.length]!;
        const daysBack = ((i * 3 + n * 5) % maxDaysBack) + 1;
        const attendanceDate = new Date(today);
        attendanceDate.setDate(attendanceDate.getDate() - daysBack);
        // Nudge to the schedule's day-of-week so the row lines up with a real session.
        const dayDelta = (attendanceDate.getDay() - instance.dayOfWeek + 7) % 7;
        attendanceDate.setDate(attendanceDate.getDate() - dayDelta);

        // Set the check-in time to the class start time.
        const [startH = '0', startM = '0'] = instance.startTime.split(':');
        const [endH = '0', endM = '0'] = instance.endTime.split(':');
        const checkInTime = new Date(attendanceDate);
        checkInTime.setHours(Number.parseInt(startH, 10), Number.parseInt(startM, 10), 0, 0);
        const checkOutTime = new Date(attendanceDate);
        checkOutTime.setHours(Number.parseInt(endH, 10), Number.parseInt(endM, 10), 0, 0);

        const checkInMethod = n % 4 === 0 ? 'kiosk' : 'manual';
        const includeNote = (i + n) % 5 === 0;

        await db.insert(attendanceSchema).values({
          id: randomUUID(),
          organizationId,
          memberId,
          classScheduleInstanceId: instance.id,
          attendanceDate,
          checkInTime,
          checkOutTime,
          checkInMethod,
          checkedInByClerkId: checkInMethod === 'manual' ? 'seed-frontdesk' : null,
          instructorClerkId: instructors[(i + n) % instructors.length]!,
          notes: includeNote ? attendanceNotes[(i + n) % attendanceNotes.length]! : null,
        }).onConflictDoNothing();
        attendanceCount++;
      }
    }
  }

  console.info(`  ✅ Seeded ${programsData.length} programs, ${allTags.length} tags, ${classesData.length} classes, ${eventsData.length} events, ${couponsData.length} coupons, ${membershipPlansData.length} membership plans, ${membersData.length} members, ${familyLinkCount} family-member links, ${catalogCategoriesData.length} catalog categories, ${catalogItemsData.length} catalog items, ${waiverTemplatesData.length} waiver templates, ${signedWaiverCount} signed waivers, ${mergeFieldsData.length} merge fields, ${paymentMethodCount} payment methods, ${transactionCount} transactions, ${auditEventCount} audit events, ${attendanceCount} attendance records`);
}

/**
 * Provisions an active SaaS subscription on the org so the dashboard
 * owner-aware access gate doesn't lock out a freshly-seeded org.
 *
 * Attempts REAL provisioning (real IQPro customer + subscription + Clerk owner
 * lookup) when platform IQPro creds resolve and an academy_owner exists.
 * Otherwise writes synthetic IDs + a synthetic responsible owner so the gate
 * passes locally. The org row must already exist (subscribe() does an UPDATE).
 */
// Real provisioning needs platform IQPro creds + Clerk. We detect these from
// raw process.env (NOT @/libs/Env) so the synthetic local path stays free of
// the app's strict env validation — importing the SaaS services (which pull in
// @/libs/Env) only happens when these are present.
function hasRealSaasPrereqs(): boolean {
  return Boolean(
    process.env.CLERK_SECRET_KEY
    && (process.env.IQPRO_CLIENT_ID || process.env.IQPRO_SAAS_CLIENT_ID)
    && process.env.IQPRO_SCOPE
    && process.env.IQPRO_OAUTH_URL
    && process.env.IQPRO_BASE_URL,
  );
}

async function provisionSaasSubscription(orgId: string): Promise<void> {
  if (skipSaas) {
    console.info('  ⏭️  Skipping SaaS subscription (--skipSaas)');
    return;
  }

  // Try real provisioning only when the prerequisite env is present. The
  // SaaS-service imports are lazy so the common synthetic path doesn't require
  // full app env validation.
  if (hasRealSaasPrereqs()) {
    try {
      const { resolvePlatformIQProConfig } = await import('../services/IQProConfigService');
      const { getAcademyOwner } = await import('../services/ClerkRolesService');
      const { subscribe } = await import('../services/SaasSubscriptionService');

      const platformConfig = await resolvePlatformIQProConfig().catch(() => null);
      if (!platformConfig) {
        console.info('  ℹ️  Platform IQPro config did not resolve; using synthetic SaaS subscription');
      } else {
        const owner = await getAcademyOwner(orgId);
        if (!owner) {
          console.info('  ⚠️  No academy_owner found in Clerk; falling back to synthetic SaaS subscription');
        } else {
          const result = await subscribe(platformConfig, {
            orgId,
            orgName: saasOrgName ?? `Seed Org ${orgId.slice(-6)}`,
            adminEmail: owner.email || saasEmail || `seed+${orgId}@dojoplanner.test`,
            responsibleClerkUserId: owner.clerkUserId,
            planId: saasPlan,
            billingCycle: saasCycle,
            cardNumber: saasCard,
            cardExpiry: saasExpiry,
          });
          if (result.success) {
            console.info(`  💳 Provisioned REAL SaaS subscription (owner ${owner.clerkUserId})`);
            return;
          }
          console.info(`  ⚠️  Real SaaS provisioning failed (${result.error}); falling back to synthetic`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.info(`  ⚠️  Real SaaS provisioning errored (${message}); falling back to synthetic`);
    }
  } else {
    console.info('  ℹ️  Platform IQPro creds not available; using synthetic SaaS subscription');
  }

  // Synthetic fallback. We do NOT fabricate a paid subscription: there is no
  // real IQPro customer/subscription/payment method behind a seeded org, so
  // pretending it's `active` (with fake IQPro IDs) would let change/cancel
  // masquerade as real billing. Instead we seed an honest, time-boxed `trial`
  // (which the access gate counts as active) with null IQPro IDs. A trial is
  // NOT tied to a plan — `iqproSubscriptionPlanId`/`iqproBillingCycle` stay null
  // so the dialog shows every plan as a fresh "Subscribe" rather than implying
  // a chosen plan. The only way to get a real `active` paid subscription is the
  // card-collecting subscribe flow. Period end is one month out, in
  // MILLISECONDS to match subscribe() and the IQPro webhook (and the expiry
  // backstop in hasActiveSubscription).
  const trialEnd = Date.now() + 30 * 24 * 60 * 60 * 1000;
  await db.update(organizationSchema)
    .set({
      stripeSubscriptionStatus: null,
      iqproSubscriptionId: null,
      iqproSubscriptionPlanId: null,
      iqproSubscriptionStatus: 'trial',
      iqproBillingCycle: null,
      iqproCurrentPeriodEnd: trialEnd,
      iqproCustomerId: null,
      iqproPaymentMethodId: null,
      iqproSaasResponsibleClerkUserId: ownerClerkIdArg ?? `seed_owner_user_${randomUUID()}`,
    })
    .where(eq(organizationSchema.id, orgId));
  console.info('  💳 Wrote synthetic SaaS trial (plan-agnostic, no real IQPro payment; subscribe via the app for a real paid plan)');
}

async function main() {
  console.info('🌱 Dojo Planner Database Seed Script');
  console.info('====================================\n');

  try {
    // Get organizations to seed
    let organizations: { id: string }[];

    if (specificOrgId) {
      // Ensure the org row exists (org is managed by Clerk, we just need the ID).
      // subscribe() does an UPDATE, so the row must pre-exist for real
      // provisioning; provisionSaasSubscription handles the SaaS fields.
      const org = await db.select({ id: organizationSchema.id }).from(organizationSchema).where(eq(organizationSchema.id, specificOrgId));
      if (org.length === 0) {
        console.info(`  📝 Creating organization record for ${specificOrgId}...`);
        await db.insert(organizationSchema).values({ id: specificOrgId }).onConflictDoNothing();
      }
      await provisionSaasSubscription(specificOrgId);
      organizations = [{ id: specificOrgId }];
    } else {
      // Get all organizations
      organizations = await db.select({ id: organizationSchema.id }).from(organizationSchema);
      if (organizations.length === 0) {
        console.info('⚠️  No organizations found in database.');
        console.info('');
        console.info('   To seed your Clerk organizations, run with --orgId:');
        console.info('');
        console.info('   DATABASE_URL="..." npx tsx src/scripts/seed.ts --orgId=org_xxxxx');
        console.info('');
        console.info('   How to find your organization ID:');
        console.info('   1. Go to Clerk Dashboard → Organizations');
        console.info('   2. Click on an organization');
        console.info('   3. Copy the Organization ID (starts with "org_")');
        console.info('');
        console.info('   Or, sign into the app and the organization will sync automatically');
        console.info('   when you visit /dashboard and select an organization.');
        process.exit(0);
      }
    }

    console.info(`Found ${organizations.length} organization(s) to seed.\n`);

    for (const org of organizations) {
      await seedOrganization(org.id);
    }

    console.info('\n✅ Seed completed successfully!');
    console.info('\n📋 Next steps:');
    console.info('   1. Run `npm run db:studio` to view seeded data');
    console.info('   2. Create staff users in Clerk dashboard for instructor assignments');
    console.info('   3. Optionally create Clerk accounts for sample members (for kiosk testing)');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
