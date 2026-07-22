'use client';

import type { WizardStepData } from '@/hooks/useAddMemberWizard';
import type { WaiverTemplate } from '@/services/WaiversService';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { client } from '@/libs/Orpc';

// react-signature-canvas is a client-only, DOM-heavy dependency. Load it lazily
// so it is only fetched when the waiver step actually renders.
const SignatureCanvas = dynamic(
  () => import('@/features/waivers/signing/SignatureCanvas').then(m => m.SignatureCanvas),
  { ssr: false },
);

type SignerRelationship = 'self' | 'parent' | 'guardian' | 'legal_guardian';

type WaiverStepProps = {
  data: WizardStepData;
  onUpdate: (updates: Partial<WizardStepData>) => void;
  onNext: () => void | Promise<void>;
  onBack: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  /** Member's date of birth for guardian check */
  memberDateOfBirth?: Date;
};

/**
 * Calculate age from date of birth
 */
function calculateAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function WaiverStep({
  data,
  onUpdate,
  onNext,
  onBack,
  onCancel,
  isLoading = false,
  memberDateOfBirth,
}: WaiverStepProps) {
  const t = useTranslations('WaiverStep');

  const [waiver, setWaiver] = useState<WaiverTemplate | null>(null);
  const [resolvedContent, setResolvedContent] = useState<string>('');
  const [isFetchingWaiver, setIsFetchingWaiver] = useState(true);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(data.waiverSignatureDataUrl ?? null);
  const [signerName, setSignerName] = useState(data.waiverSignedByName ?? '');
  const [signerRelationship, setSignerRelationship] = useState<SignerRelationship>(
    data.waiverSignedByRelationship ?? 'self',
  );
  const [guardianEmail, setGuardianEmail] = useState(data.waiverGuardianEmail ?? '');
  const [hasAgreed, setHasAgreed] = useState(false);
  const [errors, setErrors] = useState<{
    signature?: string;
    signerName?: string;
    agreement?: string;
  }>({});

  // Calculate if guardian signature is required
  const memberAge = useMemo(() => {
    if (!memberDateOfBirth) {
      return null;
    }
    return calculateAge(memberDateOfBirth);
  }, [memberDateOfBirth]);

  const requiresGuardian = useMemo(() => {
    if (!waiver || memberAge === null) {
      return false;
    }
    return waiver.requiresGuardian && memberAge < waiver.guardianAgeThreshold;
  }, [waiver, memberAge]);

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  useEffect(() => {
    const fetchWaiver = async () => {
      if (!data.membershipPlanId) {
        setIsFetchingWaiver(false);
        return;
      }

      setIsFetchingWaiver(true);
      try {
        const result = await client.waivers.getWaiversForMembership({
          membershipPlanId: data.membershipPlanId,
        });

        const activeWaivers = result.waivers.filter(w => w.isActive);
        if (activeWaivers.length > 0) {
          const selectedWaiver = activeWaivers[0]!;
          setWaiver(selectedWaiver);

          // Resolve merge-field placeholders (e.g. <academy>). If the resolve
          // call fails OR returns empty content (e.g. an org with no merge
          // fields configured against a template that uses them), fall back
          // to the raw template text so the user always sees something
          // signable instead of an empty box (#143).
          let resolvedText = '';
          try {
            const resolved = await client.waivers.resolvePlaceholders({
              templateId: selectedWaiver.id,
            });
            resolvedText = resolved.resolvedContent;
          } catch (resolveError) {
            console.warn('[WaiverStep] Failed to resolve placeholders, falling back to raw template:', resolveError);
          }
          setResolvedContent(resolvedText.trim() ? resolvedText : selectedWaiver.content);

          onUpdateRef.current({ waiverTemplateId: selectedWaiver.id });
        } else {
          setWaiver(null);
        }
      } catch (error) {
        console.error('Failed to fetch waiver:', error);
        setWaiver(null);
      } finally {
        setIsFetchingWaiver(false);
      }
    };

    fetchWaiver();
  }, [data.membershipPlanId]);

  const handleContinueWithoutWaiver = useCallback(async () => {
    onUpdate({
      waiverTemplateId: null,
      waiverSignatureDataUrl: undefined,
      waiverSignedByName: undefined,
      waiverSignedByRelationship: undefined,
      waiverGuardianEmail: undefined,
      waiverSkipped: true,
    });
    await onNext();
  }, [onUpdate, onNext]);

  const handleSignatureChange = useCallback((dataUrl: string | null) => {
    setSignatureDataUrl(dataUrl);
    setErrors(prev => ({ ...prev, signature: undefined }));
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: typeof errors = {};

    if (!signatureDataUrl) {
      newErrors.signature = t('signature_required_error');
    }

    if (!signerName.trim()) {
      newErrors.signerName = t('name_required_error');
    }

    if (!hasAgreed) {
      newErrors.agreement = t('agreement_required_error');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [signatureDataUrl, signerName, hasAgreed, t]);

  const handleNext = useCallback(async () => {
    if (!validate()) {
      return;
    }

    // Update wizard data with waiver signature info
    onUpdate({
      waiverSignatureDataUrl: signatureDataUrl!,
      waiverSignedByName: signerName,
      waiverSignedByRelationship: requiresGuardian ? signerRelationship : 'self',
      waiverGuardianEmail: requiresGuardian ? guardianEmail : undefined,
      waiverSignedAt: new Date(),
      waiverSkipped: false,
      waiverRenderedContent: resolvedContent,
    });

    await onNext();
  }, [
    validate,
    onUpdate,
    onNext,
    signatureDataUrl,
    signerName,
    signerRelationship,
    guardianEmail,
    requiresGuardian,
    resolvedContent,
  ]);

  // Show loading state while fetching waiver
  if (isFetchingWaiver) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t('loading_waiver')}</p>
      </div>
    );
  }

  if (!waiver) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="rounded-lg border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">{t('no_waiver_required_message')}</p>
        </div>

        <div className="flex justify-between gap-3 pt-6">
          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack}>
              {t('back_button')}
            </Button>
            <Button variant="outline" onClick={onCancel}>
              {t('cancel_button')}
            </Button>
          </div>
          <Button onClick={handleContinueWithoutWaiver} disabled={isLoading}>
            {isLoading ? `${t('continue_button')}...` : t('continue_button')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Guardian required alert */}
      {requiresGuardian && (
        <Alert variant="warning">
          <strong>{t('guardian_required_title')}</strong>
          {' '}
          {t('guardian_required_message', { age: waiver.guardianAgeThreshold })}
        </Alert>
      )}

      {/* Waiver content */}
      <div className="max-h-64 overflow-y-auto rounded-lg border bg-muted/30 p-4">
        <div className="max-w-none text-sm whitespace-pre-wrap">
          {resolvedContent}
        </div>
      </div>

      {/* Guardian/signer information (if required) */}
      {requiresGuardian && (
        <div className="space-y-4 rounded-lg border p-4">
          <h3 className="font-medium">{t('guardian_info_title')}</h3>

          <div className="space-y-2">
            <Label htmlFor="relationship">{t('relationship_label')}</Label>
            <Select
              value={signerRelationship}
              onValueChange={value => setSignerRelationship(value as SignerRelationship)}
            >
              <SelectTrigger id="relationship">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parent">{t('relationship_parent')}</SelectItem>
                <SelectItem value="guardian">{t('relationship_guardian')}</SelectItem>
                <SelectItem value="legal_guardian">{t('relationship_legal_guardian')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="guardian-email">{t('guardian_email_label')}</Label>
            <Input
              id="guardian-email"
              type="email"
              placeholder={t('guardian_email_placeholder')}
              value={guardianEmail}
              onChange={e => setGuardianEmail(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Signer name — this is the guardian's name when a guardian is required. */}
      <div className="space-y-2">
        <Label htmlFor="signer-name">
          {requiresGuardian ? t('guardian_signer_name_label') : t('signer_name_label')}
        </Label>
        <Input
          id="signer-name"
          placeholder={t('signer_name_placeholder')}
          value={signerName}
          onChange={(e) => {
            setSignerName(e.target.value);
            setErrors(prev => ({ ...prev, signerName: undefined }));
          }}
        />
        {errors.signerName && (
          <p className="text-sm text-destructive">{errors.signerName}</p>
        )}
      </div>

      {/* Primary signature — the guardian's when a guardian is required. */}
      <SignatureCanvas
        label={requiresGuardian ? t('guardian_signature_label') : t('signature_label')}
        onSignatureChange={handleSignatureChange}
        error={errors.signature}
      />

      {/* Agreement checkbox */}
      <div className="flex items-start gap-2">
        <Checkbox
          id="agreement"
          checked={hasAgreed}
          onCheckedChange={(checked) => {
            setHasAgreed(checked === true);
            setErrors(prev => ({ ...prev, agreement: undefined }));
          }}
        />
        <div className="grid gap-1.5 leading-none">
          <Label
            htmlFor="agreement"
            className="cursor-pointer text-sm leading-relaxed font-normal"
          >
            {t('agree_checkbox')}
          </Label>
          {errors.agreement && (
            <p className="text-sm text-destructive">{errors.agreement}</p>
          )}
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between gap-3 pt-6">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            {t('back_button')}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t('cancel_button')}
          </Button>
        </div>
        <div className="flex gap-3">
          {/* Escape hatch (#143): if the waiver content didn't render or
              the user wants to sign later, let them advance without signing.
              The membership is still created; the waiver row simply isn't
              created and `waiverSkipped: true` is stored so the operator
              knows to follow up. */}
          <Button variant="outline" onClick={handleContinueWithoutWaiver} disabled={isLoading}>
            {t('continue_without_signing_button')}
          </Button>
          <Button onClick={handleNext} disabled={isLoading}>
            {isLoading ? `${t('continue_button')}...` : t('continue_button')}
          </Button>
        </div>
      </div>
    </div>
  );
}
