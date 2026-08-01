import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { StatsCards } from './StatsCards';

describe('StatsCards', () => {
  const mockStats = [
    { id: '1', label: 'Total Members', value: 150 },
    { id: '2', label: 'Active Members', value: 140 },
    { id: '3', label: 'Free Members', value: 25 },
    { id: '4', label: 'Paid Members', value: 115 },
  ];

  it('renders all stat cards', async () => {
    await render(<StatsCards stats={mockStats} />);

    await expect.element(page.getByText('Total Members')).toBeInTheDocument();
    await expect.element(page.getByText('150')).toBeInTheDocument();
    await expect.element(page.getByText('Active Members')).toBeInTheDocument();
    await expect.element(page.getByText('140')).toBeInTheDocument();
    await expect.element(page.getByText('Free Members')).toBeInTheDocument();
    await expect.element(page.getByText('25')).toBeInTheDocument();
    await expect.element(page.getByText('Paid Members')).toBeInTheDocument();
    await expect.element(page.getByText('115')).toBeInTheDocument();
  });

  it('applies custom formatting when formatValue is provided', async () => {
    const statsWithFormatter = [
      {
        id: '1',
        label: 'Revenue',
        value: 1500,
        formatValue: (value: string | number) => `$${value}`,
      },
    ];

    await render(<StatsCards stats={statsWithFormatter} />);

    await expect.element(page.getByText('$1500')).toBeInTheDocument();
  });

  it('renders with different column configurations', async () => {
    await render(<StatsCards stats={mockStats.slice(0, 3)} columns={3} />);

    await expect.element(page.getByText('Total Members')).toBeInTheDocument();
  });

  it('handles empty stats array', async () => {
    // Should not reject when rendering with empty stats
    await expect(render(<StatsCards stats={[]} />)).resolves.toBeDefined();
  });

  it('displays string values correctly', async () => {
    const stringStats = [
      { id: '1', label: 'Status', value: 'Active' },
    ];

    await render(<StatsCards stats={stringStats} />);

    await expect.element(page.getByText('Active')).toBeInTheDocument();
  });
});
