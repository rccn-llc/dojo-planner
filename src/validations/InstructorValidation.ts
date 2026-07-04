import { z } from 'zod';

/**
 * Input for uploading/clearing an in-app instructor photo override. Mirrors
 * the member photo constraints: a base64 data URL of a supported image type,
 * capped at ~300KB so request payloads stay manageable. `photoUrl: null`
 * clears the override.
 */
export const UpdateInstructorPhotoValidation = z.object({
  clerkUserId: z.string().min(1),
  photoUrl: z
    .string()
    .max(300_000, 'Photo data URL must be 300KB or less')
    .regex(/^data:image\/(jpeg|png|gif);base64,/, 'photoUrl must be a data URL for an image (jpeg, png, gif)')
    .nullable(),
});
