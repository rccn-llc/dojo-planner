'use client';

import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePathname } from '@/libs/I18nNavigation';
import { AppConfig } from '@/utils/AppConfig';

export const LocaleSwitcher = () => {
  const pathname = usePathname();
  const locale = useLocale();

  const handleChange = (value: string) => {
    // A full-document navigation (not a soft client push) so the root layout —
    // and next-themes' flash-prevention <script> — is re-rendered on the server,
    // not re-created during a client re-render. The client re-render path makes
    // React 19 flag that inline <script> with "Encountered a script tag while
    // rendering React component". A hard navigation also removes the need for the
    // prior `router.refresh()` (issue #395) since the new locale is loaded fresh.
    window.location.assign(`/${value}${pathname}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="lang-switcher">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="size-6 stroke-current stroke-2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path stroke="none" d="M0 0h24v24H0z" />
            <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M3.6 9h16.8M3.6 15h16.8" />
            <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18" />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={locale} onValueChange={handleChange}>
          {AppConfig.locales.map(elt => (
            <DropdownMenuRadioItem key={elt.id} value={elt.id}>
              {elt.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
