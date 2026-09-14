import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { CookiePreferencesButton } from '@/features/consent/CookiePreferencesButton';

/**
 * Public footer. Beyond the cookie-preferences entry — which is what makes
 * withdrawing consent as easy as giving it (GDPR Art. 7(3)) — this is also the
 * only place an unauthenticated visitor can reach the privacy policy and terms
 * at all; previously both were linked solely from the authenticated sidebar.
 */
export const SiteFooter = () => {
  const t = useTranslations('Footer');

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 p-6 text-sm text-muted-foreground sm:flex-row">
        <p>{t('copyright')}</p>

        <nav className="flex items-center gap-1">
          <Link href="/privacy" className="px-3 py-2 underline-offset-4 hover:underline">
            {t('privacy')}
          </Link>
          <Link href="/terms" className="px-3 py-2 underline-offset-4 hover:underline">
            {t('terms')}
          </Link>
          <CookiePreferencesButton className="h-auto p-0 px-3 py-2 text-sm font-normal text-muted-foreground" />
        </nav>
      </div>
    </footer>
  );
};
