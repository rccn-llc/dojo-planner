import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { ClassStatsCard } from './ClassStatsCard';

// Mock next-intl with proper translations
const translationKeys: Record<string, string> = {
  active_enrollments: 'Active Enrollments',
  average_attendance: 'Avg. Attendance',
  total_sessions: 'Total Sessions',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translationKeys[key] || key,
}));

describe('ClassStatsCard', () => {
  const defaultProps = {
    activeEnrollments: 45,
    averageAttendance: 18,
    totalSessions: 156,
    level: 'Beginner' as const,
  };

  it('should render the stats card', async () => {
    await render(<ClassStatsCard {...defaultProps} />);

    const enrollments = page.getByText('45');

    expect(enrollments).toBeTruthy();
  });

  it('should render active enrollments stat', async () => {
    await render(<ClassStatsCard {...defaultProps} />);

    const enrollmentsLabel = page.getByText('Active Enrollments');
    const enrollmentsValue = page.getByText('45');

    expect(enrollmentsLabel).toBeTruthy();
    expect(enrollmentsValue).toBeTruthy();
  });

  it('should render average attendance stat', async () => {
    await render(<ClassStatsCard {...defaultProps} />);

    const attendanceLabel = page.getByText('Avg. Attendance');
    const attendanceValue = page.getByText('18');

    expect(attendanceLabel).toBeTruthy();
    expect(attendanceValue).toBeTruthy();
  });

  it('should render total sessions stat', async () => {
    await render(<ClassStatsCard {...defaultProps} />);

    const sessionsLabel = page.getByText('Total Sessions');
    const sessionsValue = page.getByText('156');

    expect(sessionsLabel).toBeTruthy();
    expect(sessionsValue).toBeTruthy();
  });

  it('should render level badge', async () => {
    await render(<ClassStatsCard {...defaultProps} />);

    const levelBadge = page.getByText('Beginner');

    expect(levelBadge).toBeTruthy();
  });

  it('should render different level badges correctly', async () => {
    await render(<ClassStatsCard {...defaultProps} level="Advanced" />);

    const advancedBadge = page.getByText('Advanced');

    expect(advancedBadge).toBeTruthy();
  });

  it('should render Intermediate level badge', async () => {
    await render(<ClassStatsCard {...defaultProps} level="Intermediate" />);

    const intermediateBadge = page.getByText('Intermediate');

    expect(intermediateBadge).toBeTruthy();
  });

  it('should render All Levels badge', async () => {
    await render(<ClassStatsCard {...defaultProps} level="All Levels" />);

    const allLevelsBadge = page.getByText('All Levels');

    expect(allLevelsBadge).toBeTruthy();
  });
});
