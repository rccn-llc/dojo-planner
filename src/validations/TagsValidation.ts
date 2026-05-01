import * as z from 'zod';

const TAG_NAME_MAX = 64;

export const TagEntityType = z.enum(['class', 'membership', 'event']);

// Hex color string. Accepts #RGB or #RRGGBB. Empty/null allowed because color is optional.
const HexColor = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, 'Color must be a hex value like #4f46e5');

export const CreateTagValidation = z.object({
  entityType: TagEntityType,
  name: z.string().min(1).max(TAG_NAME_MAX),
  color: HexColor.optional().nullable(),
});

export const UpdateTagValidation = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(TAG_NAME_MAX),
  color: HexColor.optional().nullable(),
});

export const DeleteTagValidation = z.object({
  id: z.string().min(1),
});
