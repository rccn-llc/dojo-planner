import { bigint, boolean, index, integer, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// This file defines the structure of your database tables using the Drizzle ORM.

// To modify the database schema:
// 1. Update this file with your desired changes.
// 2. Generate a new migration by running: `npm run db:generate`

// The generated migration file will reflect your schema changes.
// The migration is automatically applied during the Next.js initialization process through `instrumentation.ts`.
// Simply restart your Next.js server to apply the database changes.
// Alternatively, if your database is running, you can run `npm run db:migrate` and there is no need to restart the server.

// Need a database for production? Check out https://www.prisma.io/?via=nextjsboilerplate
// Tested and compatible with SaaS Boilerplate

// =============================================================================
// ORGANIZATION & FOUNDATION TABLES
// =============================================================================

export const organizationSchema = pgTable(
  'organization',
  {
    id: text('id').primaryKey(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripeSubscriptionPriceId: text('stripe_subscription_price_id'),
    stripeSubscriptionStatus: text('stripe_subscription_status'),
    stripeSubscriptionCurrentPeriodEnd: bigint(
      'stripe_subscription_current_period_end',
      { mode: 'number' },
    ),
    // IQPro SaaS subscription fields
    iqproCustomerId: text('iqpro_customer_id'),
    iqproSubscriptionId: text('iqpro_subscription_id'),
    iqproSubscriptionPlanId: text('iqpro_subscription_plan_id'),
    iqproBillingCycle: text('iqpro_billing_cycle'),
    iqproSubscriptionStatus: text('iqpro_subscription_status'),
    iqproCurrentPeriodEnd: bigint(
      'iqpro_current_period_end',
      { mode: 'number' },
    ),
    iqproPaymentMethodId: text('iqpro_payment_method_id'),
    locationAddress: text('location_address'),
    locationPhone: text('location_phone'),
    locationEmail: text('location_email'),
    locationTaxRate: real('location_tax_rate').default(0).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex('stripe_customer_id_idx').on(table.stripeCustomerId),
    uniqueIndex('iqpro_customer_id_idx').on(table.iqproCustomerId),
  ],
);

// Training programs (e.g., Adult BJJ, Kids, Competition)
export const programSchema = pgTable(
  'program',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(), // e.g., 'Adult BJJ', 'Kids Program'
    slug: text('slug').notNull(), // e.g., 'adult-bjj'
    description: text('description'),
    color: text('color'), // Hex color for UI display
    isActive: boolean('is_active').default(true),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('program_org_idx').on(table.organizationId),
    uniqueIndex('program_org_slug_idx').on(table.organizationId, table.slug),
  ],
);

// Polymorphic tags for classes, memberships, and events
export const tagSchema = pgTable(
  'tag',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    entityType: text('entity_type').notNull(), // 'class', 'membership', 'event'
    name: text('name').notNull(), // e.g., 'Beginner', 'Advanced', 'Gi', 'No-Gi'
    slug: text('slug').notNull(),
    color: text('color'), // Hex color for badge display
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('tag_org_entity_idx').on(table.organizationId, table.entityType),
    uniqueIndex('tag_org_entity_slug_idx').on(table.organizationId, table.entityType, table.slug),
  ],
);

// Cloud-stored images with thumbnail URLs (Vercel Blob)
export const imageSchema = pgTable(
  'image',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    entityType: text('entity_type').notNull(), // 'member', 'class', 'event', 'organization'
    entityId: text('entity_id').notNull(), // ID of related entity
    originalUrl: text('original_url').notNull(), // Full-size image URL
    thumbnailSmUrl: text('thumbnail_sm_url'), // 48px thumbnail (avatars in lists)
    thumbnailMdUrl: text('thumbnail_md_url'), // 200px thumbnail (cards)
    thumbnailLgUrl: text('thumbnail_lg_url'), // 400px thumbnail (detail views)
    mimeType: text('mime_type'), // 'image/jpeg', 'image/png', etc.
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    uploadedAt: timestamp('uploaded_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('image_entity_idx').on(table.entityType, table.entityId),
    index('image_org_idx').on(table.organizationId),
  ],
);

