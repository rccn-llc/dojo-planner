'use client';

import { useUser } from '@clerk/nextjs';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useHasPasswordAuth } from '@/hooks/useHasPasswordAuth';
import { ChangePasswordForm } from './ChangePasswordForm';
import { Disable2FADialog } from './Disable2FADialog';
import { EditProfileForm } from './EditProfileForm';
import { Setup2FADialog } from './Setup2FADialog';

type ManageProfileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ManageProfileDialog({ open, onOpenChange }: ManageProfileDialogProps) {
  const tDialog = useTranslations('ManageProfileDialog');
  const tProfile = useTranslations('MyProfile');
  const tSecurity = useTranslations('Security');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [showDisable2FA, setShowDisable2FA] = useState(false);

  const { user, isLoaded } = useUser();
  const { hasPasswordAuth, isLoadingAuth } = useHasPasswordAuth();

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const phone = user?.primaryPhoneNumber?.phoneNumber ?? '';
  const photoUrl = user?.imageUrl ?? '';
  const role = 'Account Owner';

  const userInitials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`;

  const totpEnabled = user?.totpEnabled ?? false;

  const handlePasswordChangeSuccess = () => {
    setShowPasswordForm(false);
  };

  const handleEditProfileSuccess = () => {
    setIsEditingProfile(false);
  };

  const handle2FASuccess = () => {
    void user?.reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tDialog('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Profile Card */}
          <Card className="p-6">
            {!isLoaded
              ? (
                  <div className="flex gap-6">
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-8 w-40" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </div>
                )
              : (
                  <div className="flex gap-6">
                    <Avatar className="h-16 w-16 shrink-0">
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
                )}

            {/* User Details Grid or Edit Form */}
            {isEditingProfile
              ? (
                  <div className="mt-8">
                    <EditProfileForm
                      initialData={{ firstName, lastName, email, phone }}
                      onCancel={() => setIsEditingProfile(false)}
                      onSuccess={handleEditProfileSuccess}
                    />
                  </div>
                )
              : (
                  <>
                    <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
                      {!isLoaded
                        ? (
                            <>
                              {[1, 2, 3, 4].map(i => (
                                <div key={i}>
                                  <Skeleton className="h-4 w-20" />
                                  <Skeleton className="mt-2 h-5 w-32" />
                                </div>
                              ))}
                            </>
                          )
                        : (
                            <>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">{tProfile('first_name_label')}</label>
                                <p className="mt-1 text-foreground">{firstName || '-'}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">{tProfile('last_name_label')}</label>
                                <p className="mt-1 text-foreground">{lastName || '-'}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">{tProfile('phone_label')}</label>
                                <p className="mt-1 text-foreground">{phone || '-'}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">{tProfile('email_label')}</label>
                                <p className="mt-1 text-foreground">{email || '-'}</p>
                              </div>
                            </>
                          )}
                    </div>

                    {/* Edit Button - Bottom Right */}
                    {isLoaded && (
                      <div className="mt-6 flex justify-end">
                        <Button variant="outline" onClick={() => setIsEditingProfile(true)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {tProfile('edit_button')}
                        </Button>
                      </div>
                    )}
                  </>
                )}
          </Card>

          {/* Change Password Section - Only show for password-based auth users */}
          {!isLoadingAuth && hasPasswordAuth && (
            <Card className="p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">{tSecurity('change_password_title')}</h2>
                </div>
                {!showPasswordForm && (
                  <Button onClick={() => setShowPasswordForm(true)}>
                    {tSecurity('change_password_button')}
                  </Button>
                )}
              </div>

              {showPasswordForm && (
                <ChangePasswordForm
                  onCancel={() => setShowPasswordForm(false)}
                  onSuccess={handlePasswordChangeSuccess}
                />
              )}
            </Card>
          )}

          {/* Two-Factor Authentication Section */}
          <Card className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">{tSecurity('two_factor_title')}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{tSecurity('two_factor_description')}</p>
                </div>
                {totpEnabled && (
                  <Badge variant="outline" className="shrink-0 border-green-600 text-green-600">
                    {tSecurity('two_factor_enabled_status')}
                  </Badge>
                )}
              </div>
              {totpEnabled
                ? (
                    <Button variant="destructive" onClick={() => setShowDisable2FA(true)}>
                      {tSecurity('disable_2fa_button')}
                    </Button>
                  )
                : (
                    <Button onClick={() => setShowSetup2FA(true)}>
                      {tSecurity('add_2fa_button')}
                    </Button>
                  )}
            </div>
          </Card>

          {showSetup2FA && (
            <Setup2FADialog
              open={showSetup2FA}
              onOpenChange={setShowSetup2FA}
              onSuccess={handle2FASuccess}
            />
          )}

          {showDisable2FA && (
            <Disable2FADialog
              open={showDisable2FA}
              onOpenChange={setShowDisable2FA}
              onSuccess={handle2FASuccess}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
