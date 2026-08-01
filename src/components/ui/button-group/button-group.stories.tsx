import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Grid3x3, List } from 'lucide-react';
import React from 'react';
import { ButtonGroupItem, ButtonGroupRoot } from './button-group';

const meta = {
  title: 'UI/Button/ButtonGroup',
  component: ButtonGroupRoot,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ButtonGroupRoot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = React.useState('list');
    return (
      <ButtonGroupRoot value={value} onValueChange={setValue}>
        <ButtonGroupItem value="list" title="List view">
          <List className="size-4" />
        </ButtonGroupItem>
        <ButtonGroupItem value="grid" title="Grid view">
          <Grid3x3 className="size-4" />
        </ButtonGroupItem>
      </ButtonGroupRoot>
    );
  },
};

export const WithText: Story = {
  render: () => {
    const [value, setValue] = React.useState('option1');
    return (
      <ButtonGroupRoot value={value} onValueChange={setValue}>
        <ButtonGroupItem value="option1">Option 1</ButtonGroupItem>
        <ButtonGroupItem value="option2">Option 2</ButtonGroupItem>
        <ButtonGroupItem value="option3">Option 3</ButtonGroupItem>
      </ButtonGroupRoot>
    );
  },
};
