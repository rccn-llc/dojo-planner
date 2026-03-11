'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { client } from '@/libs/Orpc';
import { AppSidebar } from './AppSidebar';
import { AppSidebarHeader } from './AppSidebarHeader';
import { HelpButton } from './HelpButton';

// Pages that remain accessible without an active subscription
const SUBSCRIPTION_EXEMPT_SEGMENTS = ['/subscription', '/subscription-expired'];

type DashboardLayoutClientProps = {
  children: React.ReactNode;
  defaultOpen: boolean;
  subscriptionActive: boolean;
  userRole?: string;
};

export function DashboardLayoutClient({ children, defaultOpen, subscriptionActive, userRole }: DashboardLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Update the lastAccessedAt timestamp when the user accesses the dashboard
    const updateLastAccessed = async () => {
      try {
        await client.member.updateLastAccessed();
      } catch (error) {
        // Silently fail - don't disrupt user experience if timestamp update fails
        console.error('Failed to update lastAccessedAt:', error);
      }
    };

    updateLastAccessed();
  }, []);

  useEffect(() => {
    if (!subscriptionActive) {
      const isExempt = SUBSCRIPTION_EXEMPT_SEGMENTS.some(seg => pathname.includes(seg));
      if (!isExempt) {
        // Extract locale prefix (e.g. "/en" from "/en/dashboard/..."), empty if default locale
        const localePrefix = pathname.match(/^(\/[^/]+)\/dashboard/)?.[1] ?? '';
        router.replace(`${localePrefix}/dashboard/subscription-expired`);
      }
    }
  }, [subscriptionActive, pathname, router]);

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar userRole={userRole} />
      <SidebarInset>
        <AppSidebarHeader />

        <div className="@container flex-1 px-6 py-4">
          {children}
        </div>
      </SidebarInset>
      <HelpButton />
    </SidebarProvider>
  );
}
