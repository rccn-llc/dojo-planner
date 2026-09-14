'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { acceptAll, rejectAll } from '@/libs/consent/ConsentStore';

type Props = {
  onCustomiseAction: () => void;
};

export function CookieConsentBanner({ onCustomiseAction }: Props) {
  const t = useTranslations('CookieConsent');
  const containerRef = useRef<HTMLElement>(null);

  // Move focus to the banner once when it appears so keyboard and screen-reader
  // users are told about it. This is NOT a focus trap — Tab and Shift+Tab leave
  // freely, because a consent wall you can only escape by accepting is itself a
  // dark pattern.
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <aside
      ref={containerRef}
      role="region"
      aria-label={t('banner_aria_label')}
      tabIndex={-1}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background p-4 shadow-lg outline-none sm:p-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{t('banner_title')}</p>
          <p className="text-sm text-muted-foreground">
            {t.rich('banner_body', {
              link: chunks => (
                <Link href="/privacy" className="underline underline-offset-4">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="ghost"
            className="sm:order-first"
            onClick={onCustomiseAction}
          >
            {t('customise')}
          </Button>

          {/*
            Accept and Reject MUST stay visually identical — same variant, same
            size, same width. Equal prominence is a legal requirement under the
            EDPB/CNIL guidance, not a styling preference. Only "Customise" may
            be de-emphasised, because it navigates to a choice rather than being
            one. There is a test asserting these two stay in step.
          */}
          <Button type="button" className="min-w-32" onClick={rejectAll}>
            {t('reject_all')}
          </Button>
          <Button type="button" className="min-w-32" onClick={acceptAll}>
            {t('accept_all')}
          </Button>
        </div>
      </div>
    </aside>
  );
}
