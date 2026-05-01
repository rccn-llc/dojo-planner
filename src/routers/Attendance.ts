import { os } from '@orpc/server';
import { listAttendanceForMember } from '@/services/AttendanceService';
import { ORG_ROLE } from '@/types/Auth';
import { ListAttendanceForMemberValidation } from '@/validations/AttendanceValidation';
import { guardRole } from './AuthGuards';

export const list = os
  .input(ListAttendanceForMemberValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
    const records = await listAttendanceForMember(input.memberId, orgId);
    return { records };
  });
