import * as z from 'zod';

const MAX_NOTE_LENGTH = 2000;

export const ListNotesValidation = z.object({
  memberId: z.string().min(1),
});

export const CreateNoteValidation = z.object({
  memberId: z.string().min(1),
  content: z.string().min(1).max(MAX_NOTE_LENGTH),
});

export const UpdateNoteValidation = z.object({
  id: z.string().min(1),
  content: z.string().min(1).max(MAX_NOTE_LENGTH),
});

export const DeleteNoteValidation = z.object({
  id: z.string().min(1),
});
