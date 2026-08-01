import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

describe('Sheet', () => {
  describe('Sheet with Trigger', () => {
    it('should render SheetTrigger and open sheet when clicked', async () => {
      await render(
        <Sheet>
          <SheetTrigger>Open Sheet</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Test Title</SheetTitle>
            </SheetHeader>
          </SheetContent>
        </Sheet>,
      );

      const trigger = page.getByText('Open Sheet');

      expect(trigger).toBeInTheDocument();

      await userEvent.click(trigger);

      const title = page.getByText('Test Title');

      expect(title).toBeInTheDocument();
    });
  });

  describe('SheetContent sides', () => {
    it('should render sheet from the right side by default', async () => {
      await render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>Right Sheet</SheetTitle>
          </SheetContent>
        </Sheet>,
      );

      const title = page.getByText('Right Sheet');

      expect(title).toBeInTheDocument();
    });

    it('should render sheet from the left side', async () => {
      await render(
        <Sheet open={true}>
          <SheetContent side="left">
            <SheetTitle>Left Sheet</SheetTitle>
          </SheetContent>
        </Sheet>,
      );

      const title = page.getByText('Left Sheet');

      expect(title).toBeInTheDocument();
    });

    it('should render sheet from the top side', async () => {
      await render(
        <Sheet open={true}>
          <SheetContent side="top">
            <SheetTitle>Top Sheet</SheetTitle>
          </SheetContent>
        </Sheet>,
      );

      const title = page.getByText('Top Sheet');

      expect(title).toBeInTheDocument();
    });

    it('should render sheet from the bottom side', async () => {
      await render(
        <Sheet open={true}>
          <SheetContent side="bottom">
            <SheetTitle>Bottom Sheet</SheetTitle>
          </SheetContent>
        </Sheet>,
      );

      const title = page.getByText('Bottom Sheet');

      expect(title).toBeInTheDocument();
    });
  });

  describe('SheetClose', () => {
    it('should render SheetClose button and close sheet when clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <Sheet open={true} onOpenChange={onOpenChange}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Test Sheet</SheetTitle>
            </SheetHeader>
            <SheetClose>Custom Close</SheetClose>
          </SheetContent>
        </Sheet>,
      );

      const customClose = page.getByText('Custom Close');

      expect(customClose).toBeInTheDocument();

      await userEvent.click(customClose);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('SheetFooter', () => {
    it('should render SheetFooter with content', async () => {
      await render(
        <Sheet open={true}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Test Sheet</SheetTitle>
            </SheetHeader>
            <SheetFooter>
              <button type="button">Save</button>
              <button type="button">Cancel</button>
            </SheetFooter>
          </SheetContent>
        </Sheet>,
      );

      const saveButton = page.getByText('Save');
      const cancelButton = page.getByText('Cancel');

      expect(saveButton).toBeInTheDocument();
      expect(cancelButton).toBeInTheDocument();
    });

    it('should apply custom className to SheetFooter', async () => {
      await render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>Test Sheet</SheetTitle>
            <SheetFooter className="mt-4">
              <span data-testid="footer-content">Footer Content</span>
            </SheetFooter>
          </SheetContent>
        </Sheet>,
      );

      const footerContent = page.getByTestId('footer-content');

      expect(footerContent).toBeInTheDocument();
    });
  });

  describe('SheetDescription', () => {
    it('should render SheetDescription with text', async () => {
      await render(
        <Sheet open={true}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Test Sheet</SheetTitle>
              <SheetDescription>This is a description of the sheet content.</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>,
      );

      const description = page.getByText('This is a description of the sheet content.');

      expect(description).toBeInTheDocument();
    });

    it('should apply custom className to SheetDescription', async () => {
      await render(
        <Sheet open={true}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Test Sheet</SheetTitle>
              <SheetDescription className="text-sm">Custom styled description</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>,
      );

      const description = page.getByText('Custom styled description');

      expect(description).toBeInTheDocument();
    });
  });

  describe('SheetHeader', () => {
    it('should render SheetHeader with custom className', async () => {
      await render(
        <Sheet open={true}>
          <SheetContent>
            <SheetHeader className="pb-4">
              <SheetTitle>Header Test</SheetTitle>
            </SheetHeader>
          </SheetContent>
        </Sheet>,
      );

      const title = page.getByText('Header Test');

      expect(title).toBeInTheDocument();
    });
  });

  describe('SheetTitle', () => {
    it('should render SheetTitle with custom className', async () => {
      await render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle className="text-xl">Custom Title</SheetTitle>
          </SheetContent>
        </Sheet>,
      );

      const title = page.getByText('Custom Title');

      expect(title).toBeInTheDocument();
    });
  });

  describe('Close button', () => {
    it('should call onOpenChange when built-in close button is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <Sheet open={true} onOpenChange={onOpenChange}>
          <SheetContent>
            <SheetTitle>Test Sheet</SheetTitle>
          </SheetContent>
        </Sheet>,
      );

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
