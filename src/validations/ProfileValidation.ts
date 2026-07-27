import * as z from 'zod';

export const ProfileValidation = z.object({
  firstName: z.string().min(1, 'first_name_required'),
  lastName: z.string().min(1, 'last_name_required'),
  email: z.string().min(1, 'email_required').email('email_invalid'),
});
