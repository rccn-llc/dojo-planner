'use client';

import type { StaffFilters } from './StaffFilterBar';
import type { StaffMemberData } from '@/hooks/useInviteStaffForm';
import { ArrowDownAZ, ArrowUpZA, Edit, ImageIcon, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StaffCard } from '@/templates/StaffCard';
import { EditInstructorPhotoModal } from './EditInstructorPhotoModal';
import { StaffFilterBar } from './StaffFilterBar';

// Roles whose members can have an in-app instructor photo (see InstructorsService).
const INSTRUCTOR_ROLES = new Set(['org:instructor', 'org:academy_owner']);

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

type StaffTableProps = {
  staffMembers: StaffMember[];
  currentUserRole?: string;
  currentUserId?: string;
  headerActions?: React.ReactNode;
  onEditStaff?: (staffMember: StaffMemberData) => void;
  onRemoveStaff?: (staffId: string) => void;
};

type SortField = 'firstName' | 'role';
type SortDirection = 'asc' | 'desc';

export function StaffTable({
  staffMembers,
  currentUserRole,
  currentUserId,
  headerActions,
  onEditStaff,
  onRemoveStaff,
}: StaffTableProps) {
  const t = useTranslations('Staff');
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>('firstName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<StaffFilters>({
    search: '',
    role: 'all',
  });
  const [photoEditing, setPhotoEditing] = useState<StaffMember | null>(null);

  // Compute available roles from actual staff data
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    staffMembers.forEach((member) => {
      if (member.role) {
        roles.add(member.role);
      }
    });
    return Array.from(roles).sort();
  }, [staffMembers]);

  const handleFiltersChange = (newFilters: StaffFilters) => {
    setFilters(newFilters);
  };

  // Filter staff members based on search and role
  const filteredStaff = useMemo(() => {
    return staffMembers.filter((member) => {
      // Search filter - checks multiple fields
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = filters.search === ''
        || (member.firstName?.toLowerCase().includes(searchLower))
        || (member.lastName?.toLowerCase().includes(searchLower))
        || member.email.toLowerCase().includes(searchLower);

      // Role filter
      const matchesRole = filters.role === 'all' || member.role === filters.role;

      return matchesSearch && matchesRole;
    });
  }, [staffMembers, filters]);

  const handleEditStaff = (staff: StaffMember) => {
    if (onEditStaff) {
      onEditStaff({
        id: staff.id,
        firstName: staff.firstName || '',
        lastName: staff.lastName || '',
        email: staff.email,
        roleKey: staff.role,
      });
    } else {
      console.warn('[Staff] Edit staff action triggered for staff ID:', staff.id);
    }
  };

  const handleRemoveStaff = (staffId: string) => {
    if (onRemoveStaff) {
      onRemoveStaff(staffId);
    } else {
      console.warn('[Staff] Remove staff action triggered for staff ID:', staffId);
    }
  };

  const sortedStaff = [...filteredStaff].sort((a, b) => {
    let aValue: string;
    let bValue: string;

    switch (sortField) {
      case 'firstName':
        aValue = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase();
        bValue = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase();
        break;
      case 'role':
        aValue = a.role.toLowerCase();
        bValue = b.role.toLowerCase();
        break;
      default:
        aValue = '';
        bValue = '';
    }

    if (aValue < bValue) {
      return sortDirection === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortDirection === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getInitials = (firstName: string | null, lastName: string | null) => {
    if (!firstName || !lastName) {
      return '?';
    }
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  };

  const formatRole = (role: string): string => {
    const roleMap: Record<string, string> = {
      'org:admin': 'Admin',
      'org:academy_owner': 'Academy Owner',
      'org:front_desk': 'Front Desk',
      'org:instructor': 'Instructor',
      'org:member': 'Member',
      'org:individual_member': 'Individual Member',
    };
    if (roleMap[role]) {
      return roleMap[role];
    }
    return role
      .replace(/^org:/, '')
      .split(/[_-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getRoleVariant = (role: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (role === 'org:admin') {
      return 'default';
    }
    return 'outline';
  };

  const getStatusVariant = (): 'default' | 'secondary' | 'destructive' | 'outline' => {
    return 'outline';
  };

  const canManageStaff = (staff: StaffMember) => {
    if (staff.id === currentUserId) {
      return false;
    }
    if (currentUserRole === 'org:admin') {
      return true;
    }
    return staff.role !== 'org:admin';
  };

  // Determine if we should show "no results" vs "no staff members"
  const hasFiltersApplied = filters.search !== '' || filters.role !== 'all';
  const showNoResults = hasFiltersApplied && filteredStaff.length === 0 && staffMembers.length > 0;

  return (
    <>
      <div className="w-full space-y-6">
        {/* Search and Filter Bar */}
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex-1">
              <StaffFilterBar
                onFiltersChangeAction={handleFiltersChange}
                availableRoles={availableRoles}
              />
            </div>
            {headerActions}
          </div>

          {/* Staff Table - Desktop View */}
          <div className="hidden rounded-lg border border-border bg-background lg:block">
            {filteredStaff.length === 0
              ? (
                  <div className="p-8 text-center text-muted-foreground">
                    {showNoResults ? t('no_results_found') : t('no_staff_members')}
                  </div>
                )
              : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-secondary">
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('firstName')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              Staff member name
                              {sortField === 'firstName' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="h-4 w-4" />
                                  : <ArrowUpZA className="h-4 w-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('role')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              Role
                              {sortField === 'role' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="h-4 w-4" />
                                  : <ArrowUpZA className="h-4 w-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedStaff.map(staff => (
                          <tr key={staff.id} className="border-b border-border hover:bg-secondary/30">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 shrink-0">
                                  {staff.photoUrl && (
                                    <AvatarImage src={staff.photoUrl} alt={`${staff.firstName} ${staff.lastName}`} />
                                  )}
                                  <AvatarFallback>
                                    {getInitials(staff.firstName, staff.lastName)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">
                                    {staff.firstName}
                                    {' '}
                                    {staff.lastName}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{staff.email}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <Badge variant={getRoleVariant(staff.role)}>
                                {formatRole(staff.role)}
                              </Badge>
                            </td>
                            <td className="px-6 py-4">
                              <Badge variant={getStatusVariant()}>
                                {staff.status}
                              </Badge>
                            </td>
                            <td className="px-6 py-4">
                              {canManageStaff(staff) && (
                                <div className="flex items-center gap-2">
                                  {INSTRUCTOR_ROLES.has(staff.role) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setPhotoEditing(staff)}
                                      aria-label={t('edit_photo_aria', { name: `${staff.firstName} ${staff.lastName}` })}
                                      title={t('edit_photo_aria', { name: `${staff.firstName} ${staff.lastName}` })}
                                    >
                                      <ImageIcon className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditStaff(staff)}
                                    aria-label={`Edit ${staff.firstName} ${staff.lastName}`}
                                    title={`Edit ${staff.firstName} ${staff.lastName}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleRemoveStaff(staff.id)}
                                    aria-label={`Remove ${staff.firstName} ${staff.lastName}`}
                                    title={`Remove ${staff.firstName} ${staff.lastName}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
          </div>

          {/* Staff Cards - Mobile View */}
          <div className="space-y-4 lg:hidden">
            {filteredStaff.length === 0
              ? (
                  <div className="p-8 text-center text-muted-foreground">
                    {showNoResults ? t('no_results_found') : t('no_staff_members')}
                  </div>
                )
              : (
                  sortedStaff.map(staff => (
                    <StaffCard
                      key={staff.id}
                      id={staff.id}
                      firstName={staff.firstName}
                      lastName={staff.lastName}
                      email={staff.email}
                      photoUrl={staff.photoUrl}
                      emailAddress={staff.emailAddress}
                      role={staff.role}
                      status={staff.status}
                      onEdit={canManageStaff(staff) ? () => handleEditStaff(staff) : undefined}
                      onRemove={canManageStaff(staff) ? handleRemoveStaff : undefined}
                    />
                  ))
                )}
          </div>
        </div>
      </div>

      {photoEditing && (
        <EditInstructorPhotoModal
          isOpen={!!photoEditing}
          clerkUserId={photoEditing.id}
          instructorName={[photoEditing.firstName, photoEditing.lastName].filter(Boolean).join(' ') || photoEditing.email}
          currentPhotoUrl={photoEditing.photoUrl}
          onCloseAction={() => setPhotoEditing(null)}
          onSavedAction={() => {
            setPhotoEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
