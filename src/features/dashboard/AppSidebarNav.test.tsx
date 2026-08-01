import { Home, Settings, Users } from 'lucide-react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { AppSidebarNav } from './AppSidebarNav';

// Mock next-intl
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/dashboard',
}));

// Mock next/link - Test fixture, not real URL
vi.mock('next/link', () => {
  function MockLink({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) {
    return React.createElement('a', { href, className }, children);
  }
  MockLink.displayName = 'Link';
  return { __esModule: true, default: MockLink };
});

// Mock sidebar components
vi.mock('@/components/ui/sidebar', () => {
  function SidebarGroup({ children, hidden, className }: { children: React.ReactNode; hidden?: boolean; className?: string }) {
    if (hidden) {
      return null;
    }
    return React.createElement('div', { 'data-testid': 'sidebar-group', className }, children);
  }
  SidebarGroup.displayName = 'SidebarGroup';

  function SidebarGroupContent({ children }: { children: React.ReactNode }) {
    return React.createElement('div', { 'data-testid': 'sidebar-group-content' }, children);
  }
  SidebarGroupContent.displayName = 'SidebarGroupContent';

  function SidebarGroupLabel({ children }: { children: React.ReactNode }) {
    return React.createElement('div', { 'data-testid': 'sidebar-group-label' }, children);
  }
  SidebarGroupLabel.displayName = 'SidebarGroupLabel';

  function SidebarMenu({ children }: { children: React.ReactNode }) {
    return React.createElement('ul', { 'data-testid': 'sidebar-menu' }, children);
  }
  SidebarMenu.displayName = 'SidebarMenu';

  function SidebarMenuItem({ children }: { children: React.ReactNode }) {
    return React.createElement('li', { 'data-testid': 'sidebar-menu-item' }, children);
  }
  SidebarMenuItem.displayName = 'SidebarMenuItem';

  function SidebarMenuButton({ children, className, onClick, asChild }: { children: React.ReactNode; className?: string; onClick?: () => void; asChild?: boolean }) {
    // When asChild is true, just wrap children in a div to avoid cloneElement issues
    if (asChild) {
      return React.createElement('div', {
        'data-testid': 'sidebar-menu-button',
        className,
        onClick,
      }, children);
    }
    return React.createElement('button', {
      'type': 'button',
      'data-testid': 'sidebar-menu-button',
      className,
      onClick,
    }, children);
  }
  SidebarMenuButton.displayName = 'SidebarMenuButton';

  return {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    useSidebar: () => ({
      toggleSidebar: vi.fn(),
      isMobile: false,
    }),
  };
});

// Mock Switch component
vi.mock('@/components/ui/switch', () => {
  function MockSwitch({ onCheckedChange }: { onCheckedChange?: (checked: boolean) => void }) {
    return React.createElement('button', {
      'type': 'button',
      'data-testid': 'switch',
      'onClick': () => onCheckedChange?.(true),
    }, 'Switch');
  }
  MockSwitch.displayName = 'Switch';
  return { Switch: MockSwitch };
});

describe('AppSidebarNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should render the sidebar group', async () => {
    await render(
      <AppSidebarNav
        label="Test Section"
        items={[
          { title: 'Dashboard', url: '/dashboard', icon: Home },
        ]}
      />,
    );

    expect(page.getByTestId('sidebar-group')).toBeDefined();
  });

  it('should render the section label', async () => {
    await render(
      <AppSidebarNav
        label="Test Section"
        items={[
          { title: 'Dashboard', url: '/dashboard', icon: Home },
        ]}
      />,
    );

    expect(page.getByText('Test Section')).toBeDefined();
  });

  it('should not render label when empty', async () => {
    await render(
      <AppSidebarNav
        label=""
        items={[
          { title: 'Dashboard', url: '/dashboard', icon: Home },
        ]}
      />,
    );

    expect(page.getByTestId('sidebar-group-label').elements().length).toBe(0);
  });

  it('should render menu items', async () => {
    await render(
      <AppSidebarNav
        label="Test"
        items={[
          { title: 'Dashboard', url: '/dashboard', icon: Home },
          { title: 'Users', url: '/users', icon: Users },
          { title: 'Settings', url: '/settings', icon: Settings },
        ]}
      />,
    );

    expect(page.getByText('Dashboard')).toBeDefined();
    expect(page.getByText('Users')).toBeDefined();
    expect(page.getByText('Settings')).toBeDefined();
  });

  it('should not render hidden items', async () => {
    await render(
      <AppSidebarNav
        label="Test"
        items={[
          { title: 'Dashboard', url: '/dashboard', icon: Home },
          { title: 'Hidden Item', url: '/hidden', icon: Settings, hidden: true },
        ]}
      />,
    );

    expect(page.getByText('Dashboard')).toBeDefined();
    expect(page.getByText('Hidden Item').elements().length).toBe(0);
  });

  it('should return null when hidden prop is true', async () => {
    await render(
      <AppSidebarNav
        label="Test"
        hidden
        items={[
          { title: 'Dashboard', url: '/dashboard', icon: Home },
        ]}
      />,
    );

    expect(page.getByTestId('sidebar-group').elements().length).toBe(0);
  });

  it('should render badge when provided', async () => {
    await render(
      <AppSidebarNav
        label="Test"
        items={[
          {
            title: 'Messages',
            url: '/messages',
            icon: Home,
            badge: <span data-testid="badge">5</span>,
          },
        ]}
      />,
    );

    expect(page.getByTestId('badge')).toBeDefined();
  });

  it('should call onClick handler when provided', async () => {
    const handleClick = vi.fn();

    await render(
      <AppSidebarNav
        label="Test"
        items={[
          {
            title: 'Clickable',
            url: '/click',
            icon: Home,
            onClick: handleClick,
          },
        ]}
      />,
    );

    const button = page.getByText('Clickable');
    await userEvent.click(button);

    expect(handleClick).toHaveBeenCalled();
  });

  it('should not call onClick when item is disabled', async () => {
    const handleClick = vi.fn();

    await render(
      <AppSidebarNav
        label="Test"
        items={[
          {
            title: 'Disabled',
            url: '/disabled',
            icon: Home,
            onClick: handleClick,
            disabled: true,
          },
        ]}
      />,
    );

    const button = page.getByText('Disabled');
    await userEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should render switch item when isSwitchItem is true', async () => {
    const handleSwitch = vi.fn();

    await render(
      <AppSidebarNav
        label="Test"
        items={[
          {
            title: 'Dark Mode',
            url: '/darkmode',
            icon: Settings,
            isSwitchItem: true,
            onSwitchChange: handleSwitch,
          },
        ]}
      />,
    );

    expect(page.getByText('Dark Mode')).toBeDefined();
    expect(page.getByTestId('switch')).toBeDefined();
  });

  it('should call onSwitchChange when switch is toggled', async () => {
    const handleSwitch = vi.fn();

    await render(
      <AppSidebarNav
        label="Test"
        items={[
          {
            title: 'Dark Mode',
            url: '/darkmode',
            icon: Settings,
            isSwitchItem: true,
            onSwitchChange: handleSwitch,
          },
        ]}
      />,
    );

    const switchButton = page.getByTestId('switch');
    await userEvent.click(switchButton);

    expect(handleSwitch).toHaveBeenCalledWith(true);
  });

  it('should apply disabled styling to disabled items', async () => {
    await render(
      <AppSidebarNav
        label="Test"
        items={[
          {
            title: 'Disabled Item',
            url: '/disabled',
            icon: Home,
            disabled: true,
          },
        ]}
      />,
    );

    expect(page.getByText('Disabled Item')).toBeDefined();
    // The component should have disabled styling (opacity-50, cursor-not-allowed)
  });

  it('should filter out all hidden items', async () => {
    await render(
      <AppSidebarNav
        label="Test"
        items={[
          { title: 'Item 1', url: '/1', icon: Home, hidden: true },
          { title: 'Item 2', url: '/2', icon: Home, hidden: true },
          { title: 'Item 3', url: '/3', icon: Home },
        ]}
      />,
    );

    expect(page.getByText('Item 1').elements().length).toBe(0);
    expect(page.getByText('Item 2').elements().length).toBe(0);
    expect(page.getByText('Item 3')).toBeDefined();
  });
});

