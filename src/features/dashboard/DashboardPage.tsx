'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardCache } from '@/hooks/useDashboardCache';

// recharts (~100KB+) is heavy and only needed once the charts render. Load it
// as a lazy chunk so it's not in the dashboard route's initial JS.
const DashboardCharts = dynamic(() => import('./DashboardCharts'), {
  loading: () => <Skeleton className="h-80 w-full" />,
});

type DashboardDataItem = {
  type: string;
  quantity: number | string;
  link?: string;
};

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DashboardPage() {
  const t = useTranslations('PerformancePage');
  const { membershipStats, financialStats, memberAverageData, earningsData, loading } = useDashboardCache();

  const membershipsData: DashboardDataItem[] = useMemo(() => {
    if (!membershipStats) {
      return [];
    }
    return [
      { type: 'All people', quantity: membershipStats.totalPeople, link: '/dashboard/members' },
      { type: 'All students', quantity: membershipStats.totalStudents, link: '/dashboard/members' },
      { type: 'All families with students', quantity: membershipStats.totalFamilies, link: '/dashboard/members' },
      { type: 'New students (last 30 days)', quantity: membershipStats.newStudentsLast30Days, link: '/dashboard/members' },
      { type: 'Memberships with autopay on (automatic)', quantity: membershipStats.autopayOn, link: '/dashboard/members' },
      { type: 'Memberships with autopay off (manual)', quantity: membershipStats.autopayOff, link: '/dashboard/members' },
      { type: 'Memberships on hold', quantity: membershipStats.membershipsOnHold, link: '/dashboard/members' },
      { type: 'Canceled memberships (last 30 days)', quantity: membershipStats.cancelledLast30Days, link: '/dashboard/members' },
      { type: 'Membership net change (30 days)', quantity: membershipStats.membershipNetChange30Days },
    ];
  }, [membershipStats]);

  const financialsData: DashboardDataItem[] = useMemo(() => {
    if (!financialStats) {
      return [];
    }
    const students = membershipStats?.totalStudents ?? 0;
    const payments = financialStats.paymentsLast30Days;
    return [
      { type: 'Accounts with autopay suspended:', quantity: financialStats.autopaysSuspended, link: '/dashboard/reports?report=accounts-autopay-suspended' },
      { type: 'Expiring credit cards (next 60 days)', quantity: financialStats.expiringCreditCards60Days, link: '/dashboard/reports?report=expiring-credit-cards' },
      { type: 'Amount due (next 30 days)', quantity: formatCurrency(financialStats.amountDueNext30Days), link: '/dashboard/reports?report=amount-due' },
      { type: 'Past due (total)', quantity: formatCurrency(financialStats.pastDueTotal), link: '/dashboard/reports?report=past-due' },
      { type: 'Payments (last 30 days)', quantity: formatCurrency(payments), link: '/dashboard/reports?report=payments-last-30-days' },
      { type: 'Payments (pending status)', quantity: formatCurrency(financialStats.paymentsPending), link: '/dashboard/reports?report=payments-pending' },
      { type: 'Failed payments (last 30 days)', quantity: formatCurrency(financialStats.failedPaymentsLast30Days), link: '/dashboard/reports?report=failed-payments' },
      { type: `Income per student (30 days, ${formatCurrency(payments)} / ${students} students)`, quantity: formatCurrency(financialStats.incomePerStudent30Days), link: '/dashboard/reports?report=income-per-student' },
    ];
  }, [financialStats, membershipStats]);

  const chartMemberData = useMemo(() => {
    if (!memberAverageData) {
      return null;
    }
    return {
      monthly: memberAverageData.monthly.map(p => ({
        month: p.month,
        average: p.value,
        previousYearAverage: p.previousYearValue ?? undefined,
      })),
      yearly: memberAverageData.yearly.map(p => ({
        year: p.year,
        average: p.value,
      })),
    };
  }, [memberAverageData]);

  const chartEarningsData = useMemo(() => {
    if (!earningsData) {
      return null;
    }
    return {
      monthly: earningsData.monthly.map(p => ({
        month: p.month,
        earnings: p.value,
        previousYearEarnings: p.previousYearValue ?? undefined,
      })),
      yearly: earningsData.yearly.map(p => ({
        year: p.year,
        earnings: p.value,
      })),
    };
  }, [earningsData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-1">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Tables */}
        <div className="space-y-6 lg:col-span-1">
          {/* Memberships Table */}
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">{t('memberships_card_title')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-semibold text-foreground">Type</th>
                    <th className="py-2 text-right font-semibold text-foreground">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {membershipsData.map(item => (
                    <tr key={item.type} className="border-b border-border last:border-b-0">
                      <td className="py-3 text-foreground">
                        {item.link
                          ? (
                              <Link href={item.link} className="text-primary underline-offset-4 hover:underline">
                                {item.type}
                              </Link>
                            )
                          : (
                              item.type
                            )}
                      </td>
                      <td className="py-3 text-right text-foreground">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Financials Table */}
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">{t('financials_card_title')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-semibold text-foreground">Type</th>
                    <th className="py-2 text-right font-semibold text-foreground">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {financialsData.map(item => (
                    <tr key={item.type} className="border-b border-border last:border-b-0">
                      <td className="py-3 text-foreground">
                        {item.link
                          ? (
                              <Link href={item.link} className="text-primary underline-offset-4 hover:underline">
                                {item.type}
                              </Link>
                            )
                          : (
                              item.type
                            )}
                      </td>
                      <td className="py-3 text-right text-foreground">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Column: Charts */}
        {chartMemberData && chartEarningsData && (
          <DashboardCharts memberAverageData={chartMemberData} earningsData={chartEarningsData} />
        )}
      </div>
    </div>
  );
}
