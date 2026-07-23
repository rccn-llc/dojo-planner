import * as z from 'zod';

/**
 * Shared postal-address schema. The DB columns (address.street/city/state/
 * zip_code/country) are NOT NULL, so require the components and bound their
 * length rather than accepting arbitrary/empty strings. Previously this shape
 * was re-declared byte-for-byte in MemberValidation and PaymentValidation.
 */
export const AddressValidation = z.object({
  street: z.string().min(1).max(200),
  apartment: z.string().max(100).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  zipCode: z.string().min(1).max(20),
  country: z.string().min(1).max(100),
});

export type AddressInput = z.infer<typeof AddressValidation>;
