import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta = {
  title: 'UI/Navigation/Tabs',
  component: Tabs,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-100">
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <p className="text-sm text-muted-foreground">Content for Tab 1</p>
      </TabsContent>
      <TabsContent value="tab2">
        <p className="text-sm text-muted-foreground">Content for Tab 2</p>
      </TabsContent>
      <TabsContent value="tab3">
        <p className="text-sm text-muted-foreground">Content for Tab 3</p>
      </TabsContent>
    </Tabs>
  ),
};

export const TwoTabs: Story = {
  render: () => (
    <Tabs defaultValue="active" className="w-75">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="inactive">Inactive</TabsTrigger>
      </TabsList>
      <TabsContent value="active">
        <p className="text-sm text-muted-foreground">This tab is currently active.</p>
      </TabsContent>
      <TabsContent value="inactive">
        <p className="text-sm text-muted-foreground">This tab is inactive.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const Calendar: Story = {
  render: () => (
    <Tabs defaultValue="month" className="w-full max-w-md">
      <TabsList>
        <TabsTrigger value="month">Month</TabsTrigger>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="day">Day</TabsTrigger>
      </TabsList>
      <TabsContent value="month">
        <div className="space-y-2">
          <p className="text-sm font-medium">Month View</p>
          <p className="text-sm text-muted-foreground">Calendar in month view showing all days of the month.</p>
        </div>
      </TabsContent>
      <TabsContent value="week">
        <div className="space-y-2">
          <p className="text-sm font-medium">Week View</p>
          <p className="text-sm text-muted-foreground">Calendar in week view showing the current week.</p>
        </div>
      </TabsContent>
      <TabsContent value="day">
        <div className="space-y-2">
          <p className="text-sm font-medium">Day View</p>
          <p className="text-sm text-muted-foreground">Calendar in day view showing the current day.</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const DisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-100">
      <TabsList>
        <TabsTrigger value="tab1">Enabled</TabsTrigger>
        <TabsTrigger value="tab2" disabled>
          Disabled
        </TabsTrigger>
        <TabsTrigger value="tab3">Enabled</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <p className="text-sm text-muted-foreground">This tab is enabled.</p>
      </TabsContent>
      <TabsContent value="tab3">
        <p className="text-sm text-muted-foreground">This tab is also enabled.</p>
      </TabsContent>
    </Tabs>
  ),
};
