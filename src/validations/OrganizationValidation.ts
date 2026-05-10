import * as z from 'zod';

export const UpdateLocationValidation = z.object({
  address: z.string().min(1).max(500),
  phone: z.string().min(1).max(40),
  email: z.string().email(),
  taxRate: z.number().min(0).max(100).multipleOf(0.01),
});

export type UpdateLocationInput = z.infer<typeof UpdateLocationValidation>;
