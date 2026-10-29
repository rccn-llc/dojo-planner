import type { OrgRole } from './Auth';

/**
 * Supported audit actions for SOC2 compliance tracking.
 * Format: {entity}.{operation}
 */
export const AUDIT_ACTION = {
  // Member operations
  MEMBER_CREATE: 'member.create',
  MEMBER_UPDATE: 'member.update',
  MEMBER_REMOVE: 'member.remove',
  MEMBER_RESTORE: 'member.restore',
  MEMBER_UPDATE_CONTACT: 'member.updateContact',
  MEMBER_UPDATE_ACCESS: 'member.updateAccess',
  MEMBER_ADD_MEMBERSHIP: 'member.addMembership',
  MEMBER_CHANGE_MEMBERSHIP: 'member.changeMembership',
  MEMBERSHIP_CANCEL: 'memberMembership.cancel',
  MEMBERSHIP_HOLD: 'memberMembership.hold',
  MEMBERSHIP_REACTIVATE: 'memberMembership.reactivate',
  // A recurring charge declined for the 3rd time in a cycle; IQPro has stopped
  // retrying. Webhook-originated (system actor).
  MEMBERSHIP_OVERDUE: 'memberMembership.overdue',
  CANCELLATION_FEE_CHARGE: 'cancellationFee.charge',
  HOLD_FEE_CHARGE: 'holdFee.charge',

  // Membership plan operations
  MEMBERSHIP_PLAN_CREATE: 'membershipPlan.create',
  MEMBERSHIP_PLAN_UPDATE: 'membershipPlan.update',
  MEMBERSHIP_PLAN_DELETE: 'membershipPlan.delete',

  // Program operations
  PROGRAM_CREATE: 'program.create',
  PROGRAM_UPDATE: 'program.update',
  PROGRAM_DELETE: 'program.delete',

  // Class operations
  CLASS_CREATE: 'class.create',
  CLASS_UPDATE: 'class.update',
  CLASS_DELETE: 'class.delete',
  CLASS_SCHEDULE_CREATE: 'classSchedule.create',
  CLASS_SCHEDULE_UPDATE: 'classSchedule.update',
  CLASS_SCHEDULE_DELETE: 'classSchedule.delete',
  CLASS_SCHEDULE_EXCEPTION_CREATE: 'classScheduleException.create',
  CLASS_SCHEDULE_EXCEPTION_UPDATE: 'classScheduleException.update',
  CLASS_SCHEDULE_EXCEPTION_DELETE: 'classScheduleException.delete',

  // Event operations
  EVENT_CREATE: 'event.create',
  EVENT_UPDATE: 'event.update',
  EVENT_DELETE: 'event.delete',
  EVENT_SESSION_CREATE: 'eventSession.create',
  EVENT_SESSION_UPDATE: 'eventSession.update',
  EVENT_SESSION_CANCEL: 'eventSession.cancel',

  // Coupon operations
  COUPON_CREATE: 'coupon.create',
  COUPON_UPDATE: 'coupon.update',
  COUPON_DELETE: 'coupon.delete',
  COUPON_REDEEM: 'coupon.redeem',

  // Enrollment & registration operations
  CLASS_ENROLLMENT_CREATE: 'classEnrollment.create',
  CLASS_ENROLLMENT_DROP: 'classEnrollment.drop',
  EVENT_REGISTRATION_CREATE: 'eventRegistration.create',
  EVENT_REGISTRATION_CANCEL: 'eventRegistration.cancel',

  // Attendance operations
  ATTENDANCE_CHECK_IN: 'attendance.checkIn',
  ATTENDANCE_CHECK_OUT: 'attendance.checkOut',

  // Transaction operations
  TRANSACTION_CREATE: 'transaction.create',
  TRANSACTION_REFUND: 'transaction.refund',
  // Staff re-charged a declined recurring payment from the UI.
  TRANSACTION_RETRY: 'transaction.retry',
  // A recurring charge succeeded for a cycle a manual retry had already
  // collected — a probable double charge (system actor).
  TRANSACTION_POSSIBLE_DUPLICATE: 'transaction.possibleDuplicate',
  TRANSACTION_UPDATE: 'transaction.update',
  // Read-access logging for sensitive financial data (SOC2 CC7.2)
  TRANSACTION_VIEW: 'transaction.view',

  // Payment operations
  PAYMENT_PROCESS: 'payment.process',
  PAYMENT_METHOD_REGISTER: 'paymentMethod.register',
  PAYMENT_METHOD_DELETE: 'paymentMethod.delete',
  PAYMENT_METHOD_SET_PRIMARY: 'paymentMethod.setPrimary',
  // Read-access logging for saved payment methods (SOC2 CC7.2)
  PAYMENT_METHOD_VIEW: 'paymentMethod.view',
  // Reconciled the local saved card against the provider's subscription card.
  PAYMENT_METHOD_SYNC: 'paymentMethod.sync',
  // The reconcile found the card changed AT THE PROVIDER (e.g. the member
  // updated it via the provider's failed-payment email).
  PAYMENT_METHOD_PROVIDER_UPDATE: 'paymentMethod.providerUpdate',
  // A card-update request opened (decline) or the IQPro add-card link was
  // emailed to the member (staff).
  PAYMENT_METHOD_UPDATE_REQUEST: 'paymentMethod.updateRequest',

  // Tag operations
  TAG_CREATE: 'tag.create',
  TAG_UPDATE: 'tag.update',
  TAG_DELETE: 'tag.delete',

  // Image operations
  IMAGE_UPLOAD: 'image.upload',
  IMAGE_DELETE: 'image.delete',

  // Catalog operations
  CATALOG_ITEM_CREATE: 'catalogItem.create',
  CATALOG_ITEM_UPDATE: 'catalogItem.update',
  CATALOG_ITEM_DELETE: 'catalogItem.delete',
  CATALOG_VARIANT_CREATE: 'catalogVariant.create',
  CATALOG_VARIANT_UPDATE: 'catalogVariant.update',
  CATALOG_VARIANT_DELETE: 'catalogVariant.delete',
  CATALOG_CATEGORY_CREATE: 'catalogCategory.create',
  CATALOG_CATEGORY_UPDATE: 'catalogCategory.update',
  CATALOG_CATEGORY_DELETE: 'catalogCategory.delete',
  CATALOG_STOCK_ADJUST: 'catalogStock.adjust',
  CATALOG_IMAGE_UPLOAD: 'catalogImage.upload',
  CATALOG_IMAGE_DELETE: 'catalogImage.delete',

  // Waiver template operations
  WAIVER_TEMPLATE_CREATE: 'waiverTemplate.create',
  WAIVER_TEMPLATE_UPDATE: 'waiverTemplate.update',
  WAIVER_TEMPLATE_DELETE: 'waiverTemplate.delete',
  WAIVER_TEMPLATE_VERSION_CREATE: 'waiverTemplate.versionCreate',

  // Signed waiver operations
  WAIVER_SIGNED: 'waiver.signed',

  // Membership-waiver association operations
  MEMBERSHIP_WAIVER_SET: 'membershipWaiver.set',
  MEMBERSHIP_WAIVER_ADD: 'membershipWaiver.add',
  MEMBERSHIP_WAIVER_REMOVE: 'membershipWaiver.remove',

  // Merge field operations
  MERGE_FIELD_CREATE: 'mergeField.create',
  MERGE_FIELD_UPDATE: 'mergeField.update',
  MERGE_FIELD_DELETE: 'mergeField.delete',

  // Family member operations
  FAMILY_MEMBER_LINK: 'familyMember.link',
  FAMILY_MEMBER_UNLINK: 'familyMember.unlink',

  // Member conversion operations
  MEMBER_CONVERT: 'member.convert',

  // SaaS subscription operations
  SAAS_SUBSCRIPTION_CREATE: 'saasSubscription.create',
  SAAS_SUBSCRIPTION_CHANGE: 'saasSubscription.change',
  SAAS_SUBSCRIPTION_CANCEL: 'saasSubscription.cancel',

  // Organization operations
  ORGANIZATION_LOCATION_UPDATE: 'organizationLocation.update',

  // IQPro merchant configuration
  IQPRO_CONFIG_UPDATE: 'iqproConfig.update',
  /**
   * The org switched payment providers. Its own action because a switch
   * changes which merchant account receives this org's member payments —
   * materially different from rotating credentials within one provider.
   */
  PAYMENT_PROVIDER_CHANGE: 'paymentProvider.change',

  // Note operations
  NOTE_CREATE: 'note.create',
  NOTE_UPDATE: 'note.update',
  NOTE_DELETE: 'note.delete',

  // Staff operations
  STAFF_INVITE: 'staff.invite',
  STAFF_UPDATE: 'staff.update',
  STAFF_REMOVE: 'staff.remove',

  // Instructor operations
  INSTRUCTOR_PHOTO_UPDATE: 'instructor.photoUpdate',

  // Role operations (Clerk organization roles)
  ROLE_CREATE: 'role.create',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

/**
 * Entity types that can be audited.
 */
export const AUDIT_ENTITY_TYPE = {
  MEMBER: 'member',
  MEMBERSHIP: 'membership',
  MEMBERSHIP_PLAN: 'membershipPlan',
  PROGRAM: 'program',
  CLASS: 'class',
  CLASS_SCHEDULE: 'classSchedule',
  CLASS_SCHEDULE_EXCEPTION: 'classScheduleException',
  EVENT: 'event',
  EVENT_SESSION: 'eventSession',
  COUPON: 'coupon',
  CLASS_ENROLLMENT: 'classEnrollment',
  EVENT_REGISTRATION: 'eventRegistration',
  ATTENDANCE: 'attendance',
  TRANSACTION: 'transaction',
  TAG: 'tag',
  IMAGE: 'image',
  CATALOG_ITEM: 'catalogItem',
  CATALOG_VARIANT: 'catalogVariant',
  CATALOG_CATEGORY: 'catalogCategory',
  CATALOG_IMAGE: 'catalogImage',
  WAIVER_TEMPLATE: 'waiverTemplate',
  SIGNED_WAIVER: 'signedWaiver',
  MEMBERSHIP_WAIVER: 'membershipWaiver',
  WAIVER_MERGE_FIELD: 'waiverMergeField',
  FAMILY_MEMBER: 'familyMember',
  PAYMENT_METHOD: 'paymentMethod',
  ORGANIZATION: 'organization',
  NOTE: 'note',
  STAFF: 'staff',
  INSTRUCTOR: 'instructor',
  ROLE: 'role',
} as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPE)[keyof typeof AUDIT_ENTITY_TYPE];