// SOC2 compliance audit logging
export const auditEventSchema = pgTable(
  'audit_event',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    userId: text('user_id').notNull(), // Clerk user ID - WHO
    action: text('action').notNull(), // e.g., 'member.create' - WHAT
    entityType: text('entity_type').notNull(), // e.g., 'member'
    entityId: text('entity_id'), // ID of affected entity - WHICH
    role: text('role'), // User's role at time of action
    status: text('status').notNull(), // 'success' or 'failure'
    changes: text('changes'), // JSON string of field changes
    error: text('error'), // Error message if status is 'failure'
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'), // For request tracing
    timestamp: timestamp('timestamp', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('audit_org_idx').on(table.organizationId),
    index('audit_user_idx').on(table.userId),
    index('audit_entity_idx').on(table.entityType, table.entityId),
    index('audit_timestamp_idx').on(table.timestamp),
  ],
);

// =============================================================================
// MEMBER TABLES
// =============================================================================

export const memberSchema = pgTable(
  'member',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    clerkUserId: text('clerk_user_id'), // Links to Clerk for kiosk auth (nullable for legacy members)
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    memberType: text('member_type'), // individual, family-member, head-of-household
    phone: text('phone'),
    dateOfBirth: timestamp('date_of_birth', { mode: 'date' }),
    photoUrl: text('photo_url'), // Legacy field - use imageId for new uploads
    imageId: text('image_id'), // FK to image table for profile photos
    lastAccessedAt: timestamp('last_accessed_at', { mode: 'date' })
      .$onUpdate(() => new Date()),
    status: text('status').notNull().default('active'), // active, hold, trial, cancelled, past_due
    statusChangedAt: timestamp('status_changed_at', { mode: 'date' }),
    iqproCustomerId: text('iqpro_customer_id'), // IQPro payment processor customer ID
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('member_org_idx').on(table.organizationId),
    index('member_org_status_idx').on(table.organizationId, table.status),
    index('member_org_email_idx').on(table.organizationId, table.email),
    uniqueIndex('member_clerk_user_idx').on(table.clerkUserId),
    uniqueIndex('member_iqpro_customer_idx').on(table.iqproCustomerId),
  ],
);

// Membership plans table - stores available membership types that can be created/edited/deleted
export const membershipPlanSchema = pgTable(
  'membership_plan',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    programId: text('program_id').references(() => programSchema.id), // FK to program
    name: text('name').notNull(), // e.g., '12 Month Commitment (Gold)'
    slug: text('slug').notNull(), // e.g., '12_month_commitment_gold' - used for identification
    category: text('category').notNull(), // e.g., 'Adult Brazilian Jiu-Jitsu'
    program: text('program').notNull(), // Legacy field - e.g., 'Adult', 'Kids', 'Competition'
    price: real('price').notNull().default(0), // Monthly price amount
    signupFee: real('signup_fee').notNull().default(0),
    frequency: text('frequency').notNull().default('Monthly'), // Monthly, Annual, None
    contractLength: text('contract_length').notNull(), // e.g., '12 Months', 'Month-to-Month', '7 Days'
    accessLevel: text('access_level').notNull(), // e.g., 'Unlimited', '8 Classes/mo'
    description: text('description'), // Short description of the plan
    isTrial: boolean('is_trial').default(false),
    isActive: boolean('is_active').default(true), // Whether the plan is currently offered
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('membership_plan_org_idx').on(table.organizationId),
    index('membership_plan_program_idx').on(table.programId),
    uniqueIndex('membership_plan_org_slug_idx').on(table.organizationId, table.slug),
  ],
);

