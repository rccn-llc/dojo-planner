import { describe, expect, it } from 'vitest';
import {
  CreateNoteValidation,
  DeleteNoteValidation,
  ListNotesValidation,
  UpdateNoteValidation,
} from './NotesValidation';

describe('NotesValidation', () => {
  describe('ListNotesValidation', () => {
    it('accepts a non-empty memberId', () => {
      const result = ListNotesValidation.safeParse({ memberId: 'member-1' });

      expect(result.success).toBe(true);
    });

    it('rejects an empty memberId', () => {
      const result = ListNotesValidation.safeParse({ memberId: '' });

      expect(result.success).toBe(false);
    });
  });

  describe('CreateNoteValidation', () => {
    it('accepts a valid note', () => {
      const result = CreateNoteValidation.safeParse({
        memberId: 'member-1',
        content: 'Hello world',
      });

      expect(result.success).toBe(true);
    });

    it('rejects content longer than 2000 characters', () => {
      const result = CreateNoteValidation.safeParse({
        memberId: 'member-1',
        content: 'a'.repeat(2001),
      });

      expect(result.success).toBe(false);
    });

    it('rejects empty content', () => {
      const result = CreateNoteValidation.safeParse({
        memberId: 'member-1',
        content: '',
      });

      expect(result.success).toBe(false);
    });

    it('accepts content exactly 2000 characters', () => {
      const result = CreateNoteValidation.safeParse({
        memberId: 'member-1',
        content: 'a'.repeat(2000),
      });

      expect(result.success).toBe(true);
    });
  });

  describe('UpdateNoteValidation', () => {
    it('accepts a valid update', () => {
      const result = UpdateNoteValidation.safeParse({
        id: 'note-1',
        content: 'Updated content',
      });

      expect(result.success).toBe(true);
    });

    it('rejects an empty id', () => {
      const result = UpdateNoteValidation.safeParse({
        id: '',
        content: 'Updated content',
      });

      expect(result.success).toBe(false);
    });

    it('rejects empty content', () => {
      const result = UpdateNoteValidation.safeParse({
        id: 'note-1',
        content: '',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('DeleteNoteValidation', () => {
    it('accepts a non-empty id', () => {
      const result = DeleteNoteValidation.safeParse({ id: 'note-1' });

      expect(result.success).toBe(true);
    });

    it('rejects an empty id', () => {
      const result = DeleteNoteValidation.safeParse({ id: '' });

      expect(result.success).toBe(false);
    });
  });
});
