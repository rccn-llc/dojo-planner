import * as z from 'zod';

const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

// Clerk role keys are slugs prefixed with `org:`. The AddEditRoleModal's
// generateRoleKey() helper produces this exact shape.
const RoleKey = z
  .string()
  .min(1)
  .regex(/^org:[a-z0-9_]+$/, 'Role key must be in the form "org:lowercase_slug"');

// Permission keys come from Clerk and look like 'org:members:read'. We
// don't need to validate the full shape — only that they're non-empty
// strings — because the upstream API will reject anything malformed.
const PermissionKey = z.string().min(1);

export const CreateRoleValidation = z.object({
  name: z.string().min(1).max(NAME_MAX),
  key: RoleKey,
  description: z.string().max(DESCRIPTION_MAX),
  permissions: z.array(PermissionKey),
});

export const UpdateRoleValidation = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(NAME_MAX).optional(),
  description: z.string().max(DESCRIPTION_MAX).optional(),
  permissions: z.array(PermissionKey).optional(),
});

export const DeleteRoleValidation = z.object({
  id: z.string().min(1),
});

export type CreateRoleInput = z.infer<typeof CreateRoleValidation>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleValidation>;
