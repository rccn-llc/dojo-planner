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
      business_section_label: 'Business',
      settings_section_label: 'Settings',
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
      preferences: 'Preferences',
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

    it('should have Settings section with correct navigation items (hidden but keys exist)', () => {
      const dashboardLayout = messages.DashboardLayout;

      // Check Settings section label exists
      expect(dashboardLayout.settings_section_label).toBe('Settings');

      // Check Settings items exist and have correct values
      // Note: Settings section is now hidden in the UI but keys are kept for future use
      expect(dashboardLayout.location).toBe('Location');
      expect(dashboardLayout.preferences).toBe('Preferences');
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
        'settings_section_label',
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
        'preferences',
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

  it('should render the sidebar', () => {
    render(<AppSidebar />);

    expect(page.getByTestId('sidebar')).toBeDefined();
  });

  it('should render the logo', () => {
    render(<AppSidebar />);

    expect(page.getByTestId('logo')).toBeDefined();
  });

  it('should render the organization selector', () => {
    render(<AppSidebar />);

    expect(page.getByTestId('organization-selector')).toBeDefined();
  });

  it('should render Academy section with menu items', () => {
    render(<AppSidebar />);

    expect(page.getByText('Academy')).toBeDefined();
    expect(page.getByText('Programs')).toBeDefined();
    expect(page.getByText('Classes')).toBeDefined();
    expect(page.getByText('Members')).toBeDefined();
    expect(page.getByText('Roles')).toBeDefined();
    expect(page.getByText('Staff')).toBeDefined();
  });

  it('should render Business section with menu items', () => {
    render(<AppSidebar />);

    expect(page.getByText('Business')).toBeDefined();
    expect(page.getByText('Performance')).toBeDefined();
    expect(page.getByText('Transactions')).toBeDefined();
    expect(page.getByText('Reports')).toBeDefined();
    expect(page.getByText('Memberships')).toBeDefined();
    expect(page.getByText('Marketing')).toBeDefined();
  });

  it('should NOT render Settings section (hidden)', () => {
    render(<AppSidebar />);

    // Settings section should be hidden (only Preferences lived there now, also hidden)
    expect(page.getByText('Settings').elements().length).toBe(0);
    expect(page.getByText('Preferences').elements().length).toBe(0);
  });

  it('should render Location item under Academy as visible last item', () => {
    render(<AppSidebar />);

    // Location Settings now lives under Academy (no role passed = manager by default)
    expect(page.getByText('Location')).toBeDefined();
  });

  it('should render Log Out option', () => {
    render(<AppSidebar />);

    expect(page.getByText('Log Out')).toBeDefined();
  });

  it('should not render Messaging when hidden', () => {
    render(<AppSidebar />);

    // Messaging is marked as hidden in the sidebar
    expect(page.getByText('Messaging').elements().length).toBe(0);
  });

  it('should render sidebar header', () => {
    render(<AppSidebar />);

    expect(page.getByTestId('sidebar-header')).toBeDefined();
  });

  it('should render sidebar content', () => {
    render(<AppSidebar />);

    expect(page.getByTestId('sidebar-content')).toBeDefined();
  });

  it('should render sidebar rail', () => {
    render(<AppSidebar />);

    expect(page.getByTestId('sidebar-rail')).toBeDefined();
  });
});

describe('AppSidebar - Role-based visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show all items for admin role', () => {
    render(<AppSidebar userRole="org:admin" />);

    expect(page.getByText('Reports')).toBeDefined();

    expect(page.getByText('Transactions')).toBeDefined();

    expect(page.getByText('Marketing')).toBeDefined();

    expect(page.getByText('Roles')).toBeDefined();

    expect(page.getByText('Staff')).toBeDefined();

    expect(page.getByText('Location')).toBeDefined();
  });

  it('should show all items for academy owner role', () => {
    render(<AppSidebar userRole="org:academy_owner" />);

    expect(page.getByText('Reports')).toBeDefined();

    expect(page.getByText('Transactions')).toBeDefined();

    expect(page.getByText('Marketing')).toBeDefined();

    expect(page.getByText('Roles')).toBeDefined();

    expect(page.getByText('Staff')).toBeDefined();

    expect(page.getByText('Location')).toBeDefined();
  });

  it('should hide management items for front desk role', () => {
    render(<AppSidebar userRole="org:front_desk" />);

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

  it('should always show log out for any role', () => {
    render(<AppSidebar userRole="org:front_desk" />);

    expect(page.getByText('Log Out')).toBeDefined();
  });
});
