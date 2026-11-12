'use client';

import type { ConfirmLink } from './confirmLink';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { takeConfirmLink } from './confirmLink';

/**
 * The page the "Confirm your academy" email links to. Confirming is a button
 * press (a POST), never the page load: email scanners open links before the
 * person does, and must not start provisioning.
 *
 * The link's `id` + `token` are read after mount rather than through route
 * props, so the page stays statically rendered like the rest of (marketing),
 * and are then taken out of the address bar (see `takeConfirmLink`).
 */

type State = 'awaiting_confirmation' | 'provisioning' | 'ready' | 'failed' | 'expired';
type Step = 'queued' | 'organization' | 'database' | 'starter_data' | 'invitation';
type Status = { state: State; step?: Step };

type View
  = | { kind: 'loading' }
    | { kind: 'invalid' }
    | { kind: 'unavailable' }
    | { kind: 'ready_to_confirm' }
    | { kind: 'confirming' }
    | { kind: 'status'; status: Status };

const POLL_MS = 4000;
const FINAL: State[] = ['ready', 'failed', 'expired'];

async function fetchStatus(id: string, token: string): Promise<Status | 'not_found' | 'error'> {
  try {
    const res = await fetch(`/api/signup/status?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.status === 404) {
      return 'not_found';
    }
    if (!res.ok) {
      return 'error';
    }
    return await res.json() as Status;
  } catch {
    return 'error';
  }
}

export function SignupConfirm() {
  const t = useTranslations('SignupConfirm');
  const [view, setView] = useState<View>({ kind: 'loading' });
  // Bumped after a successful confirm to restart polling.
  const [pollRound, setPollRound] = useState(0);
  // Read once per page load: the first read removes the token from the URL.
  const linkRef = useRef<ConfirmLink | null | undefined>(undefined);

  useEffect(() => {
    if (linkRef.current === undefined) {
      linkRef.current = takeConfirmLink();
    }
    const link = linkRef.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const load = link ? fetchStatus(link.id, link.token) : Promise.resolve('not_found' as const);
      void load.then((result) => {
        if (cancelled) {
          return;
        }
        if (result === 'not_found') {
          setView({ kind: 'invalid' });
          return;
        }
        if (result !== 'error') {
          if (result.state === 'awaiting_confirmation') {
            setView({ kind: 'ready_to_confirm' });
            return;
          }
          setView({ kind: 'status', status: result });
          if (FINAL.includes(result.state)) {
            return;
          }
        }
        timer = setTimeout(tick, POLL_MS);
      });
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pollRound]);

  const confirm = async () => {
    const link = linkRef.current;
    if (!link) {
      setView({ kind: 'invalid' });
      return;
    }
    setView({ kind: 'confirming' });
    try {
      const res = await fetch('/api/signup/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ token: link.token }),
      });
      if (res.status === 404) {
        setView({ kind: 'invalid' });
        return;
      }
      if (res.status === 410) {
        setView({ kind: 'status', status: { state: 'expired' } });
        return;
      }
      if (!res.ok) {
        setView({ kind: 'unavailable' });
        return;
      }
      setView({ kind: 'status', status: { state: 'provisioning', step: 'queued' } });
      setPollRound(round => round + 1);
    } catch {
      setView({ kind: 'unavailable' });
    }
  };

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <div role="status" aria-live="polite" className="space-y-4">
        {view.kind === 'loading' && <p className="text-muted-foreground">{t('loading')}</p>}
        {view.kind === 'invalid' && <p>{t('invalid_link')}</p>}
        {view.kind === 'unavailable' && <p>{t('unavailable')}</p>}
        {view.kind === 'ready_to_confirm' && (
          <>
            <p>{t('intro')}</p>
            <Button onClick={() => void confirm()}>{t('confirm_button')}</Button>
          </>
        )}
        {view.kind === 'confirming' && <p className="text-muted-foreground">{t('confirming')}</p>}
        {view.kind === 'status' && <StatusMessage status={view.status} />}
      </div>
    </main>
  );
}

function StatusMessage({ status }: { status: Status }) {
  const t = useTranslations('SignupConfirm');
  switch (status.state) {
    case 'provisioning':
      return <p>{t(`step_${status.step ?? 'queued'}`)}</p>;
    case 'ready':
      return (
        <>
          <p>{t('state_ready')}</p>
          {/* A fixed same-origin path, never a URL taken from a response. */}
          <Link href="/sign-in" className="font-medium underline underline-offset-4">{t('go_to_sign_in')}</Link>
        </>
      );
    case 'expired':
      return <p>{t('state_expired')}</p>;
    case 'failed':
      return <p>{t('state_failed')}</p>;
    default:
      return <p>{t('intro')}</p>;
  }
}
