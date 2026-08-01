import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../command';

const meta = {
  title: 'UI/Containers/Command',
  component: Command,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Command className="w-75 rounded-lg border">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <span>Search</span>
          </CommandItem>
          <CommandItem>
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

export const WithGroups: Story = {
  render: () => (
    <Command className="w-75 rounded-lg border">
      <CommandInput placeholder="Search commands..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="File">
          <CommandItem>
            <span>New File</span>
          </CommandItem>
          <CommandItem>
            <span>Open File</span>
          </CommandItem>
          <CommandItem>
            <span>Save</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Edit">
          <CommandItem>
            <span>Cut</span>
          </CommandItem>
          <CommandItem>
            <span>Copy</span>
          </CommandItem>
          <CommandItem>
            <span>Paste</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

export const Searchable: Story = {
  render: () => (
    <Command className="w-75 rounded-lg border">
      <CommandInput placeholder="Search users..." />
      <CommandList>
        <CommandEmpty>No users found.</CommandEmpty>
        <CommandGroup heading="Users">
          <CommandItem>
            <span>Alice Johnson</span>
          </CommandItem>
          <CommandItem>
            <span>Bob Smith</span>
          </CommandItem>
          <CommandItem>
            <span>Charlie Brown</span>
          </CommandItem>
          <CommandItem>
            <span>Diana Prince</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
