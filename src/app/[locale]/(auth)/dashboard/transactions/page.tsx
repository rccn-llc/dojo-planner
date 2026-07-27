'use client';

import type { Transaction } from '@/features/finances/FinancesTable';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { FinancesTable } from '@/features/finances/FinancesTable';
import { useTransactionsCache } from '@/hooks/useTransactionsCache';
import { StatsCards } from '@/templates/StatsCards';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  membership_payment: 'Membership Dues',
  event_registration: 'Event',
  signup_fee: 'Signup Fee',
  refund: 'Refund',
  adjustment: 'Adjustment',
  // Kiosk store sale — matches the detail modal's product_purchase label.
  product_purchase: 'Product Purchase',
};

function formatPaymentMethod(paymentMethod: string | null, description: string | null): string {
  if (!paymentMethod) {
    return 'Unknown';
  }
  // Extract last4 from description if it contains card info
  if (paymentMethod === 'card' && description) {
    const last4Match = description.match(/\*{4}(\d{4})/);
    if (last4Match) {
      return `Saved Card Ending ****${last4Match[1]}`;
    }
  }
  switch (paymentMethod) {
    case 'card': return 'Credit Card';
    case 'cash': return 'Cash';
    case 'bank_transfer': return 'ACH Transfer';
    case 'check': return 'Check';
    default: return paymentMethod;
  }
}

function getTransactionsInPast30Days(transactions: Transaction[]): Transaction[] {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return transactions.filter((transaction) => {
    const transactionDate = new Date(transaction.date);
    return transactionDate >= thirtyDaysAgo;
  });
}

export default function TransactionsPage() {
  const t = useTranslations('TransactionsPage');
  const { transactions: rawTransactions, loading } = useTransactionsCache();

  const transactions: Transaction[] = useMemo(() => {
    return rawTransactions.map(tx => ({
      id: tx.id,
      date: new Date(tx.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      amount: `$${Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      purpose: TRANSACTION_TYPE_LABELS[tx.transactionType] ?? tx.transactionType,
      method: formatPaymentMethod(tx.paymentMethod, tx.description),
      transactionId: `TXN${tx.id.slice(0, 12).toUpperCase()}`,
      // Guest / non-member transactions (e.g. kiosk store sales) have no member
      // — show a "Non-member" label instead of a blank cell.
      memberName: [tx.memberFirstName, tx.memberLastName].filter(Boolean).join(' ') || t('non_member'),
      memberId: tx.memberId,
      status: tx.status as Transaction['status'],
      transactionType: tx.transactionType,
    }));
  }, [rawTransactions, t]);

  const stats = useMemo(() => {
    const recentTransactions = getTransactionsInPast30Days(transactions);

    const paid = recentTransactions.filter(tx => tx.status === 'paid').length;
    const declined = recentTransactions.filter(tx => tx.status === 'declined').length;
    const refunded = recentTransactions.filter(tx => tx.status === 'refunded').length;

    return { paid, declined, refunded };
  }, [transactions]);

  const statsData = useMemo(() => [
    { id: 'paid', label: t('stats_paid_label'), value: stats.paid },
    { id: 'declined', label: t('stats_declined_label'), value: stats.declined },
    { id: 'refunded', label: t('stats_refunded_label'), value: stats.refunded },
  ], [stats, t]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
      <StatsCards stats={statsData} columns={3} fullWidth={false} />
      <FinancesTable transactions={transactions} loading={loading} />
    </div>
  );
}
