'use client';

import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { client } from '@/libs/Orpc';

type Status = {
  supported: boolean;
  request: { id: string; reason: string; linkSentAt: Date | null; createdAt: Date } | null;
};

type CardUpdateLinkActionProps = {
  memberId: string;
};

/**
 * "Send card-update link": emails the member IQPro's add-a-card link and shows
 * that the app is waiting for the new card. IQPro adds that card to the
 * customer, not the subscription; the card sync detects it and switches the
 * subscription (PaymentMethodUpdateRequestService). Renders nothing where a
 * link cannot be sent (Square orgs, members without an IQPro customer).
 */
export function CardUpdateLinkAction({ memberId }: CardUpdateLinkActionProps) {
  const t = useTranslations('MemberDetailPage');
  const [status, setStatus] = useState<Status | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.member.paymentMethodUpdateRequest({ memberId })
      .then((result) => {
        if (!cancelled) {
          setStatus(result);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  if (!status?.supported) {
    return null;
  }

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await client.member.sendPaymentMethodUpdateLink({ memberId });
      setStatus(await client.member.paymentMethodUpdateRequest({ memberId }));
    } catch (err) {
      setError(t('card_update_link_failed', { error: err instanceof Error ? err.message : '' }));
    } finally {
      setSending(false);
    }
  };

  const request = status.request;
  return (
    <div className="space-y-1 text-sm" data-testid="card-update-link">
      {request?.linkSentAt
        ? <p>{t('card_update_link_sent', { date: new Date(request.linkSentAt).toLocaleDateString() })}</p>
        : request && <p>{t('card_update_waiting')}</p>}
      <Button size="sm" variant="outline" onClick={send} disabled={sending} data-testid="send-card-update-link">
        <Mail className="mr-1.5 size-4" />
        {sending
          ? t('card_update_link_sending')
          : request?.linkSentAt ? t('card_update_link_resend') : t('card_update_link_button')}
      </Button>
      {error && <p className="text-destructive" role="alert">{error}</p>}
    </div>
  );
}
