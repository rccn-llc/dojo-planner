'use client';

import { useClerk } from '@clerk/nextjs';
import { BarChart3, BookMarked, Briefcase, Building, CircleUser, Cookie, FileSignature, FileText, Home, LogOut, Mail, Map, Megaphone, Package, Shield, Users, Users2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from '@/components/ui/sidebar';
import { AppSidebarNav } from '@/features/dashboard/AppSidebarNav';
import { OrganizationSelector } from '@/features/dashboard/OrganizationSelector';
import { CONSENT_OPEN_PREFS_EVENT } from '@/libs/consent/constants';
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
              title: t('location'),
              url: '/dashboard/location-settings',
              icon: Building,
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
          label=""
          items={[
            {
              title: t('terms_of_use'),
              url: '/terms',
              icon: FileText,
              external: true,
            },
            {
              title: t('privacy_policy'),
              url: '/privacy',
              icon: Shield,
              external: true,
            },
            {
              // Consent must be withdrawable as easily as it was given, so the
              // dialog is reachable from inside the app too, not just the
              // public footer.
              title: t('cookie_preferences'),
              url: '#cookie-preferences',
              icon: Cookie,
              onClick: () => {
                window.dispatchEvent(new Event(CONSENT_OPEN_PREFS_EVENT));
              },
            },
          ]}
          className="mt-auto"
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
        />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
};
