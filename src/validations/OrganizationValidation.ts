import * as z from 'zod';

export const UpdateLocationValidation = z.object({
  name: z.string().min(1).max(120),
  address: z.string().min(1).max(500),
  phone: z.string().min(1).max(40),
  email: z.string().email(),
});

export type UpdateLocationInput = z.infer<typeof UpdateLocationValidation>;
