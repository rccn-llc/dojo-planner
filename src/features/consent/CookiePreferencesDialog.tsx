'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { acceptAll, rejectAll, setConsent } from '@/libs/consent/ConsentStore';
import { useConsentState } from '@/libs/consent/useConsent';

type Props = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
};

type Draft = {
  functional: boolean;
  analytics: boolean;
};

const EMPTY_DRAFT: Draft = { functional: false, analytics: false };

export function CookiePreferencesDialog({ open, onOpenChangeAction }: Props) {
  const { decision } = useConsentState();

  const initialDraft: Draft = decision === null
    ? EMPTY_DRAFT
    : {
        functional: decision.categories.functional,
        analytics: decision.categories.analytics,
      };

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      {/*
        Remount the form whenever the dialog opens or the stored decision
        changes. Seeding the draft through `key` rather than a setState-in-effect
        avoids a cascading render and keeps the form honest: re-opening always
        shows what is actually persisted, never a stale draft.
      */}
      {open && (
        <PreferencesForm
          key={`${String(decision?.timestamp ?? 'none')}`}
          initialDraft={initialDraft}
          onOpenChangeAction={onOpenChangeAction}
        />
      )}
    </Dialog>
  );
}

function PreferencesForm({
  initialDraft,
  onOpenChangeAction,
}: {
  initialDraft: Draft;
  onOpenChangeAction: (open: boolean) => void;
}) {
  const t = useTranslations('CookieConsent');
  const descriptionId = useId();
  const necessaryLabelId = useId();
  const functionalLabelId = useId();
  const analyticsLabelId = useId();

  const [draft, setDraft] = useState<Draft>(initialDraft);

  const close = () => onOpenChangeAction(false);

  // Literal `t()` calls only — a template-string key would make every one of
  // these look unused to `npm run check:i18n` and fail the build.
  const rows = [
    {
      key: 'necessary' as const,
      labelId: necessaryLabelId,
      label: t('necessary_label'),
      description: t('necessary_description'),
      checked: true,
      disabled: true,
    },
    {
      key: 'functional' as const,
      labelId: functionalLabelId,
      label: t('functional_label'),
      description: t('functional_description'),
      checked: draft.functional,
      disabled: false,
    },
    {
      key: 'analytics' as const,
      labelId: analyticsLabelId,
      label: t('analytics_label'),
      description: t('analytics_description'),
      checked: draft.analytics,
      disabled: false,
    },
  ];

  return (
    <>
      {/*
        DialogContent hardcodes `aria-describedby={undefined}` before its prop
        spread, which suppresses Radix's automatic description association.
        Passing it explicitly here restores it (the spread wins).
      */}
      <DialogContent aria-describedby={descriptionId} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('dialog_title')}</DialogTitle>
          <DialogDescription id={descriptionId}>
            {t('dialog_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {rows.map((row, index) => (
            <div key={row.key}>
              {index > 0 && <Separator className="mb-4" />}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p id={row.labelId} className="text-sm font-medium text-foreground">
                    {row.label}
                  </p>
                  <p className="text-sm text-muted-foreground">{row.description}</p>
                  {row.disabled && (
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('necessary_always_on')}
                    </p>
                  )}
                </div>

                {/*
                  Radix renders a bare <button role="switch"> with no text, so
                  aria-labelledby is what gives each switch an accessible name.
                */}
                <Switch
                  checked={row.checked}
                  disabled={row.disabled}
                  aria-labelledby={row.labelId}
                  aria-readonly={row.disabled || undefined}
                  onCheckedChange={(next) => {
                    if (row.key === 'necessary') {
                      return;
                    }
                    setDraft(current => ({ ...current, [row.key]: next }));
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs font-medium text-foreground">{t('vendors_title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('vendors_body')}</p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setConsent(draft, 'custom');
              close();
            }}
          >
            {t('save_preferences')}
          </Button>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="min-w-32"
              onClick={() => {
                rejectAll();
                close();
              }}
            >
              {t('reject_all')}
            </Button>
            <Button
              type="button"
              className="min-w-32"
              onClick={() => {
                acceptAll();
                close();
              }}
            >
              {t('accept_all')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </>
  );
}
