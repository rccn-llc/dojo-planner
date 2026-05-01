import { describe, expect, it } from 'vitest';
import { ListAttendanceForMemberValidation } from './AttendanceValidation';

describe('AttendanceValidation', () => {
  describe('ListAttendanceForMemberValidation', () => {
    it('accepts a valid memberId', () => {
      const result = ListAttendanceForMemberValidation.safeParse({ memberId: 'member-123' });

      expect(result.success).toBe(true);
    });

    it('rejects an empty memberId', () => {
      const result = ListAttendanceForMemberValidation.safeParse({ memberId: '' });

      expect(result.success).toBe(false);
    });

    it('rejects a missing memberId', () => {
      const result = ListAttendanceForMemberValidation.safeParse({});

      expect(result.success).toBe(false);
    });
  });
});
