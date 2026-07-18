import type { AuditContext } from '@/types/Audit';
import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('./AuthGuards', () => ({ guardRole: vi.fn() }));
vi.mock('@/services/AuditService', () => ({ audit: vi.fn() }));
vi.mock('@/services/EventsService', async () => {
  // Preserve the real error classes so instanceof checks in the router work.
  const actual = await vi.importActual<typeof import('@/services/EventsService')>('@/services/EventsService');
  return {
    ...actual,
    registerMemberForEvent: vi.fn(),
    getEventRegistrations: vi.fn(),
    cancelEventRegistration: vi.fn(),
  };
});

const mockContext: AuditContext = {
  userId: 'test-user-123',
  orgId: 'test-org-456',
  role: 'org:front_desk',
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('Events Router — registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('registers a member, forwards the input, and audits success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { audit } = await import('@/services/AuditService');
      const { registerMemberForEvent } = await import('@/services/EventsService');
      const registrant = { id: 'reg-1', memberId: 'mem-1', firstName: 'Jane', lastName: 'Doe', email: 'j@e.com', photoUrl: null, status: 'registered', amountPaid: 40, tierName: 'Early Bird', registeredAt: new Date() };

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(registerMemberForEvent).mockResolvedValue(registrant);

      const { register } = await import('./Events');
      const result = await callHandler(register, {
        eventId: 'ev-1',
        memberId: 'mem-1',
        eventBillingId: 'tier-1',
        amountPaid: 40,
        transactionId: 'tx-1',
      });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(registerMemberForEvent).toHaveBeenCalledWith(
        { eventId: 'ev-1', memberId: 'mem-1', eventBillingId: 'tier-1', amountPaid: 40, transactionId: 'tx-1' },
        'test-org-456',
      );
      expect(audit).toHaveBeenCalledWith(mockContext, AUDIT_ACTION.EVENT_REGISTRATION_CREATE, AUDIT_ENTITY_TYPE.EVENT_REGISTRATION, {
        entityId: 'reg-1',
        status: 'success',
      });
      expect(result).toEqual({ registrant });
    });

    it('maps MemberAlreadyRegisteredError to a 409 and audits failure', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { audit } = await import('@/services/AuditService');
      const { registerMemberForEvent, MemberAlreadyRegisteredError } = await import('@/services/EventsService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(registerMemberForEvent).mockRejectedValue(new MemberAlreadyRegisteredError());

      const { register } = await import('./Events');

      await expect(callHandler(register, { eventId: 'ev-1', memberId: 'mem-1' })).rejects.toMatchObject({ status: 409 });
      expect(audit).toHaveBeenCalledWith(mockContext, AUDIT_ACTION.EVENT_REGISTRATION_CREATE, AUDIT_ENTITY_TYPE.EVENT_REGISTRATION, expect.objectContaining({ status: 'failure' }));
    });

    it('maps EventNotFoundError to a 404', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { registerMemberForEvent, EventNotFoundError } = await import('@/services/EventsService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(registerMemberForEvent).mockRejectedValue(new EventNotFoundError());

      const { register } = await import('./Events');

      await expect(callHandler(register, { eventId: 'ev-1', memberId: 'mem-1' })).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('registrations', () => {
    it('lists registrants for the event', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getEventRegistrations } = await import('@/services/EventsService');
      const registrants = [{ id: 'reg-1', memberId: 'mem-1', firstName: 'Jane', lastName: 'Doe', email: 'j@e.com', photoUrl: null, status: 'registered', amountPaid: 40, tierName: null, registeredAt: new Date() }];

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(getEventRegistrations).mockResolvedValue(registrants);

      const { registrations } = await import('./Events');
      const result = await callHandler(registrations, { eventId: 'ev-1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getEventRegistrations).toHaveBeenCalledWith('ev-1', 'test-org-456');
      expect(result).toEqual({ registrants });
    });
  });

  describe('cancelRegistration', () => {
    it('cancels a registration and audits success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { audit } = await import('@/services/AuditService');
      const { cancelEventRegistration } = await import('@/services/EventsService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(cancelEventRegistration).mockResolvedValue(true);

      const { cancelRegistration } = await import('./Events');
      const result = await callHandler(cancelRegistration, { id: 'reg-1' });

      expect(cancelEventRegistration).toHaveBeenCalledWith('reg-1', 'test-org-456');
      expect(audit).toHaveBeenCalledWith(mockContext, AUDIT_ACTION.EVENT_REGISTRATION_CANCEL, AUDIT_ENTITY_TYPE.EVENT_REGISTRATION, {
        entityId: 'reg-1',
        status: 'success',
      });
      expect(result).toEqual({ success: true });
    });

    it('throws 404 when the registration is missing', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { cancelEventRegistration } = await import('@/services/EventsService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(cancelEventRegistration).mockResolvedValue(false);

      const { cancelRegistration } = await import('./Events');

      await expect(callHandler(cancelRegistration, { id: 'missing' })).rejects.toBeInstanceOf(ORPCError);
    });
  });
});
