import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Skeleton } from '../skeleton';

const meta = {
  title: 'UI/Utility/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: 'w-12 h-12 rounded-full',
  },
};

export const Avatar: Story = {
  render: () => <Skeleton className="size-12 rounded-full" />,
};

export const TextLine: Story = {
  render: () => <Skeleton className="h-4 w-full" />,
};

export const CardSkeleton: Story = {
  render: () => (
    <div className="w-75 space-y-3 rounded-lg border p-4">
      <Skeleton className="size-12 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-50" />
      </div>
    </div>
  ),
};

export const ArticleListSkeleton: Story = {
  render: () => (
    <div className="w-100 space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-4 w-[90%]" />
          <Skeleton className="h-4 w-[80%]" />
        </div>
      ))}
    </div>
  ),
};

export const TableSkeleton: Story = {
  render: () => (
    <div className="w-full space-y-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="flex gap-2">
          <Skeleton className="size-10 rounded" />
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-20" />
        </div>
      ))}
    </div>
  ),
};

export const DetailPageSkeleton: Story = {
  render: () => (
    <div className="w-full max-w-2xl space-y-4">
      <Skeleton className="h-8 w-75" />
      <Skeleton className="h-64 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[80%]" />
      </div>
    </div>
  ),
};
