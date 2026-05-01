import type { AuditContext } from '@/types/Audit';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG_ROLE } from '@/types/Auth';

vi.mock('@/libs/DB', () => ({ db: {} }));
vi.mock('./AuthGuards', () => ({
  guardRole: vi.fn(),
}));
vi.mock('@/services/AttendanceService', () => ({
  listAttendanceForMember: vi.fn(),
}));

const frontDeskContext: AuditContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: ORG_ROLE.FRONT_DESK,
};

function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

describe('Attendance Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('requires FRONT_DESK and forwards orgId to the service', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { listAttendanceForMember } = await import('@/services/AttendanceService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      const stub = [{ id: 'a1', className: 'BJJ', date: '2026-01-15', time: '18:00 – 19:00', instructor: 'N/A' }];
      vi.mocked(listAttendanceForMember).mockResolvedValue(stub);

      const { list } = await import('./Attendance');
      const result = await callHandler(list, { memberId: 'm1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(listAttendanceForMember).toHaveBeenCalledWith('m1', 'org-1');
      expect(result).toEqual({ records: stub });
    });

    it('returns an empty list when the service returns []', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { listAttendanceForMember } = await import('@/services/AttendanceService');
      vi.mocked(guardRole).mockResolvedValue(frontDeskContext);
      vi.mocked(listAttendanceForMember).mockResolvedValue([]);

      const { list } = await import('./Attendance');
      const result = await callHandler(list, { memberId: 'm-new' });

      expect(result).toEqual({ records: [] });
    });
  });
});
