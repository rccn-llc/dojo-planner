'use client';

import type { MemberFilters } from './MemberFilterBar';
import { ArrowDown01, ArrowDownAZ, ArrowUp10, ArrowUpZA } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination/Pagination';
import { Spinner } from '@/components/ui/spinner';
import { MemberCard } from '@/templates/MemberCard';
import { StatsCards } from '@/templates/StatsCards';
import { MemberFilterBar } from './MemberFilterBar';

type Member = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  dateOfBirth: Date | null;
  photoUrl: string | null;
  memberType: string | null;
  lastAccessedAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  create_organization_enabled?: boolean;
  membershipType?: 'free' | 'free-trial' | 'monthly' | 'annual';
  amountDue?: string;
  nextPayment?: Date;
};

type MembersTableProps = {
  members: Member[];
  onRowClickAction: (memberId: string) => void;
  loading?: boolean;
  headerActions?: React.ReactNode;
  initialPage?: number;
  onPageChangeAction?: (page: number) => void;
};

type SortField = 'firstName' | 'membershipType' | 'amountDue' | 'nextPayment' | 'status' | 'lastAccessedAt';
type SortDirection = 'asc' | 'desc';

export function MembersTable({
  members,
  onRowClickAction,
  loading = false,
  headerActions,
  initialPage = 0,
  onPageChangeAction,
}: MembersTableProps) {
  const [filters, setFilters] = useState<MemberFilters>({
    search: '',
    status: 'all',
    membershipType: 'all',
  });
  const [sortField, setSortField] = useState<SortField>('firstName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(initialPage);
  const ROWS_PER_PAGE = 10;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    onPageChangeAction?.(page);
  };

  const handleFiltersChange = (newFilters: MemberFilters) => {
    setFilters(newFilters);
    handlePageChange(0);
  };

  // Compute available statuses from actual member data
  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>();
    members.forEach((member) => {
      if (member.status) {
        statuses.add(member.status);
      }
    });
    return Array.from(statuses).sort();
  }, [members]);

  // Compute available member types from actual member data
  const availableMembershipTypes = useMemo(() => {
    const types = new Set<string>();
    members.forEach((member) => {
      if (member.memberType) {
        types.add(member.memberType);
      }
    });
    return Array.from(types).sort();
  }, [members]);

  const filteredMembers = members.filter((member) => {
    // Search filter
    const searchLower = filters.search.toLowerCase();
    const matchesSearch = filters.search === ''
      || (member.firstName?.toLowerCase().includes(searchLower))
      || (member.lastName?.toLowerCase().includes(searchLower))
      || member.email.toLowerCase().includes(searchLower)
      || (member.phone?.toLowerCase().includes(searchLower));

    // Status filter
    const matchesStatus = filters.status === 'all' || member.status === filters.status;

    // Member type filter
    const matchesMembershipType = filters.membershipType === 'all'
      || member.memberType === filters.membershipType;

    return matchesSearch && matchesStatus && matchesMembershipType;
  });

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    let aValue: string | number | Date | null | undefined;
    let bValue: string | number | Date | null | undefined;

    switch (sortField) {
      case 'firstName':
        aValue = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase();
        bValue = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase();
        break;
      case 'membershipType':
        aValue = a.memberType || '';
        bValue = b.memberType || '';
        break;
      case 'amountDue':
        aValue = a.amountDue ? Number.parseFloat(a.amountDue) : 0;
        bValue = b.amountDue ? Number.parseFloat(b.amountDue) : 0;
        break;
      case 'nextPayment':
        aValue = a.nextPayment ? new Date(a.nextPayment).getTime() : 0;
        bValue = b.nextPayment ? new Date(b.nextPayment).getTime() : 0;
        break;
      case 'status':
        aValue = a.status.toLowerCase();
        bValue = b.status.toLowerCase();
        break;
      case 'lastAccessedAt':
        aValue = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0;
        bValue = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0;
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

  const totalPages = Math.ceil(sortedMembers.length / ROWS_PER_PAGE);
  const paginatedMembers = sortedMembers.slice(
    currentPage * ROWS_PER_PAGE,
    (currentPage + 1) * ROWS_PER_PAGE,
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    handlePageChange(0);
  };

  const stats = useMemo(() => ({
    totalMembers: members.length,
    totalCancelled: members.filter(m => m.status === 'cancelled').length,
    totalOnHold: members.filter(m => m.status === 'hold').length,
    paidMembers: members.filter(m => m.membershipType === 'monthly' || m.membershipType === 'annual').length,
    freeMembers: members.filter(m => m.membershipType === 'free-trial').length,
  }), [members]);

  const getInitials = (firstName: string | null, lastName: string | null) => {
    if (!firstName || !lastName) {
      return '?';
    }
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) {
      return '-';
    }
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    const timeZone = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
    }).formatToParts(d).find(part => part.type === 'timeZoneName')?.value || '';

    return `${month}/${day}/${year} ${hours}${minutes} ${timeZone}`;
  };

  const formatCurrency = (amount: string | undefined) => {
    if (!amount) {
      return '-';
    }
    return Number.parseFloat(amount).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const getStatusColor = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'active':
        return 'default';
      case 'trial':
        return 'outline';
      case 'hold':
        return 'secondary';
      case 'cancelled':
      case 'past_due':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'past_due':
        return 'Past Due';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getMemberTypeLabel = (memberType: string | null | undefined) => {
    switch (memberType) {
      case 'individual':
        return 'Individual';
      case 'head-of-household':
        return 'Head of Household';
      case 'family-member':
        return 'Family Member';
      default:
        return '-';
    }
  };

  const getMemberTypeVariant = (memberType: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (memberType) {
      case 'head-of-household':
        return 'default';
      case 'family-member':
        return 'outline';
      case 'individual':
      default:
        return 'secondary';
    }
  };

  const statsData = useMemo(() => [
    { id: 'total', label: 'Total members', value: stats.totalMembers },
    { id: 'cancelled', label: 'Total cancelled', value: stats.totalCancelled },
    { id: 'paid', label: 'Paid members', value: stats.paidMembers },
    { id: 'free', label: 'Free members', value: stats.freeMembers },
  ], [stats]);

  return (
    <div className="w-full space-y-6">
      {/* Summary Cards */}
      <StatsCards stats={statsData} columns={4} />

      {/* Header */}
      <h1 className="text-3xl font-bold text-foreground">Members</h1>

      {/* Search and Filter Bar */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex-1">
            <MemberFilterBar
              onFiltersChangeAction={handleFiltersChange}
              availableStatuses={availableStatuses}
              availableMembershipTypes={availableMembershipTypes}
            />
          </div>
          {headerActions}
        </div>

        {/* Members Table - Desktop View */}
        <div className="hidden rounded-lg border border-border bg-background lg:block">
          {loading
            ? (
                <div className="flex flex-col items-center justify-center gap-3 p-8">
                  <Spinner size="lg" />
                  <p className="text-sm text-muted-foreground">Loading members...</p>
                </div>
              )
            : filteredMembers.length === 0
              ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No members found
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
                              Member name
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
                              onClick={() => handleSort('membershipType')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              Member type
                              {sortField === 'membershipType' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="h-4 w-4" />
                                  : <ArrowUpZA className="h-4 w-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('amountDue')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              Amount due
                              {sortField === 'amountDue' && (
                                sortDirection === 'asc'
                                  ? <ArrowDown01 className="h-4 w-4" />
                                  : <ArrowUp10 className="h-4 w-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('nextPayment')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              Next payment
                              {sortField === 'nextPayment' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="h-4 w-4" />
                                  : <ArrowUpZA className="h-4 w-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('status')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              Status
                              {sortField === 'status' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="h-4 w-4" />
                                  : <ArrowUpZA className="h-4 w-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('lastAccessedAt')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              Last visited
                              {sortField === 'lastAccessedAt' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="h-4 w-4" />
                                  : <ArrowUpZA className="h-4 w-4" />
                              )}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedMembers.map(member => (
                          <tr
                            key={member.id}
                            className="cursor-pointer border-b border-border hover:bg-secondary/30"
                            onClick={() => onRowClickAction(member.id)}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 shrink-0">
                                  {member.photoUrl && (
                                    <AvatarImage src={member.photoUrl} />
                                  )}
                                  <AvatarFallback>
                                    {getInitials(member.firstName, member.lastName)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium text-foreground">
                                  {member.firstName}
                                  {' '}
                                  {member.lastName}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <Badge variant={getMemberTypeVariant(member.memberType)}>
                                {getMemberTypeLabel(member.memberType)}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">
                              {formatCurrency(member.amountDue)}
                            </td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">
                              {formatDate(member.nextPayment)}
                            </td>
                            <td className="px-6 py-4">
                              <Badge variant={getStatusColor(member.status)}>
                                {getStatusLabel(member.status)}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">
                              {formatDate(member.lastAccessedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
        </div>

        {/* Members Cards - Mobile View */}
        <div className="space-y-4 lg:hidden">
          {loading
            ? (
                <div className="flex flex-col items-center justify-center gap-3 p-8">
                  <Spinner size="lg" />
                  <p className="text-sm text-muted-foreground">Loading members...</p>
                </div>
              )
            : filteredMembers.length === 0
              ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No members found
                  </div>
                )
              : (
                  paginatedMembers.map(member => (
                    <MemberCard
                      key={member.id}
                      id={member.id}
                      firstName={member.firstName}
                      lastName={member.lastName}
                      email={member.email}
                      phone={member.phone}
                      dateOfBirth={member.dateOfBirth}
                      photoUrl={member.photoUrl}
                      lastAccessedAt={member.lastAccessedAt}
                      status={member.status}
                      memberType={member.memberType}
                      amountDue={member.amountDue}
                      nextPayment={member.nextPayment}
                      onClick={onRowClickAction}
                      formatters={{
                        currency: formatCurrency,
                        date: formatDate,
                        memberType: getMemberTypeLabel,
                        status: getStatusLabel,
                      }}
                    />
                  ))
                )}
        </div>

        {/* Pagination */}
        {!loading && sortedMembers.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedMembers.length}
            itemsPerPage={ROWS_PER_PAGE}
            onPageChangeAction={handlePageChange}
          />
        )}
      </div>
    </div>
  );
}
