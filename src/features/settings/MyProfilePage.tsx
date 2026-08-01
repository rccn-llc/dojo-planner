'use client';

import { useUser } from '@clerk/nextjs';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function MyProfilePage() {
  const t = useTranslations('MyProfile');
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-32" />
        </div>
        <Card className="p-6">
          <div className="flex gap-6">
            <Skeleton className="size-16 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i}>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-2 h-5 w-32" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const phone = user?.primaryPhoneNumber?.phoneNumber ?? '';
  const photoUrl = user?.imageUrl ?? '';
  const role = 'Account Owner';

  const userInitials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
      </div>

      {/* Profile Card */}
      <Card className="p-6">
        {/* User Info */}
        <div className="flex gap-6">
          <Avatar className="size-16 shrink-0">
            <AvatarImage src={photoUrl} alt={`${firstName} ${lastName}`} />
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold text-foreground">
              {firstName}
              {' '}
              {lastName}
            </h2>
            <Badge variant="outline" className="w-fit">
              {role}
            </Badge>
          </div>
        </div>

        {/* User Details Grid */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('first_name_label')}</label>
            <p className="mt-1 text-foreground">{firstName || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('last_name_label')}</label>
            <p className="mt-1 text-foreground">{lastName || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('phone_label')}</label>
            <p className="mt-1 text-foreground">{phone || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('email_label')}</label>
            <p className="mt-1 text-foreground">{email || '-'}</p>
          </div>
        </div>

        {/* Edit Button - Bottom Right */}
        <div className="mt-6 flex justify-end">
          <Button variant="outline">
            <Pencil className="mr-2 size-4" />
            {t('edit_button')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