/**
 * Status of the audited operation.
 */
export type AuditStatus = 'success' | 'failure';

/**
 * Represents a change to a field during an update operation.
 */
export type AuditFieldChange = {
  before: unknown;
  after: unknown;
};

/**
 * Context about the authenticated user performing the action.
 * Extracted from Clerk auth and passed through guards.
 */
/**
 * The actor recorded for audits that originate from a provider webhook or a
 * scheduled job — no Clerk user performed them. Pair with the resolved orgId.
 */
export const SYSTEM_ACTOR_USER_ID = 'system:payment-webhook';

export type AuditContext = {
  /** Clerk user ID performing the action */
  userId: string;
  /** Organization ID for multi-tenant isolation */
  orgId: string;
  /** User's role at time of action */
  role?: OrgRole;
};

/**
 * Full audit event structure for SOC2 compliance.
 * Answers: WHO did WHAT to WHICH entity WHEN
 */
export type AuditEvent = {
  /** Clerk user ID - WHO performed the action */
  userId: string;
  /** Organization ID - WHICH ORG context */
  orgId: string;
  /** Action performed - WHAT was done */
  action: AuditAction;
  /** Type of entity affected */
  entityType: AuditEntityType;
  /** ID of the affected entity - WHICH entity */
  entityId?: string;
  /** Timestamp of the action - WHEN */
  timestamp: Date;
  /** User's role at time of action */
  role?: OrgRole;
  /** Operation outcome */
  status: AuditStatus;
  /** Field-level changes for update operations */
  changes?: Record<string, AuditFieldChange>;
  /** Error message if status is 'failure' */
  error?: string;
  /** Client IP address (when available) */
  ipAddress?: string;
  /** User agent string (when available) */
  userAgent?: string;
  /** Request correlation ID for tracing */
  requestId?: string;
};

/**
 * Input for creating an audit event (timestamp auto-generated).
 */
export type AuditEventInput = Omit<AuditEvent, 'timestamp'>;
