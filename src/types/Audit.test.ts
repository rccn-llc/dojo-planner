import type { AuditContext, AuditEvent, AuditEventInput, AuditFieldChange, AuditStatus } from './Audit';
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from './Audit';

describe('Audit Types', () => {
  describe('AUDIT_ACTION constants', () => {
    it('should have all member action types', () => {
      expect(AUDIT_ACTION.MEMBER_CREATE).toBe('member.create');
      expect(AUDIT_ACTION.MEMBER_UPDATE).toBe('member.update');
      expect(AUDIT_ACTION.MEMBER_REMOVE).toBe('member.remove');
      expect(AUDIT_ACTION.MEMBER_RESTORE).toBe('member.restore');
      expect(AUDIT_ACTION.MEMBER_UPDATE_CONTACT).toBe('member.updateContact');
      expect(AUDIT_ACTION.MEMBER_UPDATE_ACCESS).toBe('member.updateAccess');
      expect(AUDIT_ACTION.MEMBER_ADD_MEMBERSHIP).toBe('member.addMembership');
      expect(AUDIT_ACTION.MEMBER_CHANGE_MEMBERSHIP).toBe('member.changeMembership');
    });

    it('should have correct number of action types', () => {
      const actionCount = Object.keys(AUDIT_ACTION).length;

      // 8 member + 3 membership plan + 3 program + 7 class (3+3+1 exception) + 6 event
      // + 4 coupon + 4 enrollment/registration + 2 attendance + 3 transaction + 3 tag + 2 image
      // + 12 catalog (6 item + 3 variant + 3 category + 1 stock + 2 image)
      // + 8 waiver (4 template + 1 signed + 3 membership waiver)
      // + 3 merge field + 1 payment + 1 payment method register + 1 family member link
      // + 1 family member unlink + 1 member convert + 3 saas subscription
      // + 3 note (create + update + delete) = 79
      expect(actionCount).toBe(79);
    });
  });

  describe('AUDIT_ENTITY_TYPE constants', () => {
    it('should have all entity types', () => {
      expect(AUDIT_ENTITY_TYPE.MEMBER).toBe('member');
      expect(AUDIT_ENTITY_TYPE.MEMBERSHIP).toBe('membership');
    });

    it('should have correct number of entity types', () => {
      const entityCount = Object.keys(AUDIT_ENTITY_TYPE).length;

      // member, membership, membershipPlan, program, class, classSchedule, classScheduleException,
      // event, eventSession, coupon, classEnrollment, eventRegistration, attendance, transaction, tag, image
      // + catalogItem, catalogVariant, catalogCategory, catalogImage
      // + waiverTemplate, signedWaiver, membershipWaiver, waiverMergeField + familyMember + paymentMethod + organization
      // + note = 28
      expect(entityCount).toBe(28);
    });
  });

  describe('Type compatibility', () => {
    it('should allow valid AuditContext', () => {
      const context: AuditContext = {
        userId: 'test-user-123',
        orgId: 'test-org-456',
        role: 'org:admin',
      };

      expect(context.userId).toBe('test-user-123');
      expect(context.orgId).toBe('test-org-456');
      expect(context.role).toBe('org:admin');
    });

    it('should allow AuditContext without optional role', () => {
      const context: AuditContext = {
        userId: 'test-user-123',
        orgId: 'test-org-456',
      };

      expect(context.userId).toBe('test-user-123');
      expect(context.role).toBeUndefined();
    });

    it('should allow valid AuditFieldChange', () => {
      const change: AuditFieldChange = {
        before: 'old value',
        after: 'new value',
      };

      expect(change.before).toBe('old value');
      expect(change.after).toBe('new value');
    });

    it('should allow AuditStatus values', () => {
      const successStatus: AuditStatus = 'success';
      const failureStatus: AuditStatus = 'failure';

      expect(successStatus).toBe('success');
      expect(failureStatus).toBe('failure');
    });

    it('should allow valid AuditEvent', () => {
      const event: AuditEvent = {
        userId: 'test-user-123',
        orgId: 'test-org-456',
        action: AUDIT_ACTION.MEMBER_CREATE,
        entityType: AUDIT_ENTITY_TYPE.MEMBER,
        entityId: 'test-entity-789',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        role: 'org:admin',
        status: 'success',
      };

      expect(event.userId).toBe('test-user-123');
      expect(event.action).toBe('member.create');
      expect(event.entityType).toBe('member');
      expect(event.status).toBe('success');
    });

    it('should allow AuditEvent with optional fields', () => {
      const event: AuditEvent = {
        userId: 'test-user-123',
        orgId: 'test-org-456',
        action: AUDIT_ACTION.MEMBER_UPDATE,
        entityType: AUDIT_ENTITY_TYPE.MEMBER,
        timestamp: new Date(),
        status: 'failure',
        error: 'Something went wrong',
        changes: {
          firstName: { before: 'John', after: 'Jane' },
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        requestId: 'req-123',
      };

      expect(event.error).toBe('Something went wrong');
      expect(event.changes?.firstName?.before).toBe('John');
      expect(event.ipAddress).toBe('192.168.1.1');
    });

    it('should allow AuditEventInput without timestamp', () => {
      const input: AuditEventInput = {
        userId: 'test-user-123',
        orgId: 'test-org-456',
        action: AUDIT_ACTION.MEMBER_CREATE,
        entityType: AUDIT_ENTITY_TYPE.MEMBER,
        entityId: 'test-member-123',
        status: 'success',
      };

      expect(input.userId).toBe('test-user-123');
      expect(input.action).toBe('member.create');
      // timestamp should not exist on input type
      expect('timestamp' in input).toBe(false);
    });
  });
});
