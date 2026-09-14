'use client';

import { useEffect, useState } from 'react';
import { CONSENT_OPEN_PREFS_EVENT } from '@/libs/consent/constants';
import { useConsentState, useIsHydrated } from '@/libs/consent/useConsent';
import { CookieConsentBanner } from './CookieConsentBanner';
import { CookiePreferencesDialog } from './CookiePreferencesDialog';

export function CookieConsentGate() {
  // The server and the FIRST client render both produce null, so the markup
  // matches exactly and the banner can only appear after hydration. Required
  // because the root layout is statically rendered and the server therefore
  // cannot know the visitor's decision.
  const hydrated = useIsHydrated();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { decision } = useConsentState();

  // Lets any component anywhere in the app open the preferences dialog without
  // threading state through the tree.
  useEffect(() => {
    const open = () => setDialogOpen(true);
    window.addEventListener(CONSENT_OPEN_PREFS_EVENT, open);

    return () => window.removeEventListener(CONSENT_OPEN_PREFS_EVENT, open);
  }, []);

  if (!hydrated) {
    return null;
  }

  return (
    <>
      {decision === null && (
        <CookieConsentBanner onCustomiseAction={() => setDialogOpen(true)} />
      )}
      <CookiePreferencesDialog open={dialogOpen} onOpenChangeAction={setDialogOpen} />
    </>
  );
}
