import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { DashboardLayoutClient } from '@/features/dashboard/DashboardLayoutClient';
import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { AppConfig } from '@/utils/AppConfig';
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

  // Determine subscription status for the org
  let subscriptionActive = true;
  if (orgId && !isSuperAdmin(username) && !isExemptOrg(orgId)) {
    const org = await db.query.organizationSchema.findFirst({
      where: eq(organizationSchema.id, orgId),
      columns: {
        iqproSubscriptionStatus: true,
        stripeSubscriptionStatus: true,
      },
    });

    // If org has no DB record yet, don't enforce subscription (fresh Clerk org)
    if (!org) {
      subscriptionActive = true;
    } else {
      subscriptionActive
        = org.iqproSubscriptionStatus === 'active'
          || org.iqproSubscriptionStatus === 'trial'
          || org.stripeSubscriptionStatus === 'active';
    }
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
