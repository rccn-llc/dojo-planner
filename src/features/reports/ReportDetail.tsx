'use client';

import type { ReportType } from './reportHelpers';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportCurrentValues, useReportDetail } from '@/hooks/useReportsCache';
import { formatCurrency, useReportDescription, useReportTitle } from './reportHelpers';

type TimePeriod = 'monthly' | 'yearly' | 'last-7' | 'last-30' | 'last-90';

const DAILY_PERIODS = ['last-7', 'last-30', 'last-90'] as const;

function isDailyPeriod(p: TimePeriod): p is 'last-7' | 'last-30' | 'last-90' {
  return (DAILY_PERIODS as readonly string[]).includes(p);
}
type ChartType = 'bar' | 'line' | 'area';

// Chart type mapping for each report - using blue-themed colors for dark/light mode visibility
const reportChartTypes: Record<ReportType, { type: ChartType; color: string }> = {
  'accounts-autopay-suspended': { type: 'area', color: 'hsl(210, 100%, 50%)' }, // Bright blue
  'expiring-credit-cards': { type: 'bar', color: 'hsl(200, 90%, 45%)' }, // Cyan-blue
  'amount-due': { type: 'line', color: 'hsl(220, 85%, 55%)' }, // Royal blue
  'past-due': { type: 'area', color: 'hsl(230, 80%, 60%)' }, // Indigo-blue
  'payments-last-30-days': { type: 'bar', color: 'hsl(205, 95%, 50%)' }, // Sky blue
  'payments-pending': { type: 'area', color: 'hsl(195, 85%, 45%)' }, // Teal-blue
  'failed-payments': { type: 'area', color: 'hsl(240, 70%, 55%)' }, // Purple-blue
  'income-per-student': { type: 'line', color: 'hsl(215, 90%, 55%)' }, // Dodger blue
};

const CURRENCY_REPORT_IDS: ReportType[] = [
  'amount-due',
  'past-due',
  'payments-last-30-days',
  'payments-pending',
  'failed-payments',
  'income-per-student',
];

// Shared tooltip style configuration - solid dark background for legibility
const tooltipStyle = {
  backgroundColor: 'hsl(222.2 84% 4.9%)',
  border: '1px solid hsl(217.2 32.6% 17.5%)',
  borderRadius: '0.5rem',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
  padding: '8px 12px',
  color: 'hsl(210 40% 98%)',
};

// Label style for tooltip - makes the header text more prominent
const tooltipLabelStyle = {
  color: 'hsl(210 40% 98%)',
  fontWeight: 600,
  marginBottom: '4px',
};

// Item style for tooltip - ensures items are readable
const tooltipItemStyle = {
  color: 'hsl(210 40% 98%)',
};

// Previous year color - a muted gray-blue for contrast
const previousYearColor = 'hsl(210, 20%, 60%)';

// Render the appropriate chart type based on report configuration
function renderChart(
  reportId: ReportType,
  chartData: Array<{ month?: string; year?: string; day?: string; value: number; previousYear?: number }>,
  xKey: string,
  formatValue: (value: number) => string,
  showComparison: boolean = false,
) {
  const chartConfig = reportChartTypes[reportId] || { type: 'bar', color: 'hsl(var(--primary))' };
  const { type, color } = chartConfig;

  const commonProps = {
    data: chartData,
    margin: { left: -10, right: 10, top: 10, bottom: 0 },
  };

  const xAxisProps = {
    dataKey: xKey,
    axisLine: false,
    tickLine: false,
    tick: { fill: 'currentColor', className: 'fill-muted-foreground', fontSize: 12 },
  };

  const yAxisProps = {
    axisLine: false,
    tickLine: false,
    width: 60,
    tickFormatter: formatValue,
    tick: { fill: 'currentColor', className: 'fill-muted-foreground', fontSize: 12 },
  };

  const tooltipFormatter = (value: number | string | Array<number | string> | undefined, name?: string) => {
    if (value === undefined) {
      return ['N/A', name ?? 'Value'] as [string, string];
    }
    const numValue = typeof value === 'number' ? value : Number(value);
    const label = name === 'previousYear' ? 'Last Year' : 'This Year';
    return [formatValue(numValue), label] as [string, string];
  };

  // Check if previous year data exists in the dataset
  const hasPreviousYearData = showComparison && chartData.some(d => d.previousYear !== undefined);

  switch (type) {
    case 'line':
      return (
        <LineChart {...commonProps}>
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={tooltipFormatter} />
          {hasPreviousYearData && (
            <Legend
              wrapperStyle={{ paddingTop: '10px' }}
              formatter={value => (value === 'previousYear' ? 'Last Year' : 'This Year')}
            />
          )}
          {hasPreviousYearData && (
            <Line
              type="monotone"
              dataKey="previousYear"
              name="previousYear"
              stroke={previousYearColor}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: previousYearColor, strokeWidth: 2, r: 3 }}
              activeDot={{ r: 5, fill: previousYearColor }}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            name="value"
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color, strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: color }}
          />
        </LineChart>
      );
    case 'area':
      return (
        <AreaChart {...commonProps}>
          <defs>
            <linearGradient id={`gradient-${reportId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`gradient-${reportId}-prev`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={previousYearColor} stopOpacity={0.2} />
              <stop offset="95%" stopColor={previousYearColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={tooltipFormatter} />
          {hasPreviousYearData && (
            <Legend
              wrapperStyle={{ paddingTop: '10px' }}
              formatter={value => (value === 'previousYear' ? 'Last Year' : 'This Year')}
            />
          )}
          {hasPreviousYearData && (
            <Area
              type="monotone"
              dataKey="previousYear"
              name="previousYear"
              stroke={previousYearColor}
              strokeWidth={2}
              strokeDasharray="5 5"
              fill={`url(#gradient-${reportId}-prev)`}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            name="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#gradient-${reportId})`}
          />
        </AreaChart>
      );
    case 'bar':
    default:
      return (
        <BarChart {...commonProps}>
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          {/* Hover cursor: #cccccc is fine in light mode but too bright in dark
              mode, so drop to #666666 there via a dark: variant (#213). */}
          <Tooltip cursor={{ className: 'fill-[#cccccc] dark:fill-[#666666]' }} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={tooltipFormatter} />

          {hasPreviousYearData && (
            <Legend
              wrapperStyle={{ paddingTop: '10px' }}
              formatter={value => (value === 'previousYear' ? 'Last Year' : 'This Year')}
            />
          )}
          {hasPreviousYearData && (
            <Bar dataKey="previousYear" name="previousYear" fill={previousYearColor} radius={[4, 4, 0, 0]} maxBarSize={35} />
          )}
          <Bar dataKey="value" name="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={35} />
        </BarChart>
      );
  }
}