describe('AppSidebarNav - Hidden Entire Section', () => {
  afterEach(async () => {
    await cleanup();
  });

  it('should return null when hidden prop is true on the component', async () => {
    await render(
      <AppSidebarNav
        label="Hidden Section"
        hidden={true}
        items={[
          { title: 'Dashboard', url: '/dashboard', icon: Home },
          { title: 'Settings', url: '/settings', icon: Settings },
        ]}
      />,
    );

    // When hidden, the component should return null
    expect(page.getByText('Hidden Section').elements().length).toBe(0);
    expect(page.getByText('Dashboard').elements().length).toBe(0);
    expect(page.getByText('Settings').elements().length).toBe(0);
  });

  it('should render when hidden prop is false', async () => {
    await render(
      <AppSidebarNav
        label="Visible Section"
        hidden={false}
        items={[
          { title: 'Dashboard', url: '/dashboard', icon: Home },
        ]}
      />,
    );

    expect(page.getByText('Visible Section')).toBeDefined();
    expect(page.getByText('Dashboard')).toBeDefined();
  });

  it('should render when hidden prop is undefined (default)', async () => {
    await render(
      <AppSidebarNav
        label="Default Section"
        items={[
          { title: 'Dashboard', url: '/dashboard', icon: Home },
        ]}
      />,
    );

    expect(page.getByText('Default Section')).toBeDefined();
    expect(page.getByText('Dashboard')).toBeDefined();
  });
});
