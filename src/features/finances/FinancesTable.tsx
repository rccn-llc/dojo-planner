'use client';

import type { FinancesFilters } from './FinancesFilterBar';
import { ArrowDown01, ArrowDownAZ, ArrowUp10, ArrowUpZA } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination/Pagination';
import { Spinner } from '@/components/ui/spinner';
import { TransactionCard } from '@/templates/TransactionCard';
import { FinancesFilterBar } from './FinancesFilterBar';
import { TransactionDetailModal } from './TransactionDetailModal';

export type TransactionStatus = 'paid' | 'pending' | 'declined' | 'refunded' | 'processing';

export type Transaction = {
  id: string;
  date: string;
  amount: string;
  purpose: string;
  method: string;
  transactionId: string;
  memberName: string;
  // null for a guest / non-member transaction (e.g. a kiosk store sale).
  memberId: string | null;
  status: TransactionStatus;
  transactionType: string;
};

type FinancesTableProps = {
  transactions: Transaction[];
  loading?: boolean;
  headerActions?: React.ReactNode;
};

type SortField = 'date' | 'amount' | 'purpose' | 'method' | 'transactionId' | 'memberName' | 'status';
type SortDirection = 'asc' | 'desc';

const statusVariantMap: Record<TransactionStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'warning'> = {
  paid: 'default',
  pending: 'outline',
  declined: 'destructive',
  refunded: 'warning',
  processing: 'outline',
};

