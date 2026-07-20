import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { DashboardLayoutClient } from '@/features/dashboard/DashboardLayoutClient';
import { AppConfig } from '@/utils/AppConfig';
import { requireActiveSubscription } from '@/utils/Auth';

type ILayoutProps = {
  params: Promise<{ locale: string }>;
  children: React.ReactNode;
};

export async function generateMetadata(props: ILayoutProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'Dashboard',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function DashboardLayout(props: ILayoutProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const { orgRole } = await auth();

  // Server-side, owner-aware subscription gate. Redirects BEFORE rendering any
  // protected content when the org lacks an active subscription or a matched
  // academy owner. The client redirect below remains as a UX fallback.
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') ?? '';
  // The gate returns the subscription-active flag it already computed, so the
  // client-UX fallback below reuses it instead of re-reading the org row +
  // re-running hasActiveSubscription (those were duplicated on every dashboard
  // navigation).
  const { subscriptionActive } = await requireActiveSubscription(pathname);

  // Get the persisted sidebar state from the cookie
  const cookieStore = await cookies();
  // If the cookie is not set, default to open
  const defaultOpen = cookieStore.get(AppConfig.sidebarCookieName)?.value !== 'false';

  return (
    <DashboardLayoutClient defaultOpen={defaultOpen} subscriptionActive={subscriptionActive} userRole={orgRole || undefined}>
      {props.children}
    </DashboardLayoutClient>
  );
}
