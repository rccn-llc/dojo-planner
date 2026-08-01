'use client';

import type { StaffMemberData } from '@/hooks/useInviteStaffForm';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { removeStaffMember } from '@/actions/staff';
import { Button } from '@/components/ui/button';
import { InviteStaffModal } from './InviteStaffModal';
import { RemoveStaffAlertDialog } from './RemoveStaffAlertDialog';
import { StaffTable } from './StaffTable';

type StaffMember = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  photoUrl: string | null;
  emailAddress: string;
  role: string;
  status: 'Active' | 'Invitation sent' | 'Inactive';
};

type StaffPageClientProps = {
  staffMembers: StaffMember[];
  currentUserRole?: string;
  currentUserId?: string;
};

export function StaffPageClient({ staffMembers, currentUserRole, currentUserId }: StaffPageClientProps) {
  const t = useTranslations('Staff');
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaffMember, setEditingStaffMember] = useState<StaffMemberData | null>(null);
  const [removingStaff, setRemovingStaff] = useState<{ id: string; name: string } | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleOpenInviteModal = () => {
    setEditingStaffMember(null);
    setIsModalOpen(true);
  };

  const handleEditStaff = (staffMember: StaffMemberData) => {
    setEditingStaffMember(staffMember);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingStaffMember(null);
  };

  const handleRemoveStaff = (staffId: string) => {
    const member = staffMembers.find(m => m.id === staffId);
    if (!member) {
      return;
    }
    const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
    setRemovingStaff({ id: staffId, name });
    setRemoveError(null);
  };

  const handleConfirmRemove = async () => {
    if (!removingStaff) {
      return;
    }
    setIsRemoving(true);
    setRemoveError(null);
    try {
      const result = await removeStaffMember({ userId: removingStaff.id });
      if (!result.success) {
        setRemoveError(result.error ?? 'Failed to remove staff member.');
        return;
      }
      setRemovingStaff(null);
      // The Server Action calls revalidatePath, but a client-side router
      // refresh ensures the rendered page picks up the new data immediately.
      router.refresh();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove staff member.');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleCloseRemoveDialog = () => {
    if (isRemoving) {
      return;
    }
    setRemovingStaff(null);
    setRemoveError(null);
  };

  const handleSaveSuccess = () => {
    // Server Actions invalidate via revalidatePath; this triggers a client-side
    // re-render so the just-edited row reflects fresh data.
    router.refresh();
  };

  return (
    <>
      <StaffTable
        staffMembers={staffMembers}
        currentUserRole={currentUserRole}
        currentUserId={currentUserId}
        onEditStaff={handleEditStaff}
        onRemoveStaff={handleRemoveStaff}
        headerActions={(
          <Button data-testid="invite-staff-button" onClick={handleOpenInviteModal}>
            <Plus className="mr-0.5 size-4" />
            {t('invite_staff_button')}
          </Button>
        )}
      />
      <InviteStaffModal
        isOpen={isModalOpen}
        onCloseAction={handleCloseModal}
        staffMember={editingStaffMember}
        onSaveSuccess={handleSaveSuccess}
      />
      <RemoveStaffAlertDialog
        isOpen={!!removingStaff}
        staffName={removingStaff?.name ?? ''}
        onCloseAction={handleCloseRemoveDialog}
        onConfirmAction={handleConfirmRemove}
        errorMessage={removeError}
        isLoading={isRemoving}
      />
    </>
  );
}
