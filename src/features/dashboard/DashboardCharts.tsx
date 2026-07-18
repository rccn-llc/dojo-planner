'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type TimePeriod = 'monthly' | 'yearly';

type MonthlyDataPoint = {
  month: string;
  average?: number;
  earnings?: number;
  previousYearAverage?: number;
  previousYearEarnings?: number;
};

type YearlyDataPoint = {
  year: string;
  average?: number;
  earnings?: number;
};

type DashboardChartsProps = {
  memberAverageData: {
    monthly: MonthlyDataPoint[];
    yearly: YearlyDataPoint[];
  };
  earningsData: {
    monthly: MonthlyDataPoint[];
    yearly: YearlyDataPoint[];
  };
};

// Blue-themed colors for better visibility in dark/light mode
const primaryBlue = 'hsl(210, 100%, 50%)';
const secondaryBlue = 'hsl(200, 90%, 45%)';
const previousYearColor = 'hsl(210, 20%, 60%)';

export default function DashboardCharts({ memberAverageData, earningsData }: DashboardChartsProps) {
  const t = useTranslations('PerformancePage');
  const [memberAveragePeriod, setMemberAveragePeriod] = useState<TimePeriod>('monthly');
  const [earningsPeriod, setEarningsPeriod] = useState<TimePeriod>('monthly');
  const [showMemberAverageComparison, setShowMemberAverageComparison] = useState(false);
  const [showEarningsComparison, setShowEarningsComparison] = useState(false);

  const currentMemberAverageData = memberAveragePeriod === 'monthly'
    ? memberAverageData.monthly
    : memberAverageData.yearly;

  const currentEarningsData = earningsPeriod === 'monthly'
    ? earningsData.monthly
    : earningsData.yearly;

  const memberAverageXKey = memberAveragePeriod === 'monthly' ? 'month' : 'year';
  const earningsXKey = earningsPeriod === 'monthly' ? 'month' : 'year';

  // Check if previous year data is available for monthly views
  const hasMemberAveragePreviousYear = memberAveragePeriod === 'monthly'
    && memberAverageData.monthly.some(d => d.previousYearAverage !== undefined);
  const hasEarningsPreviousYear = earningsPeriod === 'monthly'
    && earningsData.monthly.some(d => d.previousYearEarnings !== undefined);

  return (
    <div className="space-y-6 lg:col-span-2">
      {/* Member Average Chart */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Member average</h2>
          <Select
            value={memberAveragePeriod}
            onValueChange={(value) => {
              setMemberAveragePeriod(value as TimePeriod);
              if (value === 'yearly') {
                setShowMemberAverageComparison(false);
              }
            }}
          >
            <SelectTrigger size="sm" aria-label="Select time period for member average">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasMemberAveragePreviousYear && (
          <div className="mb-4 flex items-center space-x-2">
            <Checkbox
              id="member-average-comparison"
              checked={showMemberAverageComparison}
              onCheckedChange={checked => setShowMemberAverageComparison(checked === true)}
            />
            <Label htmlFor="member-average-comparison" className="text-sm text-muted-foreground">
              {t('compare_with_last_year')}
            </Label>
          </div>
        )}
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={currentMemberAverageData} margin={{ left: -10, right: 0, top: 0, bottom: 0 }}>
            <XAxis dataKey={memberAverageXKey} axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} width={60} />
            <Tooltip
              cursor={{ className: 'fill-[#cccccc] dark:fill-[#666666]' }}
              contentStyle={{
                backgroundColor: 'hsl(222.2 84% 4.9%)',
                border: '1px solid hsl(217.2 32.6% 17.5%)',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
                padding: '8px 12px',
              }}
              labelStyle={{
                color: 'hsl(210 40% 98%)',
                fontWeight: 600,
                marginBottom: '4px',
              }}
              itemStyle={{
                color: 'hsl(210 40% 98%)',
              }}
              formatter={(value: number | undefined, name?: string) => {
                if (value === undefined) {
                  return ['N/A', name ?? 'Value'];
                }
                const label = name === 'previousYearAverage' ? 'Last Year' : 'This Year';
                return [value, label];
              }}
            />
            {showMemberAverageComparison && <Legend formatter={value => (value === 'previousYearAverage' ? 'Last Year' : 'This Year')} />}
            <Bar dataKey="average" name="average" fill={primaryBlue} radius={[12, 12, 10, 10]} maxBarSize={40} />
            {showMemberAverageComparison && (
              <Bar dataKey="previousYearAverage" name="previousYearAverage" fill={previousYearColor} radius={[12, 12, 10, 10]} maxBarSize={40} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Earnings Chart */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Earnings</h2>
          <Select
            value={earningsPeriod}
            onValueChange={(value) => {
              setEarningsPeriod(value as TimePeriod);
              if (value === 'yearly') {
                setShowEarningsComparison(false);
              }
            }}
          >
            <SelectTrigger size="sm" aria-label="Select time period for earnings">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasEarningsPreviousYear && (
          <div className="mb-4 flex items-center space-x-2">
            <Checkbox
              id="earnings-comparison"
              checked={showEarningsComparison}
              onCheckedChange={checked => setShowEarningsComparison(checked === true)}
            />
            <Label htmlFor="earnings-comparison" className="text-sm text-muted-foreground">
              {t('compare_with_last_year')}
            </Label>
          </div>
        )}
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={currentEarningsData} margin={{ left: -10, right: 0, top: 0, bottom: 0 }}>
            <XAxis dataKey={earningsXKey} axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} width={60} tickFormatter={value => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value} />
            <Tooltip
              cursor={{ className: 'fill-[#cccccc] dark:fill-[#666666]' }}
              contentStyle={{
                backgroundColor: 'hsl(222.2 84% 4.9%)',
                border: '1px solid hsl(217.2 32.6% 17.5%)',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
                padding: '8px 12px',
              }}
              labelStyle={{
                color: 'hsl(210 40% 98%)',
                fontWeight: 600,
                marginBottom: '4px',
              }}
              itemStyle={{
                color: 'hsl(210 40% 98%)',
              }}
              formatter={(value: number | undefined, name?: string) => {
                if (value === undefined) {
                  return ['N/A', name ?? 'Value'];
                }
                const formattedValue = value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value}`;
                const label = name === 'previousYearEarnings' ? 'Last Year' : 'This Year';
                return [formattedValue, label];
              }}
            />
            {showEarningsComparison && <Legend formatter={value => (value === 'previousYearEarnings' ? 'Last Year' : 'This Year')} />}
            <Bar dataKey="earnings" name="earnings" fill={secondaryBlue} radius={[12, 12, 10, 10]} maxBarSize={40} />
            {showEarningsComparison && (
              <Bar dataKey="previousYearEarnings" name="previousYearEarnings" fill={previousYearColor} radius={[12, 12, 10, 10]} maxBarSize={40} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
