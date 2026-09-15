import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BookMarked, CreditCard, Home, Mail, Settings, Users, Users2 } from 'lucide-react';
import { vi } from 'vitest';
import { Badge } from '@/components/ui/badge';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebarNav } from './AppSidebarNav';

vi.mock('next-intl', async () => {
  const actual = await vi.importActual('next-intl');
  return {
    ...actual,
    useLocale: () => 'en',
  };
});

const meta = {
  title: 'Features/Dashboard/AppSidebarNav',
  component: AppSidebarNav,
  tags: ['autodocs'],
  decorators: [
    Story => (
      <SidebarProvider>
        <Story />
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof AppSidebarNav>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockItems = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: Home,
  },
  {
    title: 'Classes',
    url: '/dashboard/classes',
    icon: BookMarked,
  },
  {
    title: 'Members',
    url: '/dashboard/members',
    icon: Users,
  },
  {
    title: 'Staff',
    url: '/dashboard/staff',
    icon: Users2,
  },
  {
    title: 'Messaging',
    url: '/dashboard/messaging',
    icon: Mail,
    badge: <Badge variant="default">40</Badge>,
    disabled: true,
  },
];

export const Default: Story = {
  args: {
    label: 'Academy',
    items: mockItems,
  },
};

export const ActiveHighlight: Story = {
  args: {
    label: 'Academy',
    items: [
      {
        title: 'Dashboard',
        url: '/dashboard',
        icon: Home,
      },
      {
        title: 'Location Settings',
        url: '/dashboard/location-settings',
        icon: Settings,
      },
      {
        title: 'Security',
        url: '/dashboard/security',
        icon: Settings,
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows how the active nav item is highlighted with `bg-slate-200` in light mode and `bg-slate-700` in dark mode. The highlighting is typically set based on the current pathname.',
      },
    },
  },
  render: args => (
    <div className="space-y-8">
      <div>
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Light Mode Active Item</h3>
        <div className="rounded-lg border bg-white p-4">
          <AppSidebarNav {...args} />
        </div>
      </div>
      <div>
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">Dark Mode Active Item</h3>
        <div className="dark rounded-lg border bg-slate-950 p-4">
          <AppSidebarNav {...args} />
        </div>
      </div>
    </div>
  ),
};

export const WithDisabledItems: Story = {
  args: {
    label: 'Settings',
    items: [
      {
        title: 'Account Settings',
        url: '/dashboard/account-settings',
        icon: Settings,
      },
      {
        title: 'Location Settings',
        url: '/dashboard/location-settings',
        icon: Settings,
        disabled: true,
      },
      {
        title: 'Security',
        url: '/dashboard/security',
        icon: Settings,
      },
    ],
  },
};

export const WithBadges: Story = {
  args: {
    label: 'Business',
    items: [
      {
        title: 'Finances',
        url: '/dashboard/finances',
        icon: Home,
      },
      {
        title: 'Memberships',
        url: '/dashboard/memberships',
        icon: Users2,
      },
      {
        title: 'Subscription',
        url: '/dashboard/subscription',
        icon: CreditCard,
        badge: <Badge variant="secondary">Active</Badge>,
      },
    ],
  },
};
