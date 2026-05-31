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
 */

import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import {
  addressSchema,
  attendanceSchema,
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
    tags: ['advanced', 'competition', 'gi'],
    schedule: [
      { dayOfWeek: 1, startTime: '20:00', endTime: '21:00' }, // Monday 8 PM
      { dayOfWeek: 3, startTime: '20:00', endTime: '21:00' }, // Wednesday 8 PM
      { dayOfWeek: 5, startTime: '20:00', endTime: '21:00' }, // Friday 8 PM
    ],
  },
];

// Event pricing type
type EventPricing = {
  name: string;
  price: number;
  memberOnly?: boolean;
  validUntil?: string;
};

// Events data
const eventsData: Array<{
  name: string;
  slug: string;
  description: string;
  eventType: string;
  maxCapacity?: number;
  sessions: Array<{ date: string; startTime: string; endTime: string }>;
  pricing: EventPricing[];
}> = [
  {
    name: 'BJJ Fundamentals Seminar Series',
    slug: 'bjj-fundamentals-seminar-2026',
    description: 'A comprehensive 3-day seminar covering essential BJJ fundamentals with world-class instruction.',
    eventType: 'seminar',
    sessions: [
      { date: '2026-01-15', startTime: '10:00', endTime: '13:00' },
      { date: '2026-01-15', startTime: '15:00', endTime: '18:00' },
      { date: '2026-01-16', startTime: '10:00', endTime: '13:00' },
      { date: '2026-01-16', startTime: '15:00', endTime: '18:00' },
      { date: '2026-01-17', startTime: '10:00', endTime: '13:00' },
    ],
    pricing: [
      { name: 'Early Bird', price: 149.99, validUntil: '2026-01-01' },
      { name: 'Regular', price: 199.99 },
    ],
  },
  {
    name: 'Guest Instructor: Master Rodriguez',
    slug: 'master-rodriguez-seminar-2026',
    description: 'One-day exclusive training session with IBJJF World Champion.',
    eventType: 'workshop',
    maxCapacity: 40,
    sessions: [
      { date: '2026-02-08', startTime: '11:00', endTime: '14:00' },
    ],
    pricing: [
      { name: 'Member Price', price: 60, memberOnly: true },
      { name: 'Non-Member', price: 75 },
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

// Members data (from MemberCard.stories.tsx)
const membersData = [
  { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '+1234567890', dateOfBirth: '1990-01-15', status: 'active', memberType: 'individual' },
  { firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.johnson@example.com', phone: '+1987654321', dateOfBirth: '1985-03-22', status: 'active', memberType: 'individual' },
  { firstName: 'Mike', lastName: 'Rodriguez', email: 'mike.rodriguez@example.com', phone: '+1555123456', dateOfBirth: '1992-07-10', status: 'trial', memberType: 'individual' },
  { firstName: 'Emma', lastName: 'Wilson', email: 'emma.wilson@example.com', phone: null, dateOfBirth: '1995-11-03', status: 'active', memberType: 'individual' },
  { firstName: 'David', lastName: 'Brown', email: 'david.brown@example.com', phone: '+1777888999', dateOfBirth: '1988-09-18', status: 'cancelled', memberType: 'individual' },
  { firstName: 'Lisa', lastName: 'Martinez', email: 'lisa.martinez@example.com', phone: '+1444555666', dateOfBirth: '1991-12-07', status: 'past_due', memberType: 'individual' },
  { firstName: 'Alex', lastName: 'Thompson', email: 'alex.thompson@example.com', phone: '+1222333444', dateOfBirth: '1993-04-25', status: 'active', memberType: 'individual' },
  { firstName: 'Isabella', lastName: 'Chen', email: 'isabella.chen@example.com', phone: '+1666777888', dateOfBirth: '1987-08-12', status: 'active', memberType: 'individual' },
];

// Schedule exceptions data
const scheduleExceptionsData = [
  {
    classSlug: 'bjj-fundamentals-i',
    exceptionDate: '2025-09-15', // Monday
    exceptionType: 'modified',
    newInstructorClerkId: null,
    reason: 'Coach Alex out sick - Professor Jessica substituting',
  },
  {
    classSlug: 'bjj-fundamentals-i',
    exceptionDate: '2025-09-17', // Wednesday
    exceptionType: 'cancelled',
    reason: 'Gym closed for maintenance',
  },
  {
    classSlug: 'competition-team',
    exceptionDate: '2025-09-15', // Monday
    exceptionType: 'modified',
    newStartTime: '19:30',
    newEndTime: '20:30',
    reason: 'Earlier start time this week',
  },
  {
    classSlug: 'bjj-intermediate',
    exceptionDate: '2025-09-17', // Wednesday
    exceptionType: 'modified',
    newStartTime: '19:30',
    newEndTime: '20:30',
    reason: 'Permanent time change',
  },
];

// Membership plans
// `frequency` is null for one-time / non-recurring plans (punchcards, free trials).
// For recurring plans it is one of: 'Weekly' | 'Monthly' | 'Semi-Annual' | 'Annual'.
const membershipPlansData: Array<{
  name: string;
  slug: string;
  category: string;
  program: string;
  programSlug: string;
  price: number;
  signupFee: number;
  frequency: string | null;
  contractLength: string;
  accessLevel: string;
  isTrial: boolean;
}> = [
  { name: '12 Month Commitment (Gold)', slug: '12-month-gold', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 149, signupFee: 99, frequency: 'Monthly', contractLength: '12 Months', accessLevel: 'Unlimited', isTrial: false },
  { name: 'Month to Month (Gold)', slug: 'month-to-month-gold', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 179, signupFee: 99, frequency: 'Monthly', contractLength: 'Month-to-Month', accessLevel: 'Unlimited', isTrial: false },
  { name: '7-Day Free Trial', slug: '7-day-trial', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 0, signupFee: 0, frequency: null, contractLength: '7 Days', accessLevel: 'Unlimited', isTrial: true },
  { name: 'Kids Monthly', slug: 'kids-monthly', category: 'Kids Brazilian Jiu-Jitsu', program: 'Kids', programSlug: 'kids-program', price: 99, signupFee: 50, frequency: 'Monthly', contractLength: 'Month-to-Month', accessLevel: 'Kids Classes', isTrial: false },
  { name: 'Competition Team', slug: 'competition-team', category: 'Competition', program: 'Competition', programSlug: 'competition-team', price: 199, signupFee: 0, frequency: 'Monthly', contractLength: 'Month-to-Month', accessLevel: 'Unlimited + Comp Classes', isTrial: false },
  { name: '10-Class Punch Card', slug: '10-class-punchcard', category: 'Adult Brazilian Jiu-Jitsu', program: 'Adult', programSlug: 'adult-bjj', price: 200, signupFee: 0, frequency: null, contractLength: 'N/A', accessLevel: '10 Classes', isTrial: false },
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
    eventSlug: 'bjj-fundamentals-seminar-2026',
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
    eventSlug: 'master-rodriguez-seminar-2026',
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
          exceptionDate: new Date(exception.exceptionDate),
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

    // Create event sessions
    for (const session of eventData.sessions) {
      await db.insert(eventSessionSchema).values({
        id: randomUUID(),
        eventId,
        sessionDate: new Date(session.date),
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
        validUntil: pricing.validUntil ? new Date(pricing.validUntil) : null,
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
      frequency: plan.frequency,
      contractLength: plan.contractLength,
      accessLevel: plan.accessLevel,
      isTrial: plan.isTrial,
    }).onConflictDoNothing();
  }

  // 7. Seed Members
  console.info('  👥 Seeding members...');
  const memberIds: string[] = [];
  for (const member of membersData) {
    const id = randomUUID();
    memberIds.push(id);
    await db.insert(memberSchema).values({
      id,
      organizationId,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      dateOfBirth: member.dateOfBirth ? new Date(member.dateOfBirth) : null,
      status: member.status,
      memberType: member.memberType,
      clerkUserId: null, // Members don't have Clerk accounts in seed data
    }).onConflictDoNothing();

    // Assign a membership plan to active/trial members
    if (member.status === 'active' || member.status === 'trial') {
      const planSlug = member.status === 'trial' ? '7-day-trial' : '12-month-gold';
      const planId = membershipPlanIdMap[planSlug];
      if (planId) {
        // Synthetic iqproSubscriptionId for autopay members so the cancel /
        // hold / reactivate lifecycle flows can be exercised in local dev
        // without a real IQPro sandbox call. Trial members are one-time —
        // no recurring subscription, so the field stays null.
        const isAutopay = member.status === 'active';
        await db.insert(memberMembershipSchema).values({
          id: randomUUID(),
          memberId: id,
          membershipPlanId: planId,
          status: 'active',
          billingType: member.status === 'trial' ? 'one-time' : 'autopay',
          startDate: new Date(),
          iqproSubscriptionId: isAutopay ? `seed_sub_${randomUUID()}` : null,
        }).onConflictDoNothing();
      }
    }
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

  // 11. Seed Signed Waivers for active/trial members
  console.info('  ✍️  Seeding signed waivers...');
  const defaultWaiver = waiverTemplatesData.find(w => w.isDefault);
  let signedWaiverCount = 0;
  if (defaultWaiver) {
    const defaultWaiverTemplateId = waiverIdMap[defaultWaiver.slug];
    // Resolve placeholders in waiver content using default merge field values
    const renderedContent = defaultWaiver.content
      .replace(/<academy>/g, 'Your Academy')
      .replace(/<academy_owners>/g, 'Academy Owners');

    // Minimal valid 1x1 transparent PNG as signature placeholder
    const placeholderSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    if (defaultWaiverTemplateId) {
      for (let i = 0; i < membersData.length; i++) {
        const member = membersData[i]!;
        const memberIdValue = memberIds[i]!;

        // Only create signed waivers for active/trial members (matches membership assignment logic)
        if (member.status !== 'active' && member.status !== 'trial') {
          continue;
        }

        const dob = member.dateOfBirth ? new Date(member.dateOfBirth) : null;
        const signingDate = new Date('2025-09-01');
        let ageAtSigning: number | null = null;
        if (dob) {
          ageAtSigning = signingDate.getFullYear() - dob.getFullYear();
          const monthDiff = signingDate.getMonth() - dob.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && signingDate.getDate() < dob.getDate())) {
            ageAtSigning--;
          }
        }

        const isMinor = ageAtSigning !== null && ageAtSigning < defaultWaiver.guardianAgeThreshold;

        await db.insert(signedWaiverSchema).values({
          id: randomUUID(),
          organizationId,
          waiverTemplateId: defaultWaiverTemplateId,
          waiverTemplateVersion: defaultWaiver.version,
          memberId: memberIdValue,
          memberMembershipId: null,
          signatureDataUrl: placeholderSignature,
          signedByName: isMinor ? `Guardian of ${member.firstName}` : `${member.firstName} ${member.lastName}`,
          signedByEmail: member.email,
          signedByRelationship: isMinor ? 'parent' : null,
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
    }
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
  console.info('  💳 Seeding payment methods...');
  const paymentMethodsData: Array<{ memberIndex: number; type: string; last4: string; isDefault: boolean }> = [
    { memberIndex: 0, type: 'card', last4: '4242', isDefault: true }, // John Doe
    { memberIndex: 1, type: 'card', last4: '5678', isDefault: true }, // Sarah Johnson
    { memberIndex: 2, type: 'card', last4: '1111', isDefault: true }, // Mike Rodriguez (trial)
    { memberIndex: 3, type: 'card', last4: '3456', isDefault: true }, // Emma Wilson
    { memberIndex: 4, type: 'card', last4: '7890', isDefault: true }, // David Brown (cancelled)
    { memberIndex: 5, type: 'card', last4: '2222', isDefault: true }, // Lisa Martinez (past_due)
    { memberIndex: 6, type: 'card', last4: '9999', isDefault: true }, // Alex Thompson
    { memberIndex: 7, type: 'card', last4: '8888', isDefault: true }, // Isabella Chen
  ];
  for (const pm of paymentMethodsData) {
    const memberId = memberIds[pm.memberIndex];
    if (memberId) {
      await db.insert(paymentMethodSchema).values({
        id: randomUUID(),
        memberId,
        type: pm.type,
        last4: pm.last4,
        isDefault: pm.isDefault,
      }).onConflictDoNothing();
    }
  }

  // 14. Update member_membership dates for realistic data
  console.info('  📅 Updating membership dates...');
  const memberJoinDates: Record<number, Date> = {
    0: new Date('2024-01-10'), // John Doe - joined Jan 2024
    1: new Date('2024-03-05'), // Sarah Johnson - joined Mar 2024
    2: new Date('2025-12-01'), // Mike Rodriguez - trial, recent
    3: new Date('2024-06-15'), // Emma Wilson - joined Jun 2024
    4: new Date('2024-02-20'), // David Brown - joined Feb 2024, cancelled Aug 2025
    5: new Date('2024-04-01'), // Lisa Martinez - joined Apr 2024, past_due
    6: new Date('2024-08-10'), // Alex Thompson - joined Aug 2024
    7: new Date('2024-05-20'), // Isabella Chen - joined May 2024
  };

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
    const now = new Date();
    // Cap iterations defensively (e.g. annual plan joined decades ago would
    // still terminate, but we don't want a runaway loop).
    for (let i = 0; i < 1000; i++) {
      cursor = computeNextPaymentDate(cursor, frequency);
      if (cursor > now) {
        return cursor;
      }
    }
    return cursor;
  };

  for (let i = 0; i < membersData.length; i++) {
    const member = membersData[i]!;
    const memberId = memberIds[i]!;
    const joinDate = memberJoinDates[i]!;

    if (member.status === 'active' || member.status === 'trial') {
      // Use the plan's actual frequency to compute the next payment date,
      // honoring weekly / monthly / semi-annual / annual cadences and
      // end-of-month clamping. Trial members get null (no recurring cycle).
      const planSlug = member.status === 'trial' ? '7-day-trial' : '12-month-gold';
      const nextPayment = member.status === 'trial' ? null : projectNextPaymentDate(joinDate, planSlug);

      await db.update(memberMembershipSchema)
        .set({
          startDate: joinDate,
          firstPaymentDate: joinDate,
          nextPaymentDate: nextPayment,
        })
        .where(eq(memberMembershipSchema.memberId, memberId));
    }

    // Update member createdAt to match join date
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

  // Get member_membership IDs for linking
  const memberMembershipIds: Record<string, string> = {};
  for (const memberId of memberIds) {
    const mm = await db.select({ id: memberMembershipSchema.id })
      .from(memberMembershipSchema)
      .where(eq(memberMembershipSchema.memberId, memberId));
    if (mm[0]) {
      memberMembershipIds[memberId] = mm[0].id;
    }
  }

  // Member data for transaction generation
  type MemberTxConfig = {
    index: number;
    planSlug: string;
    price: number;
    signupFee: number;
    startMonth: Date;
    endMonth: Date | null; // null = ongoing
    paymentMethod: string;
    last4: string;
    failedMonths?: Date[]; // months where payment declined
  };

  const now = new Date();
  const memberTxConfigs: MemberTxConfig[] = [
    { index: 0, planSlug: '12-month-gold', price: 149, signupFee: 99, startMonth: new Date('2024-01-15'), endMonth: null, paymentMethod: 'card', last4: '4242' },
    { index: 1, planSlug: '12-month-gold', price: 149, signupFee: 99, startMonth: new Date('2024-03-15'), endMonth: null, paymentMethod: 'card', last4: '5678' },
    { index: 2, planSlug: '7-day-trial', price: 0, signupFee: 0, startMonth: new Date('2025-12-01'), endMonth: new Date('2025-12-08'), paymentMethod: 'card', last4: '1111' },
    { index: 3, planSlug: '12-month-gold', price: 149, signupFee: 99, startMonth: new Date('2024-06-15'), endMonth: null, paymentMethod: 'card', last4: '3456' },
    { index: 4, planSlug: 'month-to-month-gold', price: 179, signupFee: 99, startMonth: new Date('2024-02-15'), endMonth: new Date('2025-08-15'), paymentMethod: 'card', last4: '7890' },
    { index: 5, planSlug: '12-month-gold', price: 149, signupFee: 99, startMonth: new Date('2024-04-15'), endMonth: null, paymentMethod: 'card', last4: '2222', failedMonths: [new Date('2025-12-15'), new Date('2026-01-15')] },
    { index: 6, planSlug: '12-month-gold', price: 149, signupFee: 99, startMonth: new Date('2024-08-15'), endMonth: null, paymentMethod: 'card', last4: '9999' },
    { index: 7, planSlug: '12-month-gold', price: 149, signupFee: 99, startMonth: new Date('2024-05-15'), endMonth: null, paymentMethod: 'bank_transfer', last4: '' },
  ];

  // Generate membership payment transactions. The first charge (signup fee +
  // first month's membership payment) shares ONE iqproTransactionId — mirrors
  // the wizard's "one IQPro Sale → two local tx rows" pattern. Each subsequent
  // recurring cycle gets its own iqproTransactionId.
  for (const config of memberTxConfigs) {
    const memberId = memberIds[config.index]!;
    const mmId = memberMembershipIds[memberId];

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
    const endDate = config.endMonth || now;
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

  // Event registration transactions
  const eventTxData = [
    { memberIndex: 0, eventSlug: 'bjj-fundamentals-seminar-2026', billingIndex: 0, amount: 149.99, date: new Date('2025-12-20'), method: 'card', desc: 'BJJ Fundamentals Seminar - Card ending 4242', status: 'paid' },
    { memberIndex: 1, eventSlug: 'bjj-fundamentals-seminar-2026', billingIndex: 0, amount: 149.99, date: new Date('2025-12-22'), method: 'card', desc: 'BJJ Fundamentals Seminar - Card ending 5678', status: 'paid' },
    { memberIndex: 3, eventSlug: 'bjj-fundamentals-seminar-2026', billingIndex: 1, amount: 199.99, date: new Date('2026-01-05'), method: 'card', desc: 'BJJ Fundamentals Seminar - Card ending 3456', status: 'paid' },
    { memberIndex: 6, eventSlug: 'bjj-fundamentals-seminar-2026', billingIndex: 0, amount: 149.99, date: new Date('2026-01-03'), method: 'card', desc: 'BJJ Fundamentals Seminar - Card ending 9999', status: 'paid' },
    { memberIndex: 0, eventSlug: 'master-rodriguez-seminar-2026', billingIndex: 0, amount: 60, date: new Date('2026-01-25'), method: 'card', desc: 'Master Rodriguez Workshop - Card ending 4242', status: 'paid' },
    { memberIndex: 1, eventSlug: 'master-rodriguez-seminar-2026', billingIndex: 0, amount: 60, date: new Date('2026-01-28'), method: 'card', desc: 'Master Rodriguez Workshop - Card ending 5678', status: 'paid' },
    { memberIndex: 3, eventSlug: 'master-rodriguez-seminar-2026', billingIndex: 0, amount: 60, date: new Date('2026-01-20'), method: 'cash', desc: 'Master Rodriguez Workshop - Cash', status: 'paid' },
    { memberIndex: 6, eventSlug: 'master-rodriguez-seminar-2026', billingIndex: 0, amount: 60, date: new Date('2026-01-22'), method: 'card', desc: 'Master Rodriguez Workshop - Card ending 9999', status: 'pending' },
    { memberIndex: 7, eventSlug: 'master-rodriguez-seminar-2026', billingIndex: 1, amount: 75, date: new Date('2026-02-01'), method: 'bank_transfer', desc: 'Master Rodriguez Workshop - Bank transfer', status: 'processing' },
    { memberIndex: 4, eventSlug: 'bjj-fundamentals-seminar-2026', billingIndex: 0, amount: 149.99, date: new Date('2025-06-10'), method: 'card', desc: 'BJJ Fundamentals Seminar - Card ending 7890', status: 'refunded' },
  ];

  for (const tx of eventTxData) {
    const memberId = memberIds[tx.memberIndex]!;
    const eventId = eventIdMap[tx.eventSlug]!;
    const billingIds = eventBillingIdMap[tx.eventSlug]!;
    const billingId = billingIds[tx.billingIndex];

    // Create event registration record
    const registrationId = randomUUID();
    const regStatus = tx.status === 'refunded' ? 'cancelled' : 'registered';
    await db.insert(eventRegistrationSchema).values({
      id: registrationId,
      memberId,
      eventId,
      eventBillingId: billingId ?? null,
      status: regStatus,
      amountPaid: tx.amount,
      registeredAt: tx.date,
      cancelledAt: tx.status === 'refunded' ? new Date(tx.date.getTime() + 86400000 * 7) : null,
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
      createdAt: tx.date,
      processedAt: tx.status === 'paid' ? new Date(tx.date.getTime() + 86400000) : undefined,
    });
  }

  // Refund transactions
  const refundTxData = [
    { memberIndex: 4, amount: -179, date: new Date('2025-09-01'), method: 'card', desc: 'Membership refund - Card ending 7890' },
    { memberIndex: 0, amount: -75, date: new Date('2025-07-05'), method: 'card', desc: 'Event refund - Card ending 4242' },
    { memberIndex: 3, amount: -149, date: new Date('2025-10-20'), method: 'card', desc: 'Membership overpayment refund - Card ending 3456' },
  ];

  for (const tx of refundTxData) {
    const memberId = memberIds[tx.memberIndex]!;
    await createTransaction({
      organizationId,
      memberId,
      transactionType: 'refund',
      amount: tx.amount,
      status: 'paid',
      paymentMethod: tx.method,
      description: tx.desc,
      createdAt: tx.date,
      processedAt: new Date(tx.date.getTime() + 86400000),
    });
  }

  // Adjustment transactions
  const adjustmentTxData = [
    { memberIndex: 5, amount: -25, date: new Date('2025-06-10'), method: 'card', desc: 'Loyalty discount adjustment' },
    { memberIndex: 0, amount: 15, date: new Date('2025-08-01'), method: 'card', desc: 'Late fee adjustment' },
    { memberIndex: 7, amount: -10, date: new Date('2025-11-15'), method: 'bank_transfer', desc: 'Promo credit adjustment' },
  ];

  for (const tx of adjustmentTxData) {
    const memberId = memberIds[tx.memberIndex]!;
    await createTransaction({
      organizationId,
      memberId,
      transactionType: 'adjustment',
      amount: tx.amount,
      status: 'paid',
      paymentMethod: tx.method,
      description: tx.desc,
      createdAt: tx.date,
      processedAt: tx.date,
    });
  }

  // 16. Seed Attendance Records
  // Spreads recent attendance across active/trial members, drawing from the
  // class schedule instances created above. Past_due / cancelled members get
  // no attendance (matches the signed-waiver seeding rule).
  console.info('  📋 Seeding attendance records...');
  let attendanceCount = 0;

  // Re-query the class schedule instances for this org since the IDs created
  // earlier in this function were captured in a per-class local array.
  const orgScheduleInstances = await db
    .select({
      id: classScheduleInstanceSchema.id,
      classId: classScheduleInstanceSchema.classId,
      dayOfWeek: classScheduleInstanceSchema.dayOfWeek,
    })
    .from(classScheduleInstanceSchema)
    .innerJoin(classSchema, eq(classScheduleInstanceSchema.classId, classSchema.id))
    .where(eq(classSchema.organizationId, organizationId));

  if (orgScheduleInstances.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < memberIds.length; i++) {
      const member = membersData[i]!;
      const memberId = memberIds[i]!;
      if (member.status !== 'active' && member.status !== 'trial') {
        continue;
      }

      // 3 to 8 attendance rows per active member, deterministically based on index.
      const rowCount = 3 + (i % 6);
      for (let n = 0; n < rowCount; n++) {
        const instance = orgScheduleInstances[(i * 7 + n) % orgScheduleInstances.length]!;
        // Pick a date in the recent past (1..60 days ago) on the schedule's day-of-week.
        const daysBack = ((i + n) % 60) + 1;
        const attendanceDate = new Date(today);
        attendanceDate.setDate(attendanceDate.getDate() - daysBack);
        // Nudge to the schedule instance's day-of-week so the row makes sense.
        const dayDelta = (attendanceDate.getDay() - instance.dayOfWeek + 7) % 7;
        attendanceDate.setDate(attendanceDate.getDate() - dayDelta);

        await db.insert(attendanceSchema).values({
          id: randomUUID(),
          organizationId,
          memberId,
          classScheduleInstanceId: instance.id,
          attendanceDate,
          checkInTime: attendanceDate,
          checkInMethod: n % 4 === 0 ? 'kiosk' : 'manual',
        }).onConflictDoNothing();
        attendanceCount++;
      }
    }
  }

  console.info(`  ✅ Seeded ${programsData.length} programs, ${allTags.length} tags, ${classesData.length} classes, ${eventsData.length} events, ${couponsData.length} coupons, ${membershipPlansData.length} membership plans, ${membersData.length} members, ${catalogCategoriesData.length} catalog categories, ${catalogItemsData.length} catalog items, ${waiverTemplatesData.length} waiver templates, ${signedWaiverCount} signed waivers, ${mergeFieldsData.length} merge fields, ${paymentMethodsData.length} payment methods, ${transactionCount} transactions, ${attendanceCount} attendance records`);
}

async function main() {
  console.info('🌱 Dojo Planner Database Seed Script');
  console.info('====================================\n');

  try {
    // Get organizations to seed
    let organizations: { id: string }[];

    if (specificOrgId) {
      // Check if org exists, create if not (org is managed by Clerk, we just need the ID)
      const org = await db.select({ id: organizationSchema.id }).from(organizationSchema).where(eq(organizationSchema.id, specificOrgId));
      if (org.length === 0) {
        console.info(`  📝 Creating organization record for ${specificOrgId}...`);
        await db.insert(organizationSchema).values({
          id: specificOrgId,
          stripeSubscriptionStatus: 'active',
        }).onConflictDoNothing();
      } else {
        // Ensure the org has an active subscription for development
        await db.update(organizationSchema)
          .set({ stripeSubscriptionStatus: 'active' })
          .where(eq(organizationSchema.id, specificOrgId));
      }
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
