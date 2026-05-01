import { describe, expect, it } from 'vitest';
import {
  CreateTagValidation,
  DeleteTagValidation,
  TagEntityType,
  UpdateTagValidation,
} from './TagsValidation';

describe('TagsValidation', () => {
  describe('TagEntityType', () => {
    it.each(['class', 'membership', 'event'])('accepts %s', (value) => {
      expect(TagEntityType.safeParse(value).success).toBe(true);
    });

    it('rejects unknown entity types', () => {
      expect(TagEntityType.safeParse('catalog').success).toBe(false);
    });
  });

  describe('CreateTagValidation', () => {
    it('accepts a valid tag', () => {
      const result = CreateTagValidation.safeParse({
        entityType: 'class',
        name: 'Beginner',
        color: '#4f46e5',
      });

      expect(result.success).toBe(true);
    });

    it('accepts shorthand hex colors', () => {
      const result = CreateTagValidation.safeParse({
        entityType: 'class',
        name: 'Beginner',
        color: '#abc',
      });

      expect(result.success).toBe(true);
    });

    it('accepts a missing color (optional)', () => {
      const result = CreateTagValidation.safeParse({
        entityType: 'class',
        name: 'Beginner',
      });

      expect(result.success).toBe(true);
    });

    it('accepts null color', () => {
      const result = CreateTagValidation.safeParse({
        entityType: 'class',
        name: 'Beginner',
        color: null,
      });

      expect(result.success).toBe(true);
    });

    it('rejects an empty name', () => {
      const result = CreateTagValidation.safeParse({
        entityType: 'class',
        name: '',
      });

      expect(result.success).toBe(false);
    });

    it('rejects names longer than 64 characters', () => {
      const result = CreateTagValidation.safeParse({
        entityType: 'class',
        name: 'a'.repeat(65),
      });

      expect(result.success).toBe(false);
    });

    it('accepts names exactly 64 characters', () => {
      const result = CreateTagValidation.safeParse({
        entityType: 'class',
        name: 'a'.repeat(64),
      });

      expect(result.success).toBe(true);
    });

    it('rejects malformed hex colors', () => {
      const result = CreateTagValidation.safeParse({
        entityType: 'class',
        name: 'Beginner',
        color: 'red',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('UpdateTagValidation', () => {
    it('accepts a valid update', () => {
      const result = UpdateTagValidation.safeParse({
        id: 'tag-1',
        name: 'Updated',
        color: '#ff0000',
      });

      expect(result.success).toBe(true);
    });

    it('rejects an empty id', () => {
      const result = UpdateTagValidation.safeParse({
        id: '',
        name: 'Updated',
      });

      expect(result.success).toBe(false);
    });

    it('rejects an empty name', () => {
      const result = UpdateTagValidation.safeParse({
        id: 'tag-1',
        name: '',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('DeleteTagValidation', () => {
    it('accepts a non-empty id', () => {
      const result = DeleteTagValidation.safeParse({ id: 'tag-1' });

      expect(result.success).toBe(true);
    });

    it('rejects an empty id', () => {
      const result = DeleteTagValidation.safeParse({ id: '' });

      expect(result.success).toBe(false);
    });
  });
});
