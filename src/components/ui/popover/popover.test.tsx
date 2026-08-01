import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover';

describe('Popover', () => {
  describe('Rendering', () => {
    it('should render the trigger element', async () => {
      await render(
        <Popover>
          <PopoverTrigger>Open Popover</PopoverTrigger>
          <PopoverContent>Popover Content</PopoverContent>
        </Popover>,
      );

      expect(page.getByText('Open Popover')).toBeInTheDocument();
    });

    it('should not render content when closed', async () => {
      await render(
        <Popover>
          <PopoverTrigger>Open Popover</PopoverTrigger>
          <PopoverContent>Popover Content</PopoverContent>
        </Popover>,
      );

      expect(page.getByText('Popover Content').elements()).toHaveLength(0);
    });
  });

  describe('Interaction', () => {
    it('should show content when trigger is clicked', async () => {
      await render(
        <Popover>
          <PopoverTrigger>Open Popover</PopoverTrigger>
          <PopoverContent>Popover Content</PopoverContent>
        </Popover>,
      );

      const trigger = page.getByText('Open Popover');
      await userEvent.click(trigger.element());

      expect(page.getByText('Popover Content')).toBeInTheDocument();
    });

    it('should hide content when trigger is clicked again', async () => {
      await render(
        <Popover>
          <PopoverTrigger>Open Popover</PopoverTrigger>
          <PopoverContent>Popover Content</PopoverContent>
        </Popover>,
      );

      const trigger = page.getByText('Open Popover');
      await userEvent.click(trigger.element());
      await userEvent.click(trigger.element());

      expect(page.getByText('Popover Content').elements()).toHaveLength(0);
    });

    it('should be controllable via open prop', async () => {
      await render(
        <Popover open>
          <PopoverTrigger>Open Popover</PopoverTrigger>
          <PopoverContent>Popover Content</PopoverContent>
        </Popover>,
      );

      expect(page.getByText('Popover Content')).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('should apply custom className to content', async () => {
      await render(
        <Popover defaultOpen>
          <PopoverTrigger>Open Popover</PopoverTrigger>
          <PopoverContent className="w-96">Content</PopoverContent>
        </Popover>,
      );

      const content = page.getByText('Content');

      expect(content).toHaveClass('w-96');
    });
  });

  describe('PopoverAnchor', () => {
    it('should render the anchor element', async () => {
      await render(
        <Popover>
          <PopoverAnchor>Anchor Element</PopoverAnchor>
          <PopoverTrigger>Open Popover</PopoverTrigger>
          <PopoverContent>Popover Content</PopoverContent>
        </Popover>,
      );

      expect(page.getByText('Anchor Element')).toBeInTheDocument();
    });
  });
});
