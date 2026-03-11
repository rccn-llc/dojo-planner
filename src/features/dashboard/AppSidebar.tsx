'use client';

import { useClerk } from '@clerk/nextjs';
import { BarChart3, BookMarked, Briefcase, Building, CircleUser, FileSignature, Home, LogOut, Mail, Map, Megaphone, Package, Settings, Users, Users2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from '@/components/ui/sidebar';
import { AppSidebarNav } from '@/features/dashboard/AppSidebarNav';
import { OrganizationSelector } from '@/features/dashboard/OrganizationSelector';
import { Logo } from '@/templates/Logo';

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  userRole?: string;
};

const MANAGEMENT_ROLES = new Set(['org:admin', 'org:academy_owner']);

export const AppSidebar = ({ userRole, ...props }: AppSidebarProps) => {
  const t = useTranslations('DashboardLayout');
  const { signOut } = useClerk();
  const isManager = !userRole || MANAGEMENT_ROLES.has(userRole);

  return (
    <Sidebar {...props}>
      <SidebarHeader className="pt-5">
        <div className="flex justify-center pb-3">
          <Logo />
        </div>

        <OrganizationSelector />
      </SidebarHeader>
      <SidebarContent>
        <AppSidebarNav
          label={t('business_section_label')}
          items={[
            {
              title: t('performance'),
              url: '/dashboard',
              icon: Home,
            },
            {
              title: t('reports'),
              url: '/dashboard/reports',
              icon: BarChart3,
              hidden: !isManager,
            },
            {
              title: t('transactions'),
              url: '/dashboard/transactions',
              icon: Briefcase,
              hidden: !isManager,
            },
            {
              title: t('marketing'),
              url: '/dashboard/marketing',
              icon: Megaphone,
              hidden: !isManager,
            },
            {
              title: t('catalog'),
              url: '/dashboard/catalog',
              icon: Package,
              hidden: !isManager,
            },
          ]}
        />
        <AppSidebarNav
          label={t('academy_section_label')}
          items={[
            {
              title: t('programs'),
              url: '/dashboard/programs',
              icon: Map,
            },
            {
              title: t('waivers'),
              url: '/dashboard/waivers',
              icon: FileSignature,
              hidden: !isManager,
            },
            {
              title: t('memberships'),
              url: '/dashboard/memberships',
              icon: Users2,
            },
            {
              title: t('classes'),
              url: '/dashboard/classes',
              icon: BookMarked,
            },
            {
              title: t('members'),
              url: '/dashboard/members',
              icon: Users,
            },
            {
              title: t('roles'),
              url: '/dashboard/roles',
              icon: CircleUser,
              hidden: !isManager,
            },
            {
              title: t('staff'),
              url: '/dashboard/staff',
              icon: Users2,
              hidden: !isManager,
            },
            {
              title: t('messaging'),
              url: '/dashboard/messaging',
              icon: Mail,
              badge: <Badge variant="default">40</Badge>,
              disabled: true,
              hidden: true,
            },
          ]}
        />
        <AppSidebarNav
          label={t('settings_section_label')}
          hidden
          items={[
            {
              title: t('location'),
              url: '/dashboard/location-settings',
              icon: Building,
              hidden: true,
            },
            {
              title: t('preferences'),
              url: '/dashboard/preferences',
              icon: Settings,
              disabled: true,
              hidden: true,
            },
          ]}
        />
        <AppSidebarNav
          label=""
          items={[
            {
              title: t('log_out'),
              url: '/dashboard/logout',
              icon: LogOut,
              onClick: () => signOut({ redirectUrl: '/' }),
            },
          ]}
          className="mt-auto"
        />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
};
