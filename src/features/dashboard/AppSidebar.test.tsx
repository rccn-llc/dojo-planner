import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { AppSidebar } from './AppSidebar';

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    signOut: vi.fn(),
  }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      academy_section_label: 'Academy',
      cookie_preferences: 'Cookie preferences',
      business_section_label: 'Business',
      performance: 'Performance',
      classes: 'Classes',
      members: 'Members',
      roles: 'Roles',
      staff: 'Staff',
      messaging: 'Messaging',
      transactions: 'Transactions',
      reports: 'Reports',
      memberships: 'Memberships',
      programs: 'Programs',
      marketing: 'Marketing',
      catalog: 'Catalog',
      waivers: 'Waivers',
      location: 'Location',
      log_out: 'Log Out',
    };
    return translations[key] || key;
  },
  useLocale: () => 'en',
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/dashboard',
}));

// Mock next/link
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock sidebar components
vi.mock('@/components/ui/sidebar', () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar">{children}</div>
  ),
  SidebarContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-content">{children}</div>
  ),
  SidebarHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="sidebar-header" className={className}>{children}</div>
  ),
  SidebarRail: () => <div data-testid="sidebar-rail" />,
  SidebarGroup: ({ children, hidden, className }: { children: React.ReactNode; hidden?: boolean; className?: string }) => (
    hidden ? null : <div data-testid="sidebar-group" className={className}>{children}</div>
  ),
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-group-content">{children}</div>
  ),
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-group-label">{children}</div>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <ul data-testid="sidebar-menu">{children}</ul>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <li data-testid="sidebar-menu-item">{children}</li>
  ),
  SidebarMenuButton: ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
    <button type="button" data-testid="sidebar-menu-button" className={className} onClick={onClick}>{children}</button>
  ),
  useSidebar: () => ({
    toggleSidebar: vi.fn(),
    isMobile: false,
  }),
}));

// Mock OrganizationSelector
vi.mock('@/features/dashboard/OrganizationSelector', () => ({
  OrganizationSelector: () => <div data-testid="organization-selector">Org Selector</div>,
}));

// Mock Logo
vi.mock('@/templates/Logo', () => ({
  Logo: () => <div data-testid="logo">Logo</div>,
}));

describe('AppSidebar - Translation Keys', () => {
  describe('Navigation structure', () => {
    it('should have Academy section with correct navigation items', () => {
      const dashboardLayout = messages.DashboardLayout;

      // Check Academy section label exists
      expect(dashboardLayout.academy_section_label).toBe('Academy');

      // Check Academy items exist and have correct values
      expect(dashboardLayout.programs).toBe('Programs');
      expect(dashboardLayout.classes).toBe('Classes/Events');
      expect(dashboardLayout.members).toBe('Members');
      expect(dashboardLayout.roles).toBe('Roles');
      expect(dashboardLayout.staff).toBe('Staff');
      expect(dashboardLayout.messaging).toBe('Messaging');
    });

    it('should have Business section with correct navigation items', () => {
      const dashboardLayout = messages.DashboardLayout;

      // Check Business section label exists
      expect(dashboardLayout.business_section_label).toBe('Business');

      // Check Business items exist and have correct values
      expect(dashboardLayout.performance).toBe('Performance');
      expect(dashboardLayout.transactions).toBe('Transactions');
      expect(dashboardLayout.reports).toBe('Reports');
      expect(dashboardLayout.memberships).toBe('Memberships');
      expect(dashboardLayout.marketing).toBe('Marketing');
    });

    it('should have the Location navigation key', () => {
      const dashboardLayout = messages.DashboardLayout;

      expect(dashboardLayout.location).toBe('Location');
    });

    it('should have Log Out option', () => {
      const dashboardLayout = messages.DashboardLayout;

      // Check Log Out option exists
      expect(dashboardLayout.log_out).toBe('Log Out');
    });

    it('should have all required localization keys for navigation', () => {
      const dashboardLayout = messages.DashboardLayout;
      // Note: subscription was moved to user menu dropdown
      // Note: help was moved to floating HelpButton component
      const requiredKeys = [
        'academy_section_label',
        'business_section_label',
        'performance',
        'classes',
        'members',
        'roles',
        'staff',
        'messaging',
        'transactions',
        'reports',
        'memberships',
        'programs',
        'marketing',
        'location',
        'log_out',
      ];

      for (const key of requiredKeys) {
        expect(dashboardLayout).toHaveProperty(key);
        expect(dashboardLayout[key as keyof typeof dashboardLayout]).toBeTruthy();
      }
    });
  });
});

