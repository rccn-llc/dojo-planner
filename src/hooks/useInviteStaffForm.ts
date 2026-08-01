'use client';

import type { StaffRole } from '@/actions/staff';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchStaffRoles } from '@/actions/staff';

export type StaffMemberData = {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  roleKey: string | null;
};

export type InviteStaffFormData = StaffMemberData;

export type TouchedFields = {
  firstName: boolean;
  lastName: boolean;
  email: boolean;
  roleKey: boolean;
};

const defaultFormData: InviteStaffFormData = {
  firstName: '',
  lastName: '',
  email: '',
  roleKey: null,
};

const defaultTouched: TouchedFields = {
  firstName: false,
  lastName: false,
  email: false,
  roleKey: false,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

export const isValidEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(email);
};

// Helper to create form data from staff member
const createFormDataFromStaffMember = (staffMember: StaffMemberData): InviteStaffFormData => ({
  id: staffMember.id,
  firstName: staffMember.firstName,
  lastName: staffMember.lastName,
  email: staffMember.email,
  roleKey: staffMember.roleKey,
});

export const useInviteStaffForm = (initialData?: StaffMemberData | null) => {
  // Track the previous initialData to detect changes. This is state rather than
  // a ref because refs must not be read or written during render.
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevInitialData, setPrevInitialData] = useState<StaffMemberData | null | undefined>(initialData);

  // Initialize form data based on initial data (for edit mode)
  const initialFormData = useMemo((): InviteStaffFormData => {
    if (initialData) {
      return createFormDataFromStaffMember(initialData);
    }
    return defaultFormData;
  }, [initialData]);

  const [data, setData] = useState<InviteStaffFormData>(initialFormData);
  const [touched, setTouched] = useState<TouchedFields>(defaultTouched);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);

  // Determine if we're in edit mode
  const isEditMode = !!initialData?.id;

  // Fetch roles from Clerk on mount
  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    setRolesError(null);
    try {
      const result = await fetchStaffRoles();
      if (result.success && result.roles) {
        setRoles(result.roles);
      } else {
        setRolesError(result.error || 'Failed to load roles');
      }
    } catch (err) {
      console.error('[useInviteStaffForm] Failed to fetch roles:', err);
      setRolesError('Failed to load roles. Please try again.');
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadRoles();
    })();
  }, [loadRoles]);

  // Re-initialize form data when initialData changes (for opening edit modal).
  // Adjusting state during render is the supported alternative to a
  // synchronising effect; React re-runs this component immediately without
  // committing the intermediate render.
  if (prevInitialData !== initialData) {
    setPrevInitialData(initialData);
    if (initialData) {
      setData(createFormDataFromStaffMember(initialData));
      // Don't reset touched in edit mode - we want to show validation after save attempt
    } else {
      setData(defaultFormData);
      setTouched(defaultTouched);
    }
  }

  const updateData = (updates: Partial<InviteStaffFormData>) => {
    setData(prev => ({ ...prev, ...updates }));
    setError(null);
  };

  const setFieldTouched = useCallback((field: keyof TouchedFields) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  const setAllTouched = useCallback(() => {
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      roleKey: true,
    });
  }, []);

  const reset = useCallback(() => {
    setData(defaultFormData);
    setTouched(defaultTouched);
    setError(null);
    setIsLoading(false);
  }, []);

  const clearError = () => {
    setError(null);
  };

  // Field-level validation
  const fieldErrors = useMemo(() => ({
    firstName: data.firstName.trim() === '',
    lastName: data.lastName.trim() === '',
    email: !isValidEmail(data.email),
    roleKey: data.roleKey === null,
  }), [data]);

  const isValid = useCallback(() => {
    return (
      data.firstName.trim() !== ''
      && data.lastName.trim() !== ''
      && isValidEmail(data.email)
      && data.roleKey !== null
    );
  }, [data]);

  return {
    data,
    updateData,
    reset,
    error,
    setError,
    clearError,
    isLoading,
    setIsLoading,
    isValid,
    roles,
    rolesLoading,
    rolesError,
    reloadRoles: loadRoles,
    touched,
    setFieldTouched,
    setAllTouched,
    fieldErrors,
    isEditMode,
  };
};
