'use client';

import type { AddClassWizardData, EventBilling } from '@/hooks/useAddClassWizard';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { DatePickerField } from '@/components/ui/date-picker/date-picker-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type EventBillingStepProps = {
  data: AddClassWizardData;
  onUpdate: (updates: Partial<AddClassWizardData>) => void;
  onUpdateEventBilling: (updates: Partial<EventBilling>) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  error?: string | null;
};

export const EventBillingStep = ({
  data,
  onUpdate: _onUpdate,
  onUpdateEventBilling,
  onNext,
  onBack,
  onCancel,
  error,
}: EventBillingStepProps) => {
  const t = useTranslations('AddClassWizard.EventBillingStep');

  const handleHasFeeChange = (value: string) => {
    const hasFee = value === 'yes';
    onUpdateEventBilling({
      hasFee,
      // Reset billing fields when toggling off
      ...(hasFee
        ? {}
        : {
            price: null,
            hasEarlyBird: false,
            earlyBirdPrice: null,
            earlyBirdDeadline: null,
            hasMemberDiscount: false,
            memberDiscountAmount: null,
          }),
    });
  };

  const handlePriceChange = (value: string) => {
    const price = value ? Number.parseFloat(value) : null;
    onUpdateEventBilling({ price });
  };

  const handleEarlyBirdToggle = (checked: boolean) => {
    onUpdateEventBilling({
      hasEarlyBird: checked,
      earlyBirdPrice: checked ? data.eventBilling.earlyBirdPrice : null,
      earlyBirdDeadline: checked ? data.eventBilling.earlyBirdDeadline : null,
    });
  };

  const handleMemberDiscountToggle = (checked: boolean) => {
    onUpdateEventBilling({
      hasMemberDiscount: checked,
      memberDiscountAmount: checked ? data.eventBilling.memberDiscountAmount : null,
    });
  };

  // Form is always valid since billing is optional
  // If they choose to have a fee, price must be set
  const isFormValid = !data.eventBilling.hasFee
    || (data.eventBilling.price !== null && data.eventBilling.price > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Has Fee Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">{t('has_fee_label')}</label>
          <RadioGroup
            value={data.eventBilling.hasFee ? 'yes' : 'no'}
            onValueChange={handleHasFeeChange}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="fee-yes" />
              <Label htmlFor="fee-yes">{t('has_fee_yes')}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="fee-no" />
              <Label htmlFor="fee-no">{t('has_fee_no')}</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Billing Details - only show if has fee */}
        {data.eventBilling.hasFee && (
          <div className="space-y-6 rounded-lg border border-border p-4">
            {/* Base Price */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('price_label')}</label>
              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  placeholder={t('price_placeholder')}
                  value={data.eventBilling.price ?? ''}
                  onChange={e => handlePriceChange(e.target.value)}
                  className="pl-7"
                  min={0}
                  step={0.01}
                />
              </div>
              {data.eventBilling.hasFee && data.eventBilling.price === null && (
                <p className="text-xs text-destructive">{t('price_error')}</p>
              )}
            </div>

            {/* Early Bird Pricing */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-foreground">{t('early_bird_label')}</label>
                  <p className="text-xs text-muted-foreground">{t('early_bird_description')}</p>
                </div>
                <Switch
                  checked={data.eventBilling.hasEarlyBird}
                  onCheckedChange={handleEarlyBirdToggle}
                />
              </div>

              {data.eventBilling.hasEarlyBird && (
                <div className="grid grid-cols-2 gap-4 pl-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">{t('early_bird_price_label')}</label>
                    <div className="relative">
                      <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        placeholder={t('price_placeholder')}
                        value={data.eventBilling.earlyBirdPrice ?? ''}
                        onChange={e => onUpdateEventBilling({
                          earlyBirdPrice: e.target.value ? Number.parseFloat(e.target.value) : null,
                        })}
                        className="pl-7"
                        min={0}
                        step={0.01}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">{t('early_bird_deadline_label')}</label>
                    <DatePickerField
                      value={data.eventBilling.earlyBirdDeadline ?? ''}
                      onChange={value => onUpdateEventBilling({ earlyBirdDeadline: value || null })}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Member Discount */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-foreground">{t('member_discount_label')}</label>
                  <p className="text-xs text-muted-foreground">{t('member_discount_description')}</p>
                </div>
                <Switch
                  checked={data.eventBilling.hasMemberDiscount}
                  onCheckedChange={handleMemberDiscountToggle}
                />
              </div>

              {data.eventBilling.hasMemberDiscount && (
                <div className="grid grid-cols-2 gap-4 pl-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">{t('member_discount_type_label')}</label>
                    <Select
                      value={data.eventBilling.memberDiscountType}
                      onValueChange={value => onUpdateEventBilling({
                        memberDiscountType: value as 'percentage' | 'fixed',
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">{t('discount_percentage')}</SelectItem>
                        <SelectItem value="fixed">{t('discount_fixed')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">{t('member_discount_amount_label')}</label>
                    <div className="relative">
                      <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
                        {data.eventBilling.memberDiscountType === 'percentage' ? '%' : '$'}
                      </span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={data.eventBilling.memberDiscountAmount ?? ''}
                        onChange={e => onUpdateEventBilling({
                          memberDiscountAmount: e.target.value ? Number.parseFloat(e.target.value) : null,
                        })}
                        className="pl-7"
                        min={0}
                        max={data.eventBilling.memberDiscountType === 'percentage' ? 100 : undefined}
                        step={data.eventBilling.memberDiscountType === 'percentage' ? 1 : 0.01}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
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
        <Button onClick={onNext} disabled={!isFormValid}>
          {t('next_button')}
        </Button>
      </div>
    </div>
  );
};
