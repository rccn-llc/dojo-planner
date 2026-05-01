import * as z from 'zod';

export const ListAttendanceForMemberValidation = z.object({
  memberId: z.string().min(1),
});
