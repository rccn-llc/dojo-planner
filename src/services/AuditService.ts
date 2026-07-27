/**
 * Audit Service for SOC2 Compliance
 *
 * Provides structured audit logging for all mutations in the application.
 * Answers the critical audit question: WHO did WHAT to WHICH entity WHEN
 *
 * Usage in routers:
 * ```typescript
 * const context = await guardRole(ORG_ROLE.ADMIN);
 * try {
 *   const result = await someOperation();
 *   await audit(context, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
 *     entityId: result.id,
 *     status: 'success',
 *   });
 *   return result;
 * } catch (error) {
 *   await audit(context, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
 *     status: 'failure',
 *     error: error instanceof Error ? error.message : 'Unknown error',
 *   });
 *   throw error;
 * }
 * ```
 */
import type { AuditAction, AuditContext, AuditEntityType, AuditEvent, AuditFieldChange, AuditStatus } from '@/types/Audit';
import { auditLogger } from '@/libs/Logger';

/**
 * Options for creating an audit event.
 */
type AuditOptions = {
  /** ID of the affected entity */
  entityId?: string;
  /** Operation outcome */
  status: AuditStatus;
  /** Field-level changes for update operations */
  changes?: Record<string, AuditFieldChange>;
  /** Error message if status is 'failure' */
  error?: string;
  /** Client IP address */
  ipAddress?: string;
  /** User agent string */
  userAgent?: string;
  /** Request correlation ID */
  requestId?: string;
};

/**
 * Creates and logs an audit event for SOC2 compliance.
 *
 * @param context - Auth context from guardAuth/guardRole
 * @param action - The action being performed
 * @param entityType - The type of entity being affected
 * @param options - Additional audit event options
 */
export async function audit(
  context: AuditContext,
  action: AuditAction,
  entityType: AuditEntityType,
  options: AuditOptions,
): Promise<void> {
  const event: AuditEvent = {
    userId: context.userId,
    orgId: context.orgId,
    role: context.role,
    action,
    entityType,
    entityId: options.entityId,
    timestamp: new Date(),
    status: options.status,
    changes: options.changes,
    error: options.error,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    requestId: options.requestId,
  };

  // Log with structured data for SOC2 audit trail.
  //
  // Audit logging is BEST-EFFORT and must never alter the outcome of the
  // operation it records. Router handlers call `await audit(...)` inside both
  // the success path and the catch-then-rethrow path; if the logger transport
  // rejected here, an un-caught rejection would (a) turn a successful mutation
  // into a 500, or (b) replace the meaningful domain error being rethrown with
  // an audit-logging error. Swallow any logging failure (recording it to the
  // console as a last resort) so the caller's control flow is unaffected.
  try {
    if (options.status === 'success') {
      auditLogger.info(
        `[AUDIT] ${action} on ${entityType}${options.entityId ? `:${options.entityId}` : ''} by user:${context.userId} in org:${context.orgId}`,
        { audit: event },
      );
    } else {
      auditLogger.warn(
        `[AUDIT] FAILED ${action} on ${entityType}${options.entityId ? `:${options.entityId}` : ''} by user:${context.userId} in org:${context.orgId}: ${options.error}`,
        { audit: event },
      );
    }
  } catch (logError) {
    console.error('[AuditService] Failed to write audit log (non-fatal)', logError);
  }
}

/**
 * Computes field-level changes between two objects for audit logging.
 * Only includes fields that actually changed.
 *
 * @param before - Original object state
 * @param after - New object state
 * @param fields - Specific fields to track (tracks all if not provided)
 * @returns Record of field changes, or undefined if no changes
 */
export function computeChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields?: (keyof T)[],
): Record<string, AuditFieldChange> | undefined {
  const changes: Record<string, AuditFieldChange> = {};
  const fieldsToCheck = fields ?? (Object.keys(after) as (keyof T)[]);

  for (const field of fieldsToCheck) {
    const beforeValue = before[field];
    const afterValue = after[field];

    // Only record if there's an actual change
    if (afterValue !== undefined && beforeValue !== afterValue) {
      changes[field as string] = {
        before: beforeValue,
        after: afterValue,
      };
    }
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
