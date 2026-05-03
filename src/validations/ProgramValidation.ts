import * as z from 'zod';

const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

const HexColor = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, 'Color must be a hex value like #4f46e5');

const ProgramShape = z.object({
  name: z.string().min(1).max(NAME_MAX),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  color: HexColor.nullable().optional(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).optional(),
});

export const CreateProgramValidation = ProgramShape;

export const UpdateProgramValidation = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(NAME_MAX),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  color: HexColor.nullable().optional(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).optional(),
});

export const DeleteProgramValidation = z.object({
  id: z.string().min(1),
});

export type CreateProgramInput = z.infer<typeof CreateProgramValidation>;
export type UpdateProgramInput = z.infer<typeof UpdateProgramValidation>;
