import type { InviteStaffFormData } from './useInviteStaffForm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useInviteStaffForm } from './useInviteStaffForm';

// Mock the server action
vi.mock('@/actions/staff', () => ({
  fetchStaffRoles: vi.fn(() => Promise.resolve({
    success: true,
    roles: [
      { id: 'role_1', key: 'org:admin', name: 'Admin', description: 'Full access to all features' },
      { id: 'role_2', key: 'org:instructor', name: 'Instructor', description: 'Can manage classes' },
      { id: 'role_3', key: 'org:front_desk', name: 'Front Desk', description: 'Reception duties' },
    ],
  })),
}));

describe('useInviteStaffForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('should have default empty form data', async () => {
      const { result } = await renderHook(() => useInviteStaffForm());

      expect(result.current.data.firstName).toBe('');
      expect(result.current.data.lastName).toBe('');
      expect(result.current.data.email).toBe('');
      expect(result.current.data.roleKey).toBeNull();
    });

    it('should have no error initially', async () => {
      const { result } = await renderHook(() => useInviteStaffForm());

      expect(result.current.error).toBeNull();
    });

    it('should not be loading initially after roles load', async () => {
      const { result } = await renderHook(() => useInviteStaffForm());

      expect(result.current.isLoading).toBe(false);
    });

    it('should fetch roles on mount', async () => {
      const { result } = await renderHook(() => useInviteStaffForm());

      expect(result.current.roles).toHaveLength(3);
      expect(result.current.roles[0]?.key).toBe('org:admin');
    });
  });

  describe('updateData', () => {
    it('should update firstName', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({ firstName: 'John' });
      });

      expect(result.current.data.firstName).toBe('John');
    });

    it('should update lastName', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({ lastName: 'Doe' });
      });

      expect(result.current.data.lastName).toBe('Doe');
    });

    it('should update email', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({ email: 'john@example.com' });
      });

      expect(result.current.data.email).toBe('john@example.com');
    });

    it('should update roleKey', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({ roleKey: 'org:admin' });
      });

      expect(result.current.data.roleKey).toBe('org:admin');
    });

    it('should update multiple fields at once', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        });
      });

      expect(result.current.data.firstName).toBe('Jane');
      expect(result.current.data.lastName).toBe('Smith');
      expect(result.current.data.email).toBe('jane@example.com');
    });

    it('should clear error when updating data', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.setError('Some error');
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.updateData({ firstName: 'John' });
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('isValid', () => {
    it('should return false for empty form', async () => {
      const { result } = await renderHook(() => useInviteStaffForm());

      expect(result.current.isValid()).toBe(false);
    });

    it('should return false if firstName is missing', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({
          lastName: 'Doe',
          email: 'john@example.com',
          roleKey: 'org:admin',
        });
      });

      expect(result.current.isValid()).toBe(false);
    });

    it('should return false if lastName is missing', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({
          firstName: 'John',
          email: 'john@example.com',
          roleKey: 'org:admin',
        });
      });

      expect(result.current.isValid()).toBe(false);
    });

    it('should return false if email is invalid', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({
          firstName: 'John',
          lastName: 'Doe',
          email: 'invalid-email',
          roleKey: 'org:admin',
        });
      });

      expect(result.current.isValid()).toBe(false);
    });

    it('should return false if roleKey is null', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        });
      });

      expect(result.current.isValid()).toBe(false);
    });

    it('should return true for valid complete form', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          roleKey: 'org:admin',
        });
      });

      expect(result.current.isValid()).toBe(true);
    });

    it('should validate email format correctly', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      const baseData = {
        firstName: 'John',
        lastName: 'Doe',
        roleKey: 'org:admin',
      };

      // Invalid emails
      const invalidEmails = ['notanemail', 'missing@', '@nodomain.com', 'spaces in@email.com'];
      for (const email of invalidEmails) {
        act(() => {
          result.current.updateData({ ...baseData, email });
        });

        expect(result.current.isValid()).toBe(false);
      }

      // Valid emails
      const validEmails = ['valid@example.com', 'user.name@domain.org', 'test+tag@mail.co'];
      for (const email of validEmails) {
        act(() => {
          result.current.updateData({ ...baseData, email });
        });

        expect(result.current.isValid()).toBe(true);
      }
    });
  });

  describe('reset', () => {
    it('should reset form to default values', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          roleKey: 'org:admin',
        });
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.data.firstName).toBe('');
      expect(result.current.data.lastName).toBe('');
      expect(result.current.data.email).toBe('');
      expect(result.current.data.roleKey).toBeNull();
    });

    it('should clear error on reset', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.setError('Some error');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
    });

    it('should reset loading state on reset', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.setIsLoading(true);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should set error', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.setError('Validation error');
      });

      expect(result.current.error).toBe('Validation error');
    });

    it('should clear error', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.setError('Some error');
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('loading state', () => {
    it('should set loading state', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.setIsLoading(true);
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.setIsLoading(false);
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('roles management', () => {
    it('should have roles after loading', async () => {
      const { result } = await renderHook(() => useInviteStaffForm());

      expect(result.current.roles).toHaveLength(3);
      expect(result.current.roles[0]).toEqual({
        id: 'role_1',
        key: 'org:admin',
        name: 'Admin',
        description: 'Full access to all features',
      });
    });

    it('should expose reloadRoles function', async () => {
      const { result } = await renderHook(() => useInviteStaffForm());

      expect(typeof result.current.reloadRoles).toBe('function');
    });
  });

  describe('touched state management', () => {
    it('should have all fields untouched initially', async () => {
      const { result } = await renderHook(() => useInviteStaffForm());

      expect(result.current.touched.firstName).toBe(false);
      expect(result.current.touched.lastName).toBe(false);
      expect(result.current.touched.email).toBe(false);
      expect(result.current.touched.roleKey).toBe(false);
    });

    it('should set field as touched', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.setFieldTouched('firstName');
      });

      expect(result.current.touched.firstName).toBe(true);
      expect(result.current.touched.lastName).toBe(false);
    });

    it('should reset touched state on reset', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.setFieldTouched('firstName');
        result.current.setFieldTouched('email');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.touched.firstName).toBe(false);
      expect(result.current.touched.email).toBe(false);
    });
  });

  describe('field errors', () => {
    it('should show error for empty touched firstName', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.setFieldTouched('firstName');
      });

      expect(result.current.fieldErrors.firstName).toBe(true);
    });

    it('should not show error for filled touched firstName', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({ firstName: 'John' });
        result.current.setFieldTouched('firstName');
      });

      expect(result.current.fieldErrors.firstName).toBe(false);
    });

    it('should show error for invalid email when touched', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({ email: 'invalid' });
        result.current.setFieldTouched('email');
      });

      expect(result.current.fieldErrors.email).toBe(true);
    });

    it('should not show error for valid email when touched', async () => {
      const { result, act } = await renderHook(() => useInviteStaffForm());

      act(() => {
        result.current.updateData({ email: 'valid@example.com' });
        result.current.setFieldTouched('email');
      });

      expect(result.current.fieldErrors.email).toBe(false);
    });
  });

  describe('edit mode', () => {
    it('should not be in edit mode initially', async () => {
      const { result } = await renderHook(() => useInviteStaffForm());

      expect(result.current.isEditMode).toBe(false);
    });

    it('should be in edit mode when initial data has id', async () => {
      const initialData = {
        id: 'user_123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        roleKey: 'org:admin',
      };

      const { result } = await renderHook(() => useInviteStaffForm(initialData));

      expect(result.current.isEditMode).toBe(true);
      expect(result.current.data.firstName).toBe('John');
      expect(result.current.data.lastName).toBe('Doe');
      expect(result.current.data.email).toBe('john@example.com');
    });
  });
});

describe('InviteStaffFormData type', () => {
  it('should export InviteStaffFormData type', () => {
    const testData: InviteStaffFormData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      roleKey: 'org:admin',
    };

    expect(testData.firstName).toBe('John');
    expect(testData.lastName).toBe('Doe');
    expect(testData.email).toBe('john@example.com');
    expect(testData.roleKey).toBe('org:admin');
  });

  it('should allow null roleKey', () => {
    const testData: InviteStaffFormData = {
      firstName: '',
      lastName: '',
      email: '',
      roleKey: null,
    };

    expect(testData.roleKey).toBeNull();
  });

  it('should allow empty strings for text fields', () => {
    const testData: InviteStaffFormData = {
      firstName: '',
      lastName: '',
      email: '',
      roleKey: null,
    };

    expect(testData.firstName).toBe('');
    expect(testData.lastName).toBe('');
    expect(testData.email).toBe('');
  });
});
