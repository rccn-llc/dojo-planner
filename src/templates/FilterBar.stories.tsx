import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Grid3x3, List, Plus } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroupItem, ButtonGroupRoot } from '@/components/ui/button-group';
import { FilterBar } from './FilterBar';

const meta: Meta<typeof FilterBar> = {
  title: 'Templates/FilterBar',
  component: FilterBar,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    searchConfig: {
      control: false,
      description: 'Configuration for the search input',
    },
    dropdowns: {
      control: false,
      description: 'Optional dropdown filters',
    },
    filterActions: {
      control: false,
      description: 'Actions that appear on the right side',
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
  render: () => {
    const [searchValue, setSearchValue] = React.useState('');
    const [statusValue, setStatusValue] = React.useState('all');

    return (
      <FilterBar
        searchConfig={{
          placeholder: 'Search...',
          value: searchValue,
          onChange: setSearchValue,
        }}
        dropdowns={[
          {
            id: 'status',
            value: statusValue,
            onChange: setStatusValue,
            placeholder: 'All Statuses',
            options: [
              { value: 'all', label: 'All Statuses' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
          },
        ]}
        filterActions={(
          <Button>
            <Plus className="size-4" />
            <span className="ml-1 hidden sm:inline">Add New</span>
          </Button>
        )}
      />
    );
  },
};

export const Programs: Story = {
  render: () => {
    const [searchValue, setSearchValue] = React.useState('');
    const [statusValue, setStatusValue] = React.useState('all');

    return (
      <FilterBar
        searchConfig={{
          placeholder: 'Search programs...',
          value: searchValue,
          onChange: setSearchValue,
        }}
        dropdowns={[
          {
            id: 'status',
            value: statusValue,
            onChange: setStatusValue,
            placeholder: 'All Statuses',
            options: [
              { value: 'all', label: 'All Statuses' },
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
            ],
          },
        ]}
        filterActions={(
          <Button>
            <Plus className="size-4" />
            <span className="ml-1 hidden sm:inline">Add New Program</span>
          </Button>
        )}
      />
    );
  },
};

export const Classes: Story = {
  render: () => {
    const [searchValue, setSearchValue] = React.useState('');
    const [tagsValue, setTagsValue] = React.useState('all');
    const [instructorsValue, setInstructorsValue] = React.useState('all');
    const [viewType, setViewType] = React.useState('grid');

    return (
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
    );
  },
};

export const Memberships: Story = {
  render: () => {
    const [searchValue, setSearchValue] = React.useState('');
    const [tagsValue, setTagsValue] = React.useState('all');
    const [programsValue, setProgramsValue] = React.useState('all');

    return (
      <FilterBar
        searchConfig={{
          placeholder: 'Search memberships...',
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
              { value: 'Active', label: 'Active' },
              { value: 'Trial', label: 'Trial' },
              { value: 'Inactive', label: 'Inactive' },
              { value: 'Monthly', label: 'Monthly' },
            ],
          },
          {
            id: 'programs',
            value: programsValue,
            onChange: setProgramsValue,
            placeholder: 'All Programs',
            options: [
              { value: 'all', label: 'All Programs' },
              { value: 'Adult', label: 'Adult' },
              { value: 'Kids', label: 'Kids' },
              { value: 'Women', label: 'Women' },
              { value: 'Competition', label: 'Competition' },
            ],
          },
        ]}
        filterActions={(
          <Button>
            <Plus className="size-4" />
            <span className="ml-1 hidden sm:inline">Add New Membership</span>
          </Button>
        )}
      />
    );
  },
};

export const NoActions: Story = {
  render: () => {
    const [searchValue, setSearchValue] = React.useState('');
    const [statusValue, setStatusValue] = React.useState('all');

    return (
      <FilterBar
        searchConfig={{
          placeholder: 'Search...',
          value: searchValue,
          onChange: setSearchValue,
        }}
        dropdowns={[
          {
            id: 'status',
            value: statusValue,
            onChange: setStatusValue,
            placeholder: 'All Statuses',
            options: [
              { value: 'all', label: 'All Statuses' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
          },
        ]}
      />
    );
  },
};

export const NoFilters: Story = {
  render: () => (
    <FilterBar
      searchConfig={{
        placeholder: '',
        value: '',
        onChange: () => {},
      }}
      filterActions={(
        <Button>
          <Plus className="size-4" />
          <span className="ml-1 hidden sm:inline">Add New</span>
        </Button>
      )}
    />
  ),
};

export const DarkMode: Story = {
  render: () => {
    const [searchValue, setSearchValue] = React.useState('');
    const [tagsValue, setTagsValue] = React.useState('all');
    const [programsValue, setProgramsValue] = React.useState('all');

    return (
      <FilterBar
        searchConfig={{
          placeholder: 'Search memberships...',
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
              { value: 'Active', label: 'Active' },
              { value: 'Trial', label: 'Trial' },
              { value: 'Inactive', label: 'Inactive' },
              { value: 'Monthly', label: 'Monthly' },
            ],
          },
          {
            id: 'programs',
            value: programsValue,
            onChange: setProgramsValue,
            placeholder: 'All Programs',
            options: [
              { value: 'all', label: 'All Programs' },
              { value: 'Adult', label: 'Adult' },
              { value: 'Kids', label: 'Kids' },
              { value: 'Women', label: 'Women' },
              { value: 'Competition', label: 'Competition' },
            ],
          },
        ]}
        filterActions={(
          <Button>
            <Plus className="size-4" />
            <span className="ml-1 hidden sm:inline">Add New Membership</span>
          </Button>
        )}
      />
    );
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
