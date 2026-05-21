import { auth } from '@clerk/nextjs/server';
import { LocationSettingsPage } from '@/features/settings/LocationSettingsPage';

export default async function LocationSettingsRoute(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: _locale } = await props.params;
  const { orgRole } = await auth();

  return <LocationSettingsPage userRole={orgRole ?? undefined} />;
}
