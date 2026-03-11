'use client';

import type { StaffMemberData } from '@/hooks/useInviteStaffForm';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InviteStaffModal } from './InviteStaffModal';
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
  phone?: string | null;
};

type StaffPageClientProps = {
  staffMembers: StaffMember[];
  currentUserRole?: string;
  currentUserId?: string;
};

export function StaffPageClient({ staffMembers, currentUserRole, currentUserId }: StaffPageClientProps) {
  const t = useTranslations('Staff');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaffMember, setEditingStaffMember] = useState<StaffMemberData | null>(null);

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
    // TODO: Implement remove staff functionality
    console.warn('[Staff] Remove staff action triggered for staff ID:', staffId);
  };

  const handleSaveSuccess = () => {
    // TODO: Refresh the staff list after successful save
    // This would typically trigger a re-fetch of the data
    console.info('[Staff] Staff member saved successfully');
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
            <Plus className="mr-0.5 h-4 w-4" />
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
    </>
  );
}
