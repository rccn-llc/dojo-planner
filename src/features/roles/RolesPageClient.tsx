'use client';

import type { RoleFormData } from './AddEditRoleModal';
import type { RolesFilters } from './RolesFilterBar';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { client } from '@/libs/Orpc';
import { RoleCard } from '@/templates/RoleCard';
import { StatsCards } from '@/templates/StatsCards';
import { AddEditRoleModal } from './AddEditRoleModal';
import { DeleteRoleAlertDialog } from './DeleteRoleAlertDialog';
import { RolesFilterBar } from './RolesFilterBar';

type Permission = {
  id: string;
  key: string;
  name: string;
  description: string;
};

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  memberCount: number;
  isSystemRole: boolean;
};

type RolesPageClientProps = {
  roles: Role[];
  totalPermissions: number;
  availablePermissions: Permission[];
  currentUserRole: string;
};

// Admin role key for permission checks
const ADMIN_ROLE_KEY = 'org:admin';

export function RolesPageClient({ roles, totalPermissions, availablePermissions, currentUserRole }: RolesPageClientProps) {
  const t = useTranslations('Roles');
  const router = useRouter();
  const [filters, setFilters] = useState<RolesFilters>({
    search: '',
    permission: 'all',
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleFormData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingRole, setDeletingRole] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Check if current user is an admin (can delete any non-admin role)
  const isAdmin = currentUserRole === ADMIN_ROLE_KEY;

  // Determine if a role can be deleted by the current user
  // Admins can delete any role except the Admin role itself
  const canDeleteRole = useCallback((role: Role): boolean => {
    // Admin role cannot be deleted by anyone
    if (role.key === ADMIN_ROLE_KEY) {
      return false;
    }
    // Admins can delete any other role
    if (isAdmin) {
      return true;
    }
    // Non-admins can only delete non-system roles
    return !role.isSystemRole;
  }, [isAdmin]);

  const handleFiltersChange = useCallback((newFilters: RolesFilters) => {
    setFilters(newFilters);
  }, []);

  // Get unique permission names from all roles for filtering dropdown
  const filterPermissionOptions = useMemo(() => {
    const permissionsSet = new Set<string>();
    for (const role of roles) {
      for (const permission of role.permissions) {
        permissionsSet.add(permission.name);
      }
    }
    return Array.from(permissionsSet);
  }, [roles]);

  // Handler for opening the Add Role modal
  const handleAddRoleClick = useCallback(() => {
    setEditingRole(null);
    setSaveError(null);
    setIsModalOpen(true);
  }, []);

  // Handler for opening the Edit Role modal
  const handleEditRole = useCallback((id: string) => {
    const roleToEdit = roles.find(r => r.id === id);
    if (roleToEdit) {
      setEditingRole({
        id: roleToEdit.id,
        key: roleToEdit.key,
        name: roleToEdit.name,
        description: roleToEdit.description,
        permissions: roleToEdit.permissions,
        isSystemRole: roleToEdit.isSystemRole,
      });
      setSaveError(null);
      setIsModalOpen(true);
    }
  }, [roles]);

  // Handler for closing the modal
  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setEditingRole(null);
    setSaveError(null);
  }, []);

  // Handler for saving role (add or edit)
  const handleSaveRole = useCallback(async (data: RoleFormData) => {
    setIsLoading(true);
    setSaveError(null);
    try {
      // Clerk's BAPI for /organization_roles expects permission IDs (perm_xxx),
      // not permission keys — sending keys yields 404 "Organization permission not found".
      const permissionIds = data.permissions.map(p => p.id);
      if (data.id) {
        await client.roles.update({
          id: data.id,
          name: data.name,
          description: data.description,
          permissions: permissionIds,
        });
      } else {
        await client.roles.create({
          name: data.name,
          key: data.key,
          description: data.description,
          permissions: permissionIds,
        });
      }
      router.refresh();
      handleModalClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('save_error');
      setSaveError(message);
    } finally {
      setIsLoading(false);
    }
  }, [handleModalClose, router, t]);

  // Handler for opening delete confirmation dialog
  const handleDeleteRole = useCallback((id: string) => {
    const role = roles.find(r => r.id === id);
    if (role) {
      setDeletingRole({ id: role.id, name: role.name });
      setDeleteError(null);
    }
  }, [roles]);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeletingRole(null);
    setDeleteError(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingRole) {
      return;
    }
    setDeleteError(null);
    try {
      await client.roles.remove({ id: deletingRole.id });
      router.refresh();
      setDeletingRole(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('delete_error');
      setDeleteError(message);
    }
  }, [deletingRole, router, t]);

  // Filter roles based on search and permission filter
  const filteredRoles = useMemo(() => {
    return roles.filter((role) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = role.name.toLowerCase().includes(searchLower)
          || role.key.toLowerCase().includes(searchLower)
          || role.description.toLowerCase().includes(searchLower)
          || role.permissions.some(p => p.name.toLowerCase().includes(searchLower));
        if (!matchesSearch) {
          return false;
        }
      }

      // Permission filter
      if (filters.permission !== 'all') {
        const hasPermission = role.permissions.some(
          p => p.name === filters.permission,
        );
        if (!hasPermission) {
          return false;
        }
      }

      return true;
    });
  }, [roles, filters]);

  // Calculate total members across all displayed roles
  const totalMembers = useMemo(() => {
    return roles.reduce((sum, role) => sum + role.memberCount, 0);
  }, [roles]);

  const statsData = useMemo(() => [
    { id: 'roles', label: t('total_roles_label'), value: roles.length },
    { id: 'permissions', label: t('total_permissions_label'), value: totalPermissions },
    { id: 'members', label: t('total_members_label'), value: totalMembers },
  ], [roles.length, totalPermissions, totalMembers, t]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <StatsCards stats={statsData} columns={3} />

      {/* Header */}
      <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>

      {/* Filter Bar and Add Button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <RolesFilterBar
            onFiltersChangeAction={handleFiltersChange}
            availablePermissions={filterPermissionOptions}
          />
        </div>
        <Button onClick={handleAddRoleClick} data-testid="add-role-button">
          <Plus className="mr-2 size-4" />
          {t('add_role_button')}
        </Button>
      </div>

      {/* Permissions by Role Section */}
      <div>
        <h2 className="mb-6 text-2xl font-bold text-foreground">{t('permissions_by_role_title')}</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredRoles.length === 0
            ? (
                <div className="col-span-full p-8 text-center text-muted-foreground">
                  {t('no_roles_found')}
                </div>
              )
            : (
                filteredRoles.map(role => (
                  <RoleCard
                    key={role.id}
                    id={role.id}
                    name={role.name}
                    roleKey={role.key}
                    description={role.description}
                    permissions={role.permissions}
                    memberCount={role.memberCount}
                    isSystemRole={role.isSystemRole}
                    onEdit={handleEditRole}
                    onDelete={canDeleteRole(role) ? handleDeleteRole : undefined}
                  />
                ))
              )}
        </div>
      </div>

      {/* Add/Edit Role Modal */}
      <AddEditRoleModal
        isOpen={isModalOpen}
        onCloseAction={handleModalClose}
        onSaveAction={handleSaveRole}
        role={editingRole}
        availablePermissions={availablePermissions}
        isLoading={isLoading}
        canEditSystemRoles={isAdmin}
        errorMessage={saveError}
      />

      {/* Delete Role Confirmation Dialog */}
      <DeleteRoleAlertDialog
        isOpen={deletingRole !== null}
        roleName={deletingRole?.name ?? ''}
        onCloseAction={handleCloseDeleteDialog}
        onConfirmAction={handleConfirmDelete}
        errorMessage={deleteError}
      />
    </div>
  );
}
