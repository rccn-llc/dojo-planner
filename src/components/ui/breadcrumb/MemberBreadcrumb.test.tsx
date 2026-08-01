import { describe, expect, it, vi } from 'vitest';

import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { MemberBreadcrumb } from './MemberBreadcrumb';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
  }),
}));

describe('MemberBreadcrumb', () => {
  describe('Render method', () => {
    it('should render back button with chevron icon', async () => {
      await render(<MemberBreadcrumb memberName="Anika Smith" />);

      const button = page.getByRole('button', { name: /Go back to members/i });

      expect(button).toBeInTheDocument();
    });

    it('should render Members link text', async () => {
      await render(<MemberBreadcrumb memberName="Anika Smith" />);

      expect(page.getByText('Members')).toBeInTheDocument();
    });

    it('should render member name', async () => {
      await render(<MemberBreadcrumb memberName="Anika Smith" />);

      expect(page.getByText('Anika Smith')).toBeInTheDocument();
    });

    it('should render greater-than separator', async () => {
      await render(<MemberBreadcrumb memberName="John Doe" />);

      const separator = page.getByText('>');

      expect(separator).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should call onBackClick when back button is clicked', async () => {
      const onBackClick = vi.fn();
      await render(<MemberBreadcrumb memberName="Anika Smith" onBackClick={onBackClick} />);

      const backButton = page.getByRole('button', { name: /Go back to members/i });
      await backButton.click();

      expect(onBackClick).toHaveBeenCalled();
    });
  });
});