export function FinancesTable({
  transactions,
  loading = false,
  headerActions,
}: FinancesTableProps) {
  const t = useTranslations('TransactionsPage');
  const [filters, setFilters] = useState<FinancesFilters>({
    search: '',
    origin: 'all',
    status: 'all',
  });
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const ROWS_PER_PAGE = 10;

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedTransaction(null);
  };

  const handleFiltersChange = (newFilters: FinancesFilters) => {
    setFilters(newFilters);
    setCurrentPage(0);
  };

  // Calculate available origins based on current status filter (dynamic filtering)
  const availableOrigins = useMemo(() => {
    const origins = new Set<string>();
    transactions
      .filter((transaction) => {
        // Apply status filter to determine which origins are available
        const matchesStatus = filters.status === 'all' || transaction.status === filters.status;
        // Apply search filter too
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = filters.search === ''
          || transaction.date.toLowerCase().includes(searchLower)
          || transaction.amount.toLowerCase().includes(searchLower)
          || transaction.purpose.toLowerCase().includes(searchLower)
          || transaction.method.toLowerCase().includes(searchLower)
          || transaction.transactionId.toLowerCase().includes(searchLower)
          || transaction.memberName.toLowerCase().includes(searchLower)
          || transaction.status.toLowerCase().includes(searchLower);
        return matchesStatus && matchesSearch;
      })
      .forEach((transaction) => {
        if (transaction.purpose) {
          origins.add(transaction.purpose);
        }
      });
    return Array.from(origins).sort();
  }, [transactions, filters.status, filters.search]);

  // Calculate available statuses based on current origin filter (dynamic filtering)
  const availableStatuses = useMemo(() => {
    const statuses = new Set<TransactionStatus>();
    transactions
      .filter((transaction) => {
        // Apply origin filter to determine which statuses are available
        const matchesOrigin = filters.origin === 'all' || transaction.purpose === filters.origin;
        // Apply search filter too
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = filters.search === ''
          || transaction.date.toLowerCase().includes(searchLower)
          || transaction.amount.toLowerCase().includes(searchLower)
          || transaction.purpose.toLowerCase().includes(searchLower)
          || transaction.method.toLowerCase().includes(searchLower)
          || transaction.transactionId.toLowerCase().includes(searchLower)
          || transaction.memberName.toLowerCase().includes(searchLower)
          || transaction.status.toLowerCase().includes(searchLower);
        return matchesOrigin && matchesSearch;
      })
      .forEach((transaction) => {
        statuses.add(transaction.status);
      });
    return Array.from(statuses);
  }, [transactions, filters.origin, filters.search]);

  const filteredTransactions = useMemo(() => {
    const searchLower = filters.search.toLowerCase();
    return transactions.filter((transaction) => {
      const matchesSearch = filters.search === ''
        || transaction.date.toLowerCase().includes(searchLower)
        || transaction.amount.toLowerCase().includes(searchLower)
        || transaction.purpose.toLowerCase().includes(searchLower)
        || transaction.method.toLowerCase().includes(searchLower)
        || transaction.transactionId.toLowerCase().includes(searchLower)
        || transaction.memberName.toLowerCase().includes(searchLower)
        || transaction.status.toLowerCase().includes(searchLower);

      const matchesOrigin = filters.origin === 'all' || transaction.purpose === filters.origin;
      const matchesStatus = filters.status === 'all' || transaction.status === filters.status;

      return matchesSearch && matchesOrigin && matchesStatus;
    });
  }, [transactions, filters]);

  const sortedTransactions = useMemo(() => [...filteredTransactions].sort((a, b) => {
    let aValue: string | number;
    let bValue: string | number;

    switch (sortField) {
      case 'date':
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
        break;
      case 'amount':
        aValue = Number.parseFloat(a.amount.replace(/[$,]/g, ''));
        bValue = Number.parseFloat(b.amount.replace(/[$,]/g, ''));
        break;
      case 'purpose':
        aValue = a.purpose.toLowerCase();
        bValue = b.purpose.toLowerCase();
        break;
      case 'method':
        aValue = a.method.toLowerCase();
        bValue = b.method.toLowerCase();
        break;
      case 'transactionId':
        aValue = a.transactionId.toLowerCase();
        bValue = b.transactionId.toLowerCase();
        break;
      case 'memberName':
        aValue = a.memberName.toLowerCase();
        bValue = b.memberName.toLowerCase();
        break;
      case 'status':
        aValue = a.status.toLowerCase();
        bValue = b.status.toLowerCase();
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
  }), [filteredTransactions, sortField, sortDirection]);

  const totalPages = Math.ceil(sortedTransactions.length / ROWS_PER_PAGE);
  const paginatedTransactions = sortedTransactions.slice(
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
    setCurrentPage(0);
  };

  const hasFiltersApplied = filters.search !== '' || filters.origin !== 'all' || filters.status !== 'all';
  const showNoResults = hasFiltersApplied && filteredTransactions.length === 0 && transactions.length > 0;

  return (
    <div className="w-full space-y-6">
      {/* Search and Filter Bar with Actions */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex-1">
            <FinancesFilterBar
              onFiltersChangeAction={handleFiltersChange}
              availableOrigins={availableOrigins}
              availableStatuses={availableStatuses}
            />
          </div>
          {headerActions}
        </div>

        {/* Transactions Table - Desktop View */}
        <div className="hidden rounded-lg border border-border bg-background lg:block">
          {loading
            ? (
                <div className="flex flex-col items-center justify-center gap-3 p-8">
                  <Spinner size="lg" />
                  <p className="text-sm text-muted-foreground">{t('loading_transactions')}</p>
                </div>
              )
            : filteredTransactions.length === 0
              ? (
                  <div className="p-8 text-center text-muted-foreground">
                    {showNoResults ? t('no_results_found') : t('no_transactions')}
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
                              onClick={() => handleSort('date')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              {t('table_date')}
                              {sortField === 'date' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="size-4" />
                                  : <ArrowUpZA className="size-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('status')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              {t('table_status')}
                              {sortField === 'status' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="size-4" />
                                  : <ArrowUpZA className="size-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('memberName')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              {t('table_member')}
                              {sortField === 'memberName' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="size-4" />
                                  : <ArrowUpZA className="size-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('amount')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              {t('table_amount')}
                              {sortField === 'amount' && (
                                sortDirection === 'asc'
                                  ? <ArrowDown01 className="size-4" />
                                  : <ArrowUp10 className="size-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('purpose')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              {t('table_origin')}
                              {sortField === 'purpose' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="size-4" />
                                  : <ArrowUpZA className="size-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('method')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              {t('table_method')}
                              {sortField === 'method' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="size-4" />
                                  : <ArrowUpZA className="size-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                            <button
                              type="button"
                              onClick={() => handleSort('transactionId')}
                              className="flex cursor-pointer items-center gap-2 hover:text-foreground/80"
                            >
                              {t('table_transaction_id')}
                              {sortField === 'transactionId' && (
                                sortDirection === 'asc'
                                  ? <ArrowDownAZ className="size-4" />
                                  : <ArrowUpZA className="size-4" />
                              )}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTransactions.map(transaction => (
                          <tr
                            key={transaction.id}
                            className="cursor-pointer border-b border-border hover:bg-secondary/30"
                            onClick={() => handleRowClick(transaction)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleRowClick(transaction);
                              }
                            }}
                          >
                            <td className="px-6 py-4 text-sm text-foreground">{transaction.date}</td>
                            <td className="px-6 py-4 text-sm">
                              <Badge variant={statusVariantMap[transaction.status]}>
                                {t(`status_${transaction.status}`)}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-sm text-foreground">{transaction.memberName}</td>
                            <td className="px-6 py-4 text-sm text-foreground">{transaction.amount}</td>
                            <td className="px-6 py-4 text-sm text-foreground">{transaction.purpose}</td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">{transaction.method}</td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">{transaction.transactionId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
        </div>

        {/* Transaction Cards - Mobile View */}
        <div className="space-y-4 lg:hidden">
          {loading
            ? (
                <div className="flex flex-col items-center justify-center gap-3 p-8">
                  <Spinner size="lg" />
                  <p className="text-sm text-muted-foreground">{t('loading_transactions')}</p>
                </div>
              )
            : filteredTransactions.length === 0
              ? (
                  <div className="p-8 text-center text-muted-foreground">
                    {showNoResults ? t('no_results_found') : t('no_transactions')}
                  </div>
                )
              : (
                  paginatedTransactions.map(transaction => (
                    <TransactionCard
                      key={transaction.id}
                      id={transaction.id}
                      date={transaction.date}
                      amount={transaction.amount}
                      purpose={transaction.purpose}
                      method={transaction.method}
                      transactionId={transaction.transactionId}
                      memberName={transaction.memberName}
                      status={transaction.status}
                      onClickAction={() => handleRowClick(transaction)}
                    />
                  ))
                )}
        </div>

        {/* Pagination */}
        {!loading && sortedTransactions.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedTransactions.length}
            itemsPerPage={ROWS_PER_PAGE}
            onPageChangeAction={setCurrentPage}
          />
        )}
      </div>

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        isOpen={isDetailModalOpen}
        onCloseAction={handleCloseDetailModal}
        transaction={selectedTransaction}
      />
    </div>
  );
}
