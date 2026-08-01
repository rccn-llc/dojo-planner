import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Separator } from '../separator';

const meta = {
  title: 'UI/Display/Separator',
  component: Separator,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-75 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Section 1</h3>
        <p className="text-sm text-gray-500">Content goes here</p>
      </div>
      <Separator />
      <div>
        <h3 className="text-lg font-semibold">Section 2</h3>
        <p className="text-sm text-gray-500">More content here</p>
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-25 items-center gap-4">
      <div>
        <h3 className="text-sm font-semibold">Left</h3>
        <p className="text-xs text-gray-500">Content</p>
      </div>
      <Separator orientation="vertical" />
      <div>
        <h3 className="text-sm font-semibold">Right</h3>
        <p className="text-xs text-gray-500">Content</p>
      </div>
    </div>
  ),
};

export const InMenu: Story = {
  render: () => (
    <div className="w-50 overflow-hidden rounded-lg border">
      <button type="button" className="w-full px-4 py-2 text-left hover:bg-gray-100">
        Edit
      </button>
      <button type="button" className="w-full px-4 py-2 text-left hover:bg-gray-100">
        Copy
      </button>
      <Separator className="my-0" />
      <button type="button" className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100">
        Delete
      </button>
    </div>
  ),
};

export const WithText: Story = {
  render: () => (
    <div className="w-75 space-y-4">
      <div className="text-center">
        <div className="flex items-center gap-4">
          <Separator className="flex-1" />
          <span className="text-sm text-gray-500">OR</span>
          <Separator className="flex-1" />
        </div>
      </div>
    </div>
  ),
};
