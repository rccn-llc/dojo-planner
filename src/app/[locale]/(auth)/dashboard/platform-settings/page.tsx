import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { PlatformSettingsPage } from '@/features/platform-settings/PlatformSettingsPage';
import { isSuperAdmin } from '@/utils/SuperAdmins';

export default async function PlatformSettingsRoute(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: _locale } = await props.params;
  const { sessionClaims } = await auth();
  const username = (sessionClaims as Record<string, unknown> | null)?.username as string | undefined;
  if (!isSuperAdmin(username)) {
    redirect('/dashboard');
  }

  return <PlatformSettingsPage />;
}
