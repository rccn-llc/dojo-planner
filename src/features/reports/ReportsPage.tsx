'use client';

import type { ReportType } from './reportHelpers';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportCurrentValues } from '@/hooks/useReportsCache';
import { formatCurrency, useReportDescription, useReportTitle } from './reportHelpers';

export type { ReportType };

// recharts is a heavy client-only dependency used only by the report-detail
// view. Load ReportDetail lazily so recharts is fetched as a separate chunk
// only when a user opens a specific report (the landing grid has no chart).
const ReportDetail = dynamic(() => import('./ReportDetail'), {
  loading: () => <Skeleton className="h-80 w-full" />,
});

type ReportDefinition = {
  id: ReportType;
  currentValue: string | number;
};

function ReportCard({ report, onClick }: { report: ReportDefinition; onClick: () => void }) {
  const title = useReportTitle(report.id);
  const description = useReportDescription(report.id);

  return (
    <Card
      className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
      onClick={onClick}
      data-testid={`report-card-${report.id}`}
    >
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-primary">{report.currentValue}</div>
      </CardContent>
    </Card>
  );
}

export function ReportsPage() {
  const t = useTranslations('ReportsPage');
  const searchParams = useSearchParams();
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(
    () => (searchParams.get('report') as ReportType) || null,
  );

  const { data: currentValues, loading } = useReportCurrentValues();

  const reportDefinitions: ReportDefinition[] = useMemo(() => {
    if (!currentValues) {
      return [];
    }
    return [
      { id: 'accounts-autopay-suspended', currentValue: currentValues.autopaysSuspended },
      { id: 'expiring-credit-cards', currentValue: currentValues.expiringCreditCards },
      { id: 'amount-due', currentValue: formatCurrency(currentValues.amountDue) },
      { id: 'past-due', currentValue: formatCurrency(currentValues.pastDue) },
      { id: 'payments-last-30-days', currentValue: formatCurrency(currentValues.paymentsLast30Days) },
      { id: 'payments-pending', currentValue: formatCurrency(currentValues.paymentsPending) },
      { id: 'failed-payments', currentValue: formatCurrency(currentValues.failedPayments) },
      { id: 'income-per-student', currentValue: formatCurrency(currentValues.incomePerStudent) },
    ];
  }, [currentValues]);

  const handleReportClick = useCallback((reportId: ReportType) => {
    setSelectedReport(reportId);
    // Update URL without navigation
    const url = new URL(window.location.href);
    url.searchParams.set('report', reportId);
    window.history.pushState({}, '', url.toString());
  }, []);

  const handleBack = useCallback(() => {
    setSelectedReport(null);
    // Remove report from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('report');
    window.history.pushState({}, '', url.toString());
  }, []);

  if (selectedReport) {
    return <ReportDetail reportId={selectedReport} onBack={handleBack} />;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-72" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {reportDefinitions.map(report => (
          <ReportCard
            key={report.id}
            report={report}
            onClick={() => handleReportClick(report.id)}
          />
        ))}
      </div>
    </div>
  );
}
