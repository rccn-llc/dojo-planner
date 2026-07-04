import { describe, expect, it } from 'vitest';
import { UpdateInstructorPhotoValidation } from './InstructorValidation';

describe('UpdateInstructorPhotoValidation', () => {
  const validPhoto = 'data:image/png;base64,AAAA';

  it('accepts a valid png data URL', () => {
    const result = UpdateInstructorPhotoValidation.parse({
      clerkUserId: 'u1',
      photoUrl: validPhoto,
    });

    expect(result.clerkUserId).toBe('u1');
    expect(result.photoUrl).toBe(validPhoto);
  });

  it('accepts a null photoUrl (clears the override)', () => {
    const result = UpdateInstructorPhotoValidation.parse({
      clerkUserId: 'u1',
      photoUrl: null,
    });

    expect(result.photoUrl).toBeNull();
  });

  it('rejects a non-data-url string', () => {
    expect(() => UpdateInstructorPhotoValidation.parse({
      clerkUserId: 'u1',
      photoUrl: 'https://example.com/photo.png',
    })).toThrow();
  });

  it('rejects a photoUrl larger than 300KB', () => {
    const tooBig = `data:image/png;base64,${'A'.repeat(300_001)}`;

    expect(() => UpdateInstructorPhotoValidation.parse({
      clerkUserId: 'u1',
      photoUrl: tooBig,
    })).toThrow();
  });

  it('rejects a missing clerkUserId', () => {
    expect(() => UpdateInstructorPhotoValidation.parse({
      photoUrl: validPhoto,
    })).toThrow();
  });

  it('rejects an empty clerkUserId', () => {
    expect(() => UpdateInstructorPhotoValidation.parse({
      clerkUserId: '',
      photoUrl: validPhoto,
    })).toThrow();
  });
});
