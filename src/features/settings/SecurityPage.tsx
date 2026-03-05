'use client';

import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useHasPasswordAuth } from '@/hooks/useHasPasswordAuth';
import { ChangePasswordForm } from './ChangePasswordForm';
import { Disable2FADialog } from './Disable2FADialog';
import { Setup2FADialog } from './Setup2FADialog';

export function SecurityPage() {
  const t = useTranslations('Security');
  const { user } = useUser();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const { hasPasswordAuth, isLoadingAuth } = useHasPasswordAuth();

  const totpEnabled = user?.totpEnabled ?? false;

  const handlePasswordChangeSuccess = () => {
    setShowPasswordForm(false);
  };

  const handle2FASuccess = () => {
    void user?.reload();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
      </div>

      {/* Change Password Section - Only show for password-based auth users */}
      {!isLoadingAuth && hasPasswordAuth && (
        <Card className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{t('change_password_title')}</h2>
            </div>
            {!showPasswordForm && (
              <Button onClick={() => setShowPasswordForm(true)}>
                {t('change_password_button')}
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
              <h2 className="text-xl font-semibold text-foreground">{t('two_factor_title')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t('two_factor_description')}</p>
            </div>
            {totpEnabled && (
              <Badge variant="outline" className="shrink-0 border-green-600 text-green-600">
                {t('two_factor_enabled_status')}
              </Badge>
            )}
          </div>
          {totpEnabled
            ? (
                <Button variant="destructive" onClick={() => setShowDisable2FA(true)}>
                  {t('disable_2fa_button')}
                </Button>
              )
            : (
                <Button onClick={() => setShowSetup2FA(true)}>
                  {t('add_2fa_button')}
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
  );
}