describe('AppSidebar - Component Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the sidebar', async () => {
    await render(<AppSidebar />);

    expect(page.getByTestId('sidebar')).toBeDefined();
  });

  it('should render the logo', async () => {
    await render(<AppSidebar />);

    expect(page.getByTestId('logo')).toBeDefined();
  });

  it('should render the organization selector', async () => {
    await render(<AppSidebar />);

    expect(page.getByTestId('organization-selector')).toBeDefined();
  });

  it('should render Academy section with menu items', async () => {
    await render(<AppSidebar />);

    expect(page.getByText('Academy')).toBeDefined();
    expect(page.getByText('Programs')).toBeDefined();
    expect(page.getByText('Classes')).toBeDefined();
    expect(page.getByText('Members')).toBeDefined();
    expect(page.getByText('Roles')).toBeDefined();
    expect(page.getByText('Staff')).toBeDefined();
  });

  it('should render Business section with menu items', async () => {
    await render(<AppSidebar />);

    expect(page.getByText('Business')).toBeDefined();
    expect(page.getByText('Performance')).toBeDefined();
    expect(page.getByText('Transactions')).toBeDefined();
    expect(page.getByText('Reports')).toBeDefined();
    expect(page.getByText('Memberships')).toBeDefined();
    expect(page.getByText('Marketing')).toBeDefined();
  });

  it('should NOT render Settings section (hidden)', async () => {
    await render(<AppSidebar />);

    // Settings section should be hidden (only Preferences lived there now, also hidden).
    // Matched exactly: the visible "Cookie preferences" item is a different entry
    // and must not make this assertion fail.
    expect(page.getByText('Settings', { exact: true }).elements().length).toBe(0);
    expect(page.getByText('Preferences', { exact: true }).elements().length).toBe(0);
  });

  it('should render Location item under Academy as visible last item', async () => {
    await render(<AppSidebar />);

    // Location Settings now lives under Academy (no role passed = manager by default)
    expect(page.getByText('Location')).toBeDefined();
  });

  it('should render Log Out option', async () => {
    await render(<AppSidebar />);

    expect(page.getByText('Log Out')).toBeDefined();
  });

  it('should not render Messaging when hidden', async () => {
    await render(<AppSidebar />);

    // Messaging is marked as hidden in the sidebar
    expect(page.getByText('Messaging').elements().length).toBe(0);
  });

  it('should render sidebar header', async () => {
    await render(<AppSidebar />);

    expect(page.getByTestId('sidebar-header')).toBeDefined();
  });

  it('should render sidebar content', async () => {
    await render(<AppSidebar />);

    expect(page.getByTestId('sidebar-content')).toBeDefined();
  });

  it('should render sidebar rail', async () => {
    await render(<AppSidebar />);

    expect(page.getByTestId('sidebar-rail')).toBeDefined();
  });
});

describe('AppSidebar - Role-based visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show all items for admin role', async () => {
    await render(<AppSidebar userRole="org:admin" />);

    expect(page.getByText('Reports')).toBeDefined();

    expect(page.getByText('Transactions')).toBeDefined();

    expect(page.getByText('Marketing')).toBeDefined();

    expect(page.getByText('Roles')).toBeDefined();

    expect(page.getByText('Staff')).toBeDefined();

    expect(page.getByText('Location')).toBeDefined();
  });

  it('should show all items for academy owner role', async () => {
    await render(<AppSidebar userRole="org:academy_owner" />);

    expect(page.getByText('Reports')).toBeDefined();

    expect(page.getByText('Transactions')).toBeDefined();

    expect(page.getByText('Marketing')).toBeDefined();

    expect(page.getByText('Roles')).toBeDefined();

    expect(page.getByText('Staff')).toBeDefined();

    expect(page.getByText('Location')).toBeDefined();
  });

  it('should hide management items for front desk role', async () => {
    await render(<AppSidebar userRole="org:front_desk" />);

    // Front desk should see these
    expect(page.getByText('Performance')).toBeDefined();

    expect(page.getByText('Programs')).toBeDefined();

    expect(page.getByText('Classes')).toBeDefined();

    expect(page.getByText('Members')).toBeDefined();

    expect(page.getByText('Memberships')).toBeDefined();

    // Front desk should NOT see these
    expect(page.getByText('Reports').elements().length).toBe(0);

    expect(page.getByText('Transactions').elements().length).toBe(0);

    expect(page.getByText('Marketing').elements().length).toBe(0);

    expect(page.getByText('Catalog').elements().length).toBe(0);

    expect(page.getByText('Waivers').elements().length).toBe(0);

    expect(page.getByText('Roles').elements().length).toBe(0);

    expect(page.getByText('Staff').elements().length).toBe(0);

    expect(page.getByText('Location').elements().length).toBe(0);
  });

  it('should always show log out for any role', async () => {
    await render(<AppSidebar userRole="org:front_desk" />);

    expect(page.getByText('Log Out')).toBeDefined();
  });
});
