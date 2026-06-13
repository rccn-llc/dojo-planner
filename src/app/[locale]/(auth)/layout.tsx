'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { useTheme } from 'next-themes';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { routing } from '@/libs/I18nRouting';
import { ClerkLocalizations } from '@/utils/AppConfig';

export default function AuthLayout(props: {
  children: React.ReactNode;
}) {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();

  const clerkLocale = ClerkLocalizations.supportedLocales[locale] ?? ClerkLocalizations.defaultLocale;
  let signInUrl = '/sign-in';
  let signUpUrl = '/sign-up';
  let dashboardUrl = '/dashboard';
  let afterSignOutUrl = '/';

  if (locale !== routing.defaultLocale) {
    signInUrl = `/${locale}${signInUrl}`;
    signUpUrl = `/${locale}${signUpUrl}`;
    dashboardUrl = `/${locale}${dashboardUrl}`;
    afterSignOutUrl = `/${locale}${afterSignOutUrl}`;
  }

  const { resolvedTheme } = useTheme();

  const isDark = resolvedTheme === 'dark';

  // Force router refresh on mount to clear any stale session state
  useEffect(() => {
    router.refresh();
  }, [router]);

  return (
    <ClerkProvider
      appearance={{
        baseTheme: isDark ? dark : undefined,
        cssLayerName: 'clerk', // Ensure Clerk is compatible with Tailwind CSS v4
        elements: {
          scrollBox: isDark ? 'bg-transparent' : 'light-scrollbox-class',
        },
      }}
      localization={{
        ...clerkLocale,
        organizationProfile: {
          ...clerkLocale.organizationProfile,
          navbar: {
            ...clerkLocale.organizationProfile?.navbar,
            title: 'Academy',
            description: 'Manage your academy',
          },
        },
      }}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      signInFallbackRedirectUrl={dashboardUrl}
      signUpFallbackRedirectUrl={dashboardUrl}
      afterSignOutUrl={afterSignOutUrl}
      dynamic
    >
      {props.children}
    </ClerkProvider>
  );
}
