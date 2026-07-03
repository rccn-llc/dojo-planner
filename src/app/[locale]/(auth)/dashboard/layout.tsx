import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { DashboardLayoutClient } from '@/features/dashboard/DashboardLayoutClient';
import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { hasActiveSubscription } from '@/services/SaasSubscriptionService';
import { AppConfig } from '@/utils/AppConfig';
import { requireActiveSubscription } from '@/utils/Auth';
import { isExemptOrg, isSuperAdmin } from '@/utils/SuperAdmins';

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

  const { orgId, orgRole, sessionClaims } = await auth();
  const username = (sessionClaims as Record<string, unknown>)?.username as string | undefined;

  // Server-side, owner-aware subscription gate. Redirects BEFORE rendering any
  // protected content when the org lacks an active subscription or a matched
  // academy owner. The client redirect below remains as a UX fallback.
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') ?? '';
  await requireActiveSubscription(pathname);

  // Determine subscription status for the client UX fallback. Uses the same
  // `hasActiveSubscription` source of truth as the server gate above (so the
  // expiry backstop applies here too). A fresh Clerk org without a DB row is
  // not enforced.
  let subscriptionActive = true;
  if (orgId && !isSuperAdmin(username) && !isExemptOrg(orgId)) {
    const org = await db.query.organizationSchema.findFirst({
      where: eq(organizationSchema.id, orgId),
      columns: { id: true },
    });

    subscriptionActive = org ? await hasActiveSubscription(orgId) : true;
  }

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
