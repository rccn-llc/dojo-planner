import type { AuditContext } from '@/types/Audit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { audit, computeChanges } from './AuditService';

// Mock the logger
vi.mock('@/libs/Logger', () => ({
  auditLogger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('AuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('audit', () => {
    const mockContext: AuditContext = {
      userId: 'test-user-123',
      orgId: 'test-org-456',
      role: 'org:admin',
    };

    it('should log successful audit event with info level', async () => {
      const { auditLogger } = await import('@/libs/Logger');

      await audit(mockContext, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: 'test-member-789',
        status: 'success',
      });

      expect(auditLogger.info).toHaveBeenCalledTimes(1);
      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[AUDIT] member.create on member:test-member-789'),
        expect.objectContaining({
          audit: expect.objectContaining({
            userId: 'test-user-123',
            orgId: 'test-org-456',
            action: 'member.create',
            entityType: 'member',
            entityId: 'test-member-789',
            status: 'success',
          }),
        }),
      );
    });

    it('should log failed audit event with warn level', async () => {
      const { auditLogger } = await import('@/libs/Logger');

      await audit(mockContext, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
        status: 'failure',
        error: 'Database connection failed',
      });

      expect(auditLogger.warn).toHaveBeenCalledTimes(1);
      expect(auditLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[AUDIT] FAILED member.create'),
        expect.objectContaining({
          audit: expect.objectContaining({
            status: 'failure',
            error: 'Database connection failed',
          }),
        }),
      );
    });

    it('should include timestamp in audit event', async () => {
      const { auditLogger } = await import('@/libs/Logger');
      const beforeTime = Date.now();

      await audit(mockContext, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: 'test-member-123',
        status: 'success',
      });

      const afterTime = Date.now();

      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          audit: expect.objectContaining({
            timestamp: expect.any(Date),
          }),
        }),
      );

      // Verify the timestamp is within the expected range
      const call = vi.mocked(auditLogger.info).mock.calls[0] as unknown as [string, { audit: { timestamp: Date } }];
      const timestamp = call[1].audit.timestamp.getTime();

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should include optional fields when provided', async () => {
      const { auditLogger } = await import('@/libs/Logger');

      await audit(mockContext, AUDIT_ACTION.MEMBER_UPDATE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: 'test-member-789',
        status: 'success',
        changes: {
          firstName: { before: 'John', after: 'Jane' },
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
        requestId: 'req-123',
      });

      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          audit: expect.objectContaining({
            changes: { firstName: { before: 'John', after: 'Jane' } },
            ipAddress: '192.168.1.1',
            userAgent: 'Test Agent',
            requestId: 'req-123',
          }),
        }),
      );
    });

    it('should handle audit without entityId', async () => {
      const { auditLogger } = await import('@/libs/Logger');

      await audit(mockContext, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
        status: 'failure',
        error: 'Validation failed',
      });

      expect(auditLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[AUDIT] FAILED member.create on member by'),
        expect.anything(),
      );
    });

    it('should include role from context', async () => {
      const { auditLogger } = await import('@/libs/Logger');

      await audit(mockContext, AUDIT_ACTION.MEMBER_REMOVE, AUDIT_ENTITY_TYPE.MEMBER, {
        entityId: 'test-member-123',
        status: 'success',
      });

      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          audit: expect.objectContaining({
            role: 'org:admin',
          }),
        }),
      );
    });

    it('never throws when the logger transport fails (best-effort, must not alter the caller outcome)', async () => {
      const { auditLogger } = await import('@/libs/Logger');
      (auditLogger.info as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('logtape transport down');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        audit(mockContext, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
          entityId: 'm-1',
          status: 'success',
        }),
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('computeChanges', () => {
    it('should detect changes between objects', () => {
      const before = { firstName: 'John', lastName: 'Doe', age: 30 };
      const after = { firstName: 'Jane', lastName: 'Doe' };

      const changes = computeChanges(before, after);

      expect(changes).toEqual({
        firstName: { before: 'John', after: 'Jane' },
      });
    });

    it('should return undefined when no changes', () => {
      const before = { firstName: 'John', lastName: 'Doe' };
      const after = { firstName: 'John', lastName: 'Doe' };

      const changes = computeChanges(before, after);

      expect(changes).toBeUndefined();
    });

    it('should only track specified fields', () => {
      const before = { firstName: 'John', lastName: 'Doe', age: 30 };
      const after = { firstName: 'Jane', lastName: 'Smith', age: 31 };

      const changes = computeChanges(before, after, ['firstName']);

      expect(changes).toEqual({
        firstName: { before: 'John', after: 'Jane' },
      });
    });

    it('should handle undefined after values', () => {
      const before = { firstName: 'John', lastName: 'Doe' };
      const after = { firstName: undefined };

      const changes = computeChanges(before, after as Partial<typeof before>);

      expect(changes).toBeUndefined();
    });

    it('should handle null values', () => {
      const before = { firstName: 'John', lastName: null as string | null };
      const after = { firstName: 'Jane', lastName: 'Doe' as string | null };

      const changes = computeChanges(before, after);

      expect(changes).toEqual({
        firstName: { before: 'John', after: 'Jane' },
        lastName: { before: null, after: 'Doe' },
      });
    });

    it('should handle nested object changes (shallow comparison)', () => {
      const before = { name: 'John', address: { city: 'NYC' } };
      const after = { name: 'John', address: { city: 'LA' } };

      const changes = computeChanges(before, after);

      // Shallow comparison means different object references are detected
      expect(changes).toEqual({
        address: { before: { city: 'NYC' }, after: { city: 'LA' } },
      });
    });

    it('should handle empty objects', () => {
      const before = { firstName: 'John' };
      const after = {};

      const changes = computeChanges(before, after);

      expect(changes).toBeUndefined();
    });
  });
});
