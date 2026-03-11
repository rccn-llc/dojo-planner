'use client';

import { useOrganization } from '@clerk/nextjs';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function SubscriptionExpiredPage() {
  const t = useTranslations('SubscriptionExpired');
  const { membership } = useOrganization();
  const isAdmin = membership?.role === 'org:admin';

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md space-y-4 p-8 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('message')}</p>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? t('admin_message') : t('non_admin_message')}
        </p>
        {isAdmin && (
          <Button asChild>
            <Link href="subscription">
              {t('resubscribe_button')}
            </Link>
          </Button>
        )}
      </Card>
    </div>
  );
}