// Links members to their membership plans with historical tracking
export const memberMembershipSchema = pgTable(
  'member_membership',
  {
    id: text('id').primaryKey(), // UUID v4
    memberId: text('member_id').references(() => memberSchema.id).notNull(),
    membershipPlanId: text('membership_plan_id').references(() => membershipPlanSchema.id).notNull(),
    status: text('status').notNull().default('active'), // active, cancelled, expired, converted
    billingType: text('billing_type').notNull().default('autopay'), // autopay, one-time
    startDate: timestamp('start_date', { mode: 'date' }).defaultNow().notNull(),
    endDate: timestamp('end_date', { mode: 'date' }), // null if ongoing
    firstPaymentDate: timestamp('first_payment_date', { mode: 'date' }), // When the first payment was made
    nextPaymentDate: timestamp('next_payment_date', { mode: 'date' }), // When the next payment is due (for autopay)
    iqproSubscriptionId: text('iqpro_subscription_id'), // IQPro recurring subscription ID
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('member_membership_member_idx').on(table.memberId),
    index('member_membership_member_status_idx').on(table.memberId, table.status),
  ],
);

// =============================================================================
// WAIVER TABLES
// =============================================================================

// Waiver templates - text templates for liability waivers
export const waiverTemplateSchema = pgTable(
  'waiver_template',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(), // e.g., 'Standard Adult Waiver', 'Kids Program Waiver'
    slug: text('slug').notNull(),
    version: integer('version').notNull().default(1), // Version tracking for legal compliance
    content: text('content').notNull(), // Full waiver text with placeholders like <academy>, <academy_owners>
    description: text('description'), // Internal description for staff
    isActive: boolean('is_active').default(true),
    isDefault: boolean('is_default').default(false), // Default waiver for new memberships
    requiresGuardian: boolean('requires_guardian').default(true), // If signer under threshold needs guardian
    guardianAgeThreshold: integer('guardian_age_threshold').default(16), // Age below which guardian is required
    sortOrder: integer('sort_order').default(0),
    parentId: text('parent_id'), // NULL = root (current/latest), non-NULL = archive version pointing to root
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('waiver_template_org_idx').on(table.organizationId),
    uniqueIndex('waiver_template_org_slug_version_idx').on(table.organizationId, table.slug, table.version),
    index('waiver_template_parent_idx').on(table.parentId),
  ],
);

// Signed waivers - records of signed waivers with signature data
export const signedWaiverSchema = pgTable(
  'signed_waiver',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    waiverTemplateId: text('waiver_template_id').references(() => waiverTemplateSchema.id).notNull(),
    waiverTemplateVersion: integer('waiver_template_version').notNull(), // Snapshot of version at signing
    memberId: text('member_id').references(() => memberSchema.id).notNull(),
    memberMembershipId: text('member_membership_id').references(() => memberMembershipSchema.id), // Optional link to specific membership

    // Membership plan details at time of signing (snapshot for legal compliance)
    membershipPlanName: text('membership_plan_name'), // e.g., '12 Month Commitment (Gold)'
    membershipPlanPrice: real('membership_plan_price'), // e.g., 150.00
    membershipPlanFrequency: text('membership_plan_frequency'), // e.g., 'Monthly', 'Annual', 'None'
    membershipPlanContractLength: text('membership_plan_contract_length'), // e.g., '12 Months', 'Month-to-Month'
    membershipPlanSignupFee: real('membership_plan_signup_fee'), // e.g., 35.00
    membershipPlanIsTrial: boolean('membership_plan_is_trial'), // e.g., false

    // Coupon/discount details at time of signing (snapshot for legal compliance)
    couponCode: text('coupon_code'), // e.g., 'SAVE15'
    couponType: text('coupon_type'), // 'Percentage' | 'Fixed Amount' | 'Free Trial'
    couponAmount: text('coupon_amount'), // Display string: '15%', '$50', '7 Days'
    couponDiscountedPrice: real('coupon_discounted_price'), // Final price after discount

    // Signature data
    signatureDataUrl: text('signature_data_url').notNull(), // Base64 signature image from canvas
    signedByName: text('signed_by_name').notNull(), // Name of the person who signed
    signedByEmail: text('signed_by_email'), // Email of signer (for minors, guardian email)
    signedByRelationship: text('signed_by_relationship'), // null = self, or 'parent', 'guardian', 'legal_guardian'

    // Member details at time of signing (snapshot for legal compliance)
    memberFirstName: text('member_first_name').notNull(),
    memberLastName: text('member_last_name').notNull(),
    memberEmail: text('member_email').notNull(),
    memberDateOfBirth: timestamp('member_date_of_birth', { mode: 'date' }),
    memberAgeAtSigning: integer('member_age_at_signing'),

    // Content snapshot (waiver text with placeholders substituted)
    renderedContent: text('rendered_content').notNull(), // Full waiver text as it appeared when signed

    // Metadata
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    signedAt: timestamp('signed_at', { mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('signed_waiver_org_idx').on(table.organizationId),
    index('signed_waiver_member_idx').on(table.memberId),
    index('signed_waiver_template_idx').on(table.waiverTemplateId),
    index('signed_waiver_membership_idx').on(table.memberMembershipId),
  ],
);

// Junction table: MembershipPlan-to-WaiverTemplate (M:N)
// Each membership plan can require specific waivers
export const membershipWaiverSchema = pgTable(
  'membership_waiver',
  {
    membershipPlanId: text('membership_plan_id').references(() => membershipPlanSchema.id).notNull(),
    waiverTemplateId: text('waiver_template_id').references(() => waiverTemplateSchema.id).notNull(),
    isRequired: boolean('is_required').default(true), // Whether this waiver must be signed
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    primaryKey({ columns: [table.membershipPlanId, table.waiverTemplateId] }),
  ],
);

// Waiver merge fields - configurable placeholders for waiver templates
// Each organization can define custom merge fields (e.g., <academy>, <academy_owners>)
export const waiverMergeFieldSchema = pgTable(
  'waiver_merge_field',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    key: text('key').notNull(), // e.g., 'academy', 'academy_owners' (stored without angle brackets)
    label: text('label').notNull(), // Display name e.g., 'Academy Name'
    defaultValue: text('default_value').notNull(), // Value to substitute in templates
    description: text('description'), // Help text for admins
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('waiver_merge_field_org_idx').on(table.organizationId),
    uniqueIndex('waiver_merge_field_org_key_idx').on(table.organizationId, table.key),
  ],
);

