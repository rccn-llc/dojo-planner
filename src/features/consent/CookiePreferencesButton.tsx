'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { CONSENT_OPEN_PREFS_EVENT } from '@/libs/consent/constants';

type Props = {
  className?: string;
};

/**
 * Re-opens the cookie preferences dialog. Withdrawing consent must be as easy
 * as giving it (GDPR Art. 7(3)), so this is rendered everywhere a visitor might
 * look: the public footer and the dashboard sidebar.
 */
export function CookiePreferencesButton({ className }: Props) {
  const t = useTranslations('CookieConsent');

  return (
    <Button
      type="button"
      variant="link"
      className={className}
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_PREFS_EVENT))}
    >
      {t('preferences_link')}
    </Button>
  );
}
