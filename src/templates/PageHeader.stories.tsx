import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Grid3x3, List, Plus, Tags } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroupItem, ButtonGroupRoot } from '@/components/ui/button-group';
import { FilterBar } from './FilterBar';
import { PageHeader } from './PageHeader';

const meta: Meta<typeof PageHeader> = {
  title: 'Templates/PageHeader',
  component: PageHeader,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: 'The main title of the page',
    },
    headerActions: {
      control: false,
      description: 'Optional actions that appear next to the title',
    },
    children: {
      control: false,
      description: 'Content that appears below the header',
    },
    className: {
      control: 'text',
      description: 'Optional CSS classes for the container',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Page Title',
  },
};

export const WithHeaderActions: Story = {
  args: {
    title: 'Memberships',
    headerActions: (
      <Button variant="outline">
        <Tags className="mr-1 size-4" />
        Manage Tags
      </Button>
    ),
  },
};

export const WithFilterBar: Story = {
  render: () => {
    const [searchValue, setSearchValue] = React.useState('');
    const [tagsValue, setTagsValue] = React.useState('all');
    const [instructorsValue, setInstructorsValue] = React.useState('all');
    const [viewType, setViewType] = React.useState('grid');

    return (
      <PageHeader
        title="Classes"
        headerActions={(
          <Button variant="outline">
            <Tags className="mr-1 size-4" />
            Manage Tags
          </Button>
        )}
      >
        <FilterBar
          searchConfig={{
            placeholder: 'Search classes...',
            value: searchValue,
            onChange: setSearchValue,
          }}
          dropdowns={[
            {
              id: 'tags',
              value: tagsValue,
              onChange: setTagsValue,
              placeholder: 'All Tags',
              options: [
                { value: 'all', label: 'All Tags' },
                { value: 'Adults', label: 'Adults' },
                { value: 'Kids', label: 'Kids' },
                { value: 'Women', label: 'Women' },
                { value: 'No Gi', label: 'No Gi' },
                { value: 'Gi', label: 'Gi' },
                { value: 'Competition', label: 'Competition' },
                { value: 'Open', label: 'Open' },
              ],
            },
            {
              id: 'instructors',
              value: instructorsValue,
              onChange: setInstructorsValue,
              placeholder: 'All Instructors',
              options: [
                { value: 'all', label: 'All Instructors' },
                { value: 'John Doe', label: 'John Doe' },
                { value: 'Jane Smith', label: 'Jane Smith' },
                { value: 'Mike Johnson', label: 'Mike Johnson' },
              ],
            },
          ]}
          filterActions={(
            <div className="flex items-center gap-2">
              <ButtonGroupRoot value={viewType} onValueChange={setViewType}>
                <ButtonGroupItem value="list" title="List view">
                  <List className="size-4" />
                  <span className="ml-1 hidden text-xs sm:ml-2 sm:inline">List</span>
                </ButtonGroupItem>
                <ButtonGroupItem value="grid" title="Grid view">
                  <Grid3x3 className="size-4" />
                  <span className="ml-1 hidden text-xs sm:ml-2 sm:inline">Grid</span>
                </ButtonGroupItem>
                <ButtonGroupItem value="weekly" title="Weekly view">
                  <span className="text-xs">Weekly</span>
                </ButtonGroupItem>
                <ButtonGroupItem value="monthly" title="Monthly view">
                  <span className="text-xs">Monthly</span>
                </ButtonGroupItem>
              </ButtonGroupRoot>

              <Button>
                <Plus className="size-4" />
                <span className="ml-1 hidden sm:inline">Add New Class</span>
              </Button>
            </div>
          )}
        />
      </PageHeader>
    );
  },
};

export const DarkMode: Story = {
  args: {
    title: 'Memberships',
    headerActions: (
      <Button variant="outline">
        <Tags className="mr-1 size-4" />
        Manage Tags
      </Button>
    ),
  },
  parameters: {
    themes: {
      themeOverride: 'dark',
    },
  },
  decorators: [
    Story => (
      <div className="dark">
        <div className="bg-background p-4 text-foreground">
          <Story />
        </div>
      </div>
    ),
  ],
};