export const addressSchema = pgTable('address', {
  id: text('id').primaryKey(),
  memberId: text('member_id').references(() => memberSchema.id).notNull(),
  type: text('type').notNull(), // home, billing, mailing
  street: text('street').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  zipCode: text('zip_code').notNull(),
  country: text('country').notNull().default('US'),
  isDefault: boolean('is_default').default(false),
});

export const noteSchema = pgTable('note', {
  id: text('id').primaryKey(),
  memberId: text('member_id').references(() => memberSchema.id).notNull(),
  content: text('content').notNull(),
  status: text('status').notNull().default('active'), // active, archived
  createdByUserId: text('created_by_user_id'),
  createdByName: text('created_by_name'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const paymentMethodSchema = pgTable('payment_method', {
  id: text('id').primaryKey(),
  memberId: text('member_id').references(() => memberSchema.id).notNull(),
  stripePaymentMethodId: text('stripe_payment_method_id'),
  iqproPaymentMethodId: text('iqpro_payment_method_id'), // IQPro payment method ID
  type: text('type').notNull(),
  last4: text('last4'),
  isDefault: boolean('is_default').default(false),
});

export const familyMemberSchema = pgTable('family_member', {
  memberId: text('member_id').references(() => memberSchema.id).notNull(),
  relatedMemberId: text('related_member_id').references(() => memberSchema.id).notNull(),
  relationship: text('relationship').notNull(),
}, table => [
  primaryKey({ columns: [table.memberId, table.relatedMemberId] }),
]);

// =============================================================================
// CLASS & EVENT TABLES
// =============================================================================

// Class definitions (e.g., BJJ Fundamentals, Kids Class)
export const classSchema = pgTable(
  'class',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    programId: text('program_id').references(() => programSchema.id),
    name: text('name').notNull(), // e.g., 'BJJ Fundamentals'
    slug: text('slug').notNull(),
    description: text('description'),
    color: text('color'), // Hex color for calendar display
    defaultDurationMinutes: integer('default_duration_minutes').default(60),
    maxCapacity: integer('max_capacity'), // null = unlimited
    minAge: integer('min_age'),
    maxAge: integer('max_age'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('class_org_idx').on(table.organizationId),
    index('class_program_idx').on(table.programId),
    uniqueIndex('class_org_slug_idx').on(table.organizationId, table.slug),
  ],
);

// Special events (seminars, workshops, tournaments)
export const eventSchema = pgTable(
  'event',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    programId: text('program_id').references(() => programSchema.id),
    name: text('name').notNull(), // e.g., 'Black Belt Seminar'
    slug: text('slug').notNull(),
    description: text('description'),
    eventType: text('event_type').notNull(), // 'seminar', 'workshop', 'tournament', 'camp', 'other'
    imageUrl: text('image_url'), // Event banner/poster
    maxCapacity: integer('max_capacity'), // null = unlimited
    registrationDeadline: timestamp('registration_deadline', { mode: 'date' }),
    isPublic: boolean('is_public').default(true), // Visible to non-members
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('event_org_idx').on(table.organizationId),
    uniqueIndex('event_org_slug_idx').on(table.organizationId, table.slug),
  ],
);

// =============================================================================
// SCHEDULE TABLES
// =============================================================================

// Recurring schedule patterns for classes (e.g., "Mondays at 6 PM")
export const classScheduleInstanceSchema = pgTable(
  'class_schedule_instance',
  {
    id: text('id').primaryKey(), // UUID v4
    classId: text('class_id').references(() => classSchema.id).notNull(),
    primaryInstructorClerkId: text('primary_instructor_clerk_id'), // Clerk user ID
    dayOfWeek: integer('day_of_week').notNull(), // 0 = Sunday, 6 = Saturday
    startTime: text('start_time').notNull(), // HH:MM format (24h)
    endTime: text('end_time').notNull(), // HH:MM format (24h)
    room: text('room'), // Optional room/mat designation
    effectiveFrom: timestamp('effective_from', { mode: 'date' }).defaultNow().notNull(),
    effectiveUntil: timestamp('effective_until', { mode: 'date' }), // null = ongoing
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('class_schedule_class_idx').on(table.classId),
    index('class_schedule_day_idx').on(table.dayOfWeek),
  ],
);

// Schedule overrides (cancellations, time changes, substitutions)
export const classScheduleExceptionSchema = pgTable(
  'class_schedule_exception',
  {
    id: text('id').primaryKey(), // UUID v4
    classScheduleInstanceId: text('class_schedule_instance_id').references(() => classScheduleInstanceSchema.id).notNull(),
    exceptionDate: timestamp('exception_date', { mode: 'date' }).notNull(),
    exceptionType: text('exception_type').notNull(), // 'cancelled', 'time_change', 'instructor_change', 'room_change'
    newStartTime: text('new_start_time'), // For time_change
    newEndTime: text('new_end_time'), // For time_change
    newInstructorClerkId: text('new_instructor_clerk_id'), // For instructor_change
    newRoom: text('new_room'), // For room_change
    reason: text('reason'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('class_exception_schedule_idx').on(table.classScheduleInstanceId),
    index('class_exception_date_idx').on(table.exceptionDate),
  ],
);

// Individual event time slots (events can have multiple sessions)
export const eventSessionSchema = pgTable(
  'event_session',
  {
    id: text('id').primaryKey(), // UUID v4
    eventId: text('event_id').references(() => eventSchema.id).notNull(),
    primaryInstructorClerkId: text('primary_instructor_clerk_id'), // Clerk user ID
    sessionDate: timestamp('session_date', { mode: 'date' }).notNull(),
    startTime: text('start_time').notNull(), // HH:MM format
    endTime: text('end_time').notNull(), // HH:MM format
    room: text('room'),
    maxCapacity: integer('max_capacity'), // Override event capacity for this session
    isCancelled: boolean('is_cancelled').default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('event_session_event_idx').on(table.eventId),
    index('event_session_date_idx').on(table.sessionDate),
  ],
);

// Event pricing tiers (early bird, member discounts, etc.)
export const eventBillingSchema = pgTable(
  'event_billing',
  {
    id: text('id').primaryKey(), // UUID v4
    eventId: text('event_id').references(() => eventSchema.id).notNull(),
    name: text('name').notNull(), // e.g., 'Early Bird', 'Member Price', 'Non-Member'
    price: real('price').notNull(),
    memberOnly: boolean('member_only').default(false),
    validFrom: timestamp('valid_from', { mode: 'date' }),
    validUntil: timestamp('valid_until', { mode: 'date' }),
    maxRegistrations: integer('max_registrations'), // Limit for this tier
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('event_billing_event_idx').on(table.eventId),
  ],
);

// =============================================================================
// COUPON TABLES
// =============================================================================

// Discount codes and promotions
export const couponSchema = pgTable(
  'coupon',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    code: text('code').notNull(), // e.g., 'SUMMER20'
    name: text('name').notNull(), // Display name
    description: text('description'),
    discountType: text('discount_type').notNull(), // 'percentage', 'fixed', 'free_days'
    discountValue: real('discount_value').notNull(), // Amount (percent or dollars or days)
    applicableTo: text('applicable_to').notNull(), // 'membership', 'event', 'all'
    minPurchaseAmount: real('min_purchase_amount'),
    maxDiscountAmount: real('max_discount_amount'), // Cap for percentage discounts
    usageLimit: integer('usage_limit'), // null = unlimited
    usageCount: integer('usage_count').default(0),
    perUserLimit: integer('per_user_limit').default(1),
    validFrom: timestamp('valid_from', { mode: 'date' }).defaultNow().notNull(),
    validUntil: timestamp('valid_until', { mode: 'date' }),
    status: text('status').notNull().default('active'), // 'active', 'expired', 'inactive'
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('coupon_org_idx').on(table.organizationId),
    uniqueIndex('coupon_org_code_idx').on(table.organizationId, table.code),
    index('coupon_status_idx').on(table.status),
  ],
);

// Coupon redemption tracking
export const couponUsageSchema = pgTable(
  'coupon_usage',
  {
    id: text('id').primaryKey(), // UUID v4
    couponId: text('coupon_id').references(() => couponSchema.id).notNull(),
    memberId: text('member_id').references(() => memberSchema.id).notNull(),
    transactionId: text('transaction_id'), // FK to transaction if applicable
    discountApplied: real('discount_applied').notNull(), // Actual discount amount
    usedAt: timestamp('used_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('coupon_usage_coupon_idx').on(table.couponId),
    index('coupon_usage_member_idx').on(table.memberId),
  ],
);

// =============================================================================
// CATALOG TABLES (Merchandise & Event Access for Kiosk)
// =============================================================================

// Catalog categories for organizing products
export const catalogCategorySchema = pgTable(
  'catalog_category',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(), // e.g., 'Gis', 'Belts', 'Apparel', 'Seminars'
    slug: text('slug').notNull(),
    description: text('description'),
    parentId: text('parent_id'), // Self-reference for subcategories
    sortOrder: integer('sort_order').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('catalog_category_org_idx').on(table.organizationId),
    uniqueIndex('catalog_category_org_slug_idx').on(table.organizationId, table.slug),
  ],
);

// Catalog items (merchandise and event access products)
export const catalogItemSchema = pgTable(
  'catalog_item',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    type: text('type').notNull(), // 'merchandise' | 'event_access'
    name: text('name').notNull(), // e.g., 'White Gi', 'Summer Seminar Pass'
    slug: text('slug').notNull(),
    description: text('description'), // Full product description
    shortDescription: text('short_description'), // For list views/cards
    sku: text('sku'), // Stock keeping unit
    basePrice: real('base_price').notNull().default(0),
    compareAtPrice: real('compare_at_price'), // Original price for sale display
    eventId: text('event_id').references(() => eventSchema.id), // For event_access type
    maxPerOrder: integer('max_per_order').default(10),
    trackInventory: boolean('track_inventory').default(true),
    lowStockThreshold: integer('low_stock_threshold').default(5),
    sortOrder: integer('sort_order').default(0),
    isActive: boolean('is_active').default(true),
    isFeatured: boolean('is_featured').default(false),
    showOnKiosk: boolean('show_on_kiosk').default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('catalog_item_org_idx').on(table.organizationId),
    index('catalog_item_type_idx').on(table.organizationId, table.type),
    uniqueIndex('catalog_item_org_slug_idx').on(table.organizationId, table.slug),
    index('catalog_item_event_idx').on(table.eventId),
  ],
);

// Catalog item variants - user-defined variants with name, price, and stock (max 8 per item)
export const catalogItemVariantSchema = pgTable(
  'catalog_item_variant',
  {
    id: text('id').primaryKey(), // UUID v4
    catalogItemId: text('catalog_item_id').references(() => catalogItemSchema.id).notNull(),
    name: text('name').notNull(), // e.g., 'A2 White', 'Large Blue', 'Standard'
    price: real('price').notNull().default(0), // Variant-specific price (can override base price)
    stockQuantity: integer('stock_quantity').default(0),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('catalog_variant_item_idx').on(table.catalogItemId),
    uniqueIndex('catalog_variant_item_name_idx').on(table.catalogItemId, table.name),
  ],
);

// Catalog item images
export const catalogItemImageSchema = pgTable(
  'catalog_item_image',
  {
    id: text('id').primaryKey(), // UUID v4
    catalogItemId: text('catalog_item_id').references(() => catalogItemSchema.id).notNull(),
    url: text('url').notNull(), // Full-size image URL
    thumbnailUrl: text('thumbnail_url'), // Thumbnail for list views
    altText: text('alt_text'),
    isPrimary: boolean('is_primary').default(false),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('catalog_image_item_idx').on(table.catalogItemId),
  ],
);

// Catalog item to category junction table (M:N)
export const catalogItemCategorySchema = pgTable(
  'catalog_item_category',
  {
    catalogItemId: text('catalog_item_id').references(() => catalogItemSchema.id).notNull(),
    categoryId: text('category_id').references(() => catalogCategorySchema.id).notNull(),
  },
  table => [
    primaryKey({ columns: [table.catalogItemId, table.categoryId] }),
  ],
);

// =============================================================================
// JUNCTION TABLES (M:N Relationships)
// =============================================================================

// Class-to-Instructor (M:N) - for listing multiple instructors per class
export const classInstructorSchema = pgTable(
  'class_instructor',
  {
    classId: text('class_id').references(() => classSchema.id).notNull(),
    instructorClerkId: text('instructor_clerk_id').notNull(), // Clerk user ID
    isPrimary: boolean('is_primary').default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    primaryKey({ columns: [table.classId, table.instructorClerkId] }),
  ],
);

// Event-to-Instructor (M:N)
export const eventInstructorSchema = pgTable(
  'event_instructor',
  {
    eventId: text('event_id').references(() => eventSchema.id).notNull(),
    instructorClerkId: text('instructor_clerk_id').notNull(), // Clerk user ID
    isPrimary: boolean('is_primary').default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    primaryKey({ columns: [table.eventId, table.instructorClerkId] }),
  ],
);

// Class-to-Tag (M:N)
export const classTagSchema = pgTable(
  'class_tag',
  {
    classId: text('class_id').references(() => classSchema.id).notNull(),
    tagId: text('tag_id').references(() => tagSchema.id).notNull(),
  },
  table => [
    primaryKey({ columns: [table.classId, table.tagId] }),
  ],
);

// MembershipPlan-to-Tag (M:N)
export const membershipTagSchema = pgTable(
  'membership_tag',
  {
    membershipPlanId: text('membership_plan_id').references(() => membershipPlanSchema.id).notNull(),
    tagId: text('tag_id').references(() => tagSchema.id).notNull(),
  },
  table => [
    primaryKey({ columns: [table.membershipPlanId, table.tagId] }),
  ],
);

// Event-to-Tag (M:N)
export const eventTagSchema = pgTable(
  'event_tag',
  {
    eventId: text('event_id').references(() => eventSchema.id).notNull(),
    tagId: text('tag_id').references(() => tagSchema.id).notNull(),
  },
  table => [
    primaryKey({ columns: [table.eventId, table.tagId] }),
  ],
);

// =============================================================================
// MEMBER ACTIVITY TABLES
// =============================================================================

// Member class enrollments (which classes a member is enrolled in)
export const classEnrollmentSchema = pgTable(
  'class_enrollment',
  {
    id: text('id').primaryKey(), // UUID v4
    memberId: text('member_id').references(() => memberSchema.id).notNull(),
    classId: text('class_id').references(() => classSchema.id).notNull(),
    status: text('status').notNull().default('active'), // 'active', 'waitlist', 'dropped'
    enrolledAt: timestamp('enrolled_at', { mode: 'date' }).defaultNow().notNull(),
    droppedAt: timestamp('dropped_at', { mode: 'date' }),
  },
  table => [
    index('class_enrollment_member_idx').on(table.memberId),
    index('class_enrollment_class_idx').on(table.classId),
    uniqueIndex('class_enrollment_member_class_idx').on(table.memberId, table.classId),
  ],
);

// Member event registrations
export const eventRegistrationSchema = pgTable(
  'event_registration',
  {
    id: text('id').primaryKey(), // UUID v4
    memberId: text('member_id').references(() => memberSchema.id).notNull(),
    eventId: text('event_id').references(() => eventSchema.id).notNull(),
    eventBillingId: text('event_billing_id').references(() => eventBillingSchema.id),
    status: text('status').notNull().default('registered'), // 'registered', 'waitlist', 'cancelled', 'attended'
    amountPaid: real('amount_paid'),
    registeredAt: timestamp('registered_at', { mode: 'date' }).defaultNow().notNull(),
    cancelledAt: timestamp('cancelled_at', { mode: 'date' }),
  },
  table => [
    index('event_registration_member_idx').on(table.memberId),
    index('event_registration_event_idx').on(table.eventId),
  ],
);

// Check-in records for attendance tracking
export const attendanceSchema = pgTable(
  'attendance',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    memberId: text('member_id').references(() => memberSchema.id).notNull(),
    classScheduleInstanceId: text('class_schedule_instance_id').references(() => classScheduleInstanceSchema.id),
    eventSessionId: text('event_session_id').references(() => eventSessionSchema.id),
    attendanceDate: timestamp('attendance_date', { mode: 'date' }).notNull(),
    checkInTime: timestamp('check_in_time', { mode: 'date' }).defaultNow().notNull(),
    checkOutTime: timestamp('check_out_time', { mode: 'date' }),
    checkInMethod: text('check_in_method').notNull().default('manual'), // 'manual', 'kiosk', 'app', 'qr_code'
    checkedInByClerkId: text('checked_in_by_clerk_id'), // Staff who checked in (for manual)
    instructorClerkId: text('instructor_clerk_id'), // Instructor at time of class
    notes: text('notes'),
  },
  table => [
    index('attendance_org_idx').on(table.organizationId),
    index('attendance_member_idx').on(table.memberId),
    index('attendance_date_idx').on(table.attendanceDate),
    index('attendance_schedule_idx').on(table.classScheduleInstanceId),
    index('attendance_session_idx').on(table.eventSessionId),
  ],
);

// Payment transactions
export const transactionSchema = pgTable(
  'transaction',
  {
    id: text('id').primaryKey(), // UUID v4
    organizationId: text('organization_id').notNull(),
    memberId: text('member_id').references(() => memberSchema.id).notNull(),
    memberMembershipId: text('member_membership_id').references(() => memberMembershipSchema.id),
    eventRegistrationId: text('event_registration_id').references(() => eventRegistrationSchema.id),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    iqproTransactionId: text('iqpro_transaction_id'), // IQPro transaction ID
    transactionType: text('transaction_type').notNull(), // 'membership_payment', 'event_registration', 'signup_fee', 'refund', 'adjustment'
    amount: real('amount').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('pending'), // 'pending', 'paid', 'declined', 'refunded', 'processing'
    paymentMethod: text('payment_method'), // 'card', 'cash', 'check', 'bank_transfer'
    description: text('description'),
    processedAt: timestamp('processed_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('transaction_org_idx').on(table.organizationId),
    index('transaction_member_idx').on(table.memberId),
    index('transaction_status_idx').on(table.status),
    index('transaction_date_idx').on(table.createdAt),
    uniqueIndex('transaction_stripe_idx').on(table.stripePaymentIntentId),
  ],
);
