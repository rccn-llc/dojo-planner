'use client';

import type { StaffMemberData } from '@/hooks/useInviteStaffForm';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { inviteStaffMember, updateStaffMember } from '@/actions/staff';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInviteStaffForm } from '@/hooks/useInviteStaffForm';
import { InviteStaffFormContent } from './InviteStaffFormContent';

type InviteStaffModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  staffMember?: StaffMemberData | null;
  onSaveSuccess?: () => void;
};

export const InviteStaffModal = ({
  isOpen,
  onCloseAction,
  staffMember,
  onSaveSuccess,
}: InviteStaffModalProps) => {
  const t = useTranslations('Staff.InviteStaffModal');
  const form = useInviteStaffForm(staffMember);
  const prevIsOpenRef = useRef(isOpen);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Determine if we're in edit mode
  const isEditMode = !!staffMember?.id;

  // Reset form and success message when modal closes
  const resetModalState = useCallback(() => {
    form.reset();
    setSuccessMessage(null);
  }, [form]);

  // Check if modal just closed and reset state
  if (prevIsOpenRef.current && !isOpen) {
    resetModalState();
  }
  prevIsOpenRef.current = isOpen;

  const handleSave = async () => {
    // Mark all fields as touched to show validation errors
    form.setAllTouched();

    if (!form.isValid()) {
      form.setError(t('validation_error'));
      return;
    }

    if (!form.data.roleKey) {
      form.setError(t('role_error'));
      return;
    }

    try {
      form.setIsLoading(true);
      form.clearError();
      setSuccessMessage(null);

      if (isEditMode && staffMember?.id) {
        // Update existing staff member
        console.info('[Staff] Updating staff member:', {
          timestamp: new Date().toISOString(),
          staffId: staffMember.id,
        });

        const result = await updateStaffMember({
          userId: staffMember.id,
          roleKey: form.data.roleKey,
          firstName: form.data.firstName,
          lastName: form.data.lastName,
        });

        if (!result.success) {
          form.setError(result.error || t('submit_error'));
          return;
        }

        console.info('[Staff] Staff member updated successfully');

        // Show success message before closing
        setSuccessMessage(t('changes_saved_success'));
      } else {
        // Send invitation to new staff member
        console.info('[Invite Staff] Sending invitation:', {
          timestamp: new Date().toISOString(),
          email: form.data.email,
          role: form.data.roleKey,
        });

        const result = await inviteStaffMember({
          emailAddress: form.data.email,
          roleKey: form.data.roleKey,
          firstName: form.data.firstName,
          lastName: form.data.lastName,
        });

        if (!result.success) {
          form.setError(result.error || t('submit_error'));
          return;
        }

        console.info('[Invite Staff] Invitation sent successfully:', {
          invitationId: result.invitationId,
        });

        // Show success message before closing
        setSuccessMessage(t('invitation_sent_success'));
      }

      // Call onSaveSuccess callback if provided
      if (onSaveSuccess) {
        onSaveSuccess();
      }

      // Close modal after a short delay to show success message
      setTimeout(() => {
        onCloseAction();
      }, 1500);
    } catch (error) {
      console.error('[Staff] Failed to save staff member:', error);
      form.setError(t('submit_error'));
    } finally {
      form.setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCloseAction()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? t('edit_title') : t('title')}
          </DialogTitle>
        </DialogHeader>

        <div className="py-6">
          {successMessage
            ? (
                <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950/30">
                  <p className="text-sm text-green-900 dark:text-green-200">
                    {successMessage}
                  </p>
                </div>
              )
            : (
                <InviteStaffFormContent
                  data={form.data}
                  onUpdate={form.updateData}
                  onSave={handleSave}
                  onCancel={onCloseAction}
                  isLoading={form.isLoading}
                  error={form.error}
                  roles={form.roles}
                  rolesLoading={form.rolesLoading}
                  rolesError={form.rolesError}
                  touched={form.touched}
                  onFieldBlur={form.setFieldTouched}
                  fieldErrors={form.fieldErrors}
                  isEditMode={isEditMode}
                />
              )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
