'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import { CreditCard, LogOut, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SubscriptionDialog } from '@/features/billing/SubscriptionDialog';
import { ManageProfileDialog } from '@/features/settings/ManageProfileDialog';

export function UserMenu() {
  const t = useTranslations('UserMenu');
  const { signOut } = useClerk();
  const { user } = useUser();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);

  const userInitials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`
    : '';

  const handleSignOut = () => {
    signOut({ redirectUrl: '/' });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex cursor-pointer items-center rounded-full px-2 py-1.5 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
          >
            <Avatar className="size-8">
              <AvatarImage src={user?.imageUrl} alt={user?.fullName ?? 'User avatar'} />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => setProfileDialogOpen(true)}
          >
            <User className="mr-2 size-4" />
            {t('manage_profile')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => setSubscriptionDialogOpen(true)}
          >
            <CreditCard className="mr-2 size-4" />
            {t('subscription')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            variant="destructive"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 size-4" />
            {t('sign_out')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManageProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
      />

      <SubscriptionDialog
        open={subscriptionDialogOpen}
        onOpenChange={setSubscriptionDialogOpen}
      />
    </>
  );
}
