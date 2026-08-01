'use client';

import type { TOTPResource } from '@clerk/types';

import { useReverification, useUser } from '@clerk/nextjs';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

type Setup2FADialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

type Step = 'scan' | 'verify' | 'backup';

export function Setup2FADialog({ open, onOpenChange, onSuccess }: Setup2FADialogProps) {
  const t = useTranslations('Security');
  const { user } = useUser();

  const [step, setStep] = useState<Step>('scan');
  const [totp, setTotp] = useState<TOTPResource | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const createTOTP = useReverification(() => user?.createTOTP());

  const handleClose = useCallback(() => {
    setStep('scan');
    setTotp(null);
    setCode('');
    setBackupCodes([]);
    setError('');
    setIsLoading(false);
    setCopied(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const initTotp = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await createTOTP();
      if (result) {
        setTotp(result);
        if (result.backupCodes?.length) {
          setBackupCodes(result.backupCodes);
        }
      }
    } catch {
      setError(t('setup_error'));
    } finally {
      setIsLoading(false);
    }
  }, [createTOTP, t]);

  useEffect(() => {
    if (!open || totp) {
      return;
    }
    void (async () => {
      await initTotp();
    })();
  }, [open, totp, initTotp]);

  const handleVerify = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await user?.verifyTOTP({ code });
      if (result?.backupCodes && result.backupCodes.length > 0) {
        setBackupCodes(result.backupCodes);
      }
      setStep('backup');
    } catch {
      setError(t('verify_error'));
    } finally {
      setIsLoading(false);
    }
  };

  // #165: when verifyTOTP didn't surface backup codes (some Clerk instances
  // don't issue them on TOTP setup), generate them explicitly. This is the
  // operator's fallback path — the inline error in the backup step shows a
  // 'Generate' button that calls this.
  const handleGenerateBackupCodes = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await user?.createBackupCode();
      if (result?.codes && result.codes.length > 0) {
        setBackupCodes(result.codes);
      } else {
        setError(t('backup_codes_missing_error'));
      }
    } catch {
      setError(t('backup_codes_missing_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
    } catch {
      // Fallback for browsers that block clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = backupCodes.join('\n');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDone = () => {
    onSuccess();
    handleClose();
  };

  const renderQrContent = () => {
    if (isLoading) {
      return (
        <div className="flex size-52 items-center justify-center">
          <Spinner />
        </div>
      );
    }

    if (totp?.uri) {
      return (
        <div className="rounded-lg border bg-white p-4">
          <QRCodeSVG value={totp.uri} size={200} />
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('setup_2fa_title')}</DialogTitle>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {step === 'scan' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-center text-sm text-muted-foreground">
              {t('scan_qr_instructions')}
            </p>

            {renderQrContent()}

            {totp?.secret && (
              <div className="w-full space-y-2">
                <Label className="text-sm text-muted-foreground">
                  {t('manual_entry_label')}
                </Label>
                <code className="block w-full rounded-md bg-muted p-3 text-center font-mono text-sm break-all">
                  {totp.secret}
                </code>
              </div>
            )}
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <Label htmlFor="totp-code">{t('verify_code_label')}</Label>
            <Input
              id="totp-code"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder={t('verify_code_placeholder')}
              maxLength={6}
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </div>
        )}

        {step === 'backup' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('backup_codes_description')}
            </p>
            <Alert variant="warning">{t('backup_codes_warning')}</Alert>
            {backupCodes.length > 0
              ? (
                  <div className="grid grid-cols-2 gap-2">
                    {backupCodes.map(backupCode => (
                      <code
                        key={backupCode}
                        className="rounded-md bg-muted px-3 py-2 text-center font-mono text-sm"
                      >
                        {backupCode}
                      </code>
                    ))}
                  </div>
                )
              : (
                  <div className="space-y-3">
                    <Alert variant="error">{t('backup_codes_missing_error')}</Alert>
                    <Button
                      variant="outline"
                      onClick={handleGenerateBackupCodes}
                      disabled={isLoading}
                      className="w-full"
                    >
                      {isLoading ? t('generating_button') : t('generate_backup_codes_button')}
                    </Button>
                  </div>
                )}
          </div>
        )}

        <DialogFooter>
          {step === 'scan' && (
            <Button onClick={() => setStep('verify')} disabled={!totp}>
              {t('next_button')}
            </Button>
          )}

          {step === 'verify' && (
            <Button onClick={handleVerify} disabled={isLoading || code.length !== 6}>
              {isLoading
                ? t('verifying_button')
                : t('verify_button')}
            </Button>
          )}

          {step === 'backup' && (
            <div className="flex w-full justify-between">
              <Button variant="outline" onClick={handleCopyAll} disabled={backupCodes.length === 0}>
                {copied
                  ? (
                      <>
                        <Check className="mr-2 size-4" />
                        {t('copied_button')}
                      </>
                    )
                  : (
                      <>
                        <Copy className="mr-2 size-4" />
                        {t('copy_all_button')}
                      </>
                    )}
              </Button>
              <Button onClick={handleDone} disabled={backupCodes.length === 0}>
                {t('done_button')}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