export default function ReportDetail({ reportId, onBack }: { reportId: ReportType; onBack: () => void }) {
  const t = useTranslations('ReportsPage');
  const title = useReportTitle(reportId);
  const description = useReportDescription(reportId);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('monthly');
  const [showComparison, setShowComparison] = useState(false);

  const range = isDailyPeriod(timePeriod) ? timePeriod : undefined;
  const { chartData: rawChartData, insights, loading } = useReportDetail(reportId, range);

  const { data: currentValues } = useReportCurrentValues();

  const currentValue = useMemo(() => {
    if (!currentValues) {
      return null;
    }
    const keyMap: Record<ReportType, keyof typeof currentValues> = {
      'accounts-autopay-suspended': 'autopaysSuspended',
      'expiring-credit-cards': 'expiringCreditCards',
      'amount-due': 'amountDue',
      'past-due': 'pastDue',
      'payments-last-30-days': 'paymentsLast30Days',
      'payments-pending': 'paymentsPending',
      'failed-payments': 'failedPayments',
      'income-per-student': 'incomePerStudent',
    };
    const raw = currentValues[keyMap[reportId]];
    return CURRENCY_REPORT_IDS.includes(reportId) ? formatCurrency(raw) : raw;
  }, [currentValues, reportId]);

  const chartData = useMemo(() => {
    if (!rawChartData) {
      return [];
    }
    if (isDailyPeriod(timePeriod)) {
      return rawChartData.daily ?? [];
    }
    return timePeriod === 'monthly' ? rawChartData.monthly : rawChartData.yearly;
  }, [rawChartData, timePeriod]);

  // Previous-year comparison is only meaningful in the monthly view.
  const hasPreviousYearData = useMemo(() => {
    if (timePeriod !== 'monthly' || !rawChartData) {
      return false;
    }
    return rawChartData.monthly.some(d => d.previousYear !== undefined);
  }, [rawChartData, timePeriod]);

  const xKey = isDailyPeriod(timePeriod) ? 'day' : (timePeriod === 'monthly' ? 'month' : 'year');

  const formatValue = useCallback((value: number) => {
    // Format currency values appropriately
    if (reportId === 'amount-due' || reportId === 'past-due' || reportId === 'payments-last-30-days' || reportId === 'payments-pending' || reportId === 'failed-payments') {
      if (value >= 1000) {
        return `$${(value / 1000).toFixed(1)}k`;
      }
      return `$${value}`;
    }
    if (reportId === 'income-per-student') {
      return `$${value}`;
    }
    return value.toString();
  }, [reportId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} data-testid="back-button">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('back_to_reports')}
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chart Section */}
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">{t('chart_title')}</h2>
            <div className="flex items-center gap-4">
              {hasPreviousYearData && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="compare-years"
                    checked={showComparison}
                    onCheckedChange={checked => setShowComparison(checked === true)}
                    data-testid="compare-years-checkbox"
                  />
                  <Label htmlFor="compare-years" className="cursor-pointer text-sm">
                    {t('compare_with_last_year')}
                  </Label>
                </div>
              )}
              <Select
                value={timePeriod}
                onValueChange={value => setTimePeriod(value as TimePeriod)}
              >
                <SelectTrigger size="sm" aria-label="Select time period">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t('time_period_monthly')}</SelectItem>
                  <SelectItem value="yearly">{t('time_period_yearly')}</SelectItem>
                  <SelectItem value="last-7">{t('time_period_last_7')}</SelectItem>
                  <SelectItem value="last-30">{t('time_period_last_30')}</SelectItem>
                  <SelectItem value="last-90">{t('time_period_last_90')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            {renderChart(reportId, chartData, xKey, formatValue, showComparison)}
          </ResponsiveContainer>
          {currentValue !== null && (
            <div className="mt-4 text-center">
              <span className="text-3xl font-bold text-primary">{currentValue}</span>
              <span className="ml-2 text-sm text-muted-foreground">Current Value</span>
            </div>
          )}
        </Card>

        {/* Insights Section */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('insights_title')}</h2>
          <ul className="space-y-3">
            {insights.map(insight => (
              <li key={insight} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {insight}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
