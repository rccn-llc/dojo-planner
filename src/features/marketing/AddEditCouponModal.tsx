'use client';

import type { Coupon, CouponApplyTo, CouponFormData, CouponStatus, CouponType } from './types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input/input';
import { Label } from '@/components/ui/label/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select';

type AddEditCouponModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  coupon?: Coupon | null;
  onSaveAction: (couponData: CouponFormData, isEdit: boolean) => Promise<void>;
};

function parseDateTime(dateTimeStr: string): { date: string; time: string } {
  if (!dateTimeStr) {
    return { date: '', time: '' };
  }
  // Expecting format YYYY-MM-DDThh:mm:ss
  const parts = dateTimeStr.split('T');
  return {
    date: parts[0] || '',
    time: parts[1] || '00:00:00',
  };
}

function getInitialFormData(coupon?: Coupon | null): CouponFormData {
  if (coupon) {
    const usageParts = coupon.usage.split('/');
    const usageLimit = usageParts[1] === '\u221E' ? '' : usageParts[1] || '';
    const startParsed = parseDateTime(coupon.startDateTime);
    const endParsed = parseDateTime(coupon.endDateTime);
    // If endDateTime is empty, the coupon never expires
    const neverExpires = !coupon.endDateTime;

    return {
      code: coupon.code,
      description: coupon.description,
      type: coupon.type,
      amount: coupon.amount.replace(/[$%]/g, '').replace(' Days', ''),
      applyTo: coupon.applyTo,
      usageLimit,
      perUserLimit: coupon.perUserLimit !== undefined ? String(coupon.perUserLimit) : '1',
      startDate: startParsed.date,
      startTime: startParsed.time,
      endDate: endParsed.date,
      endTime: endParsed.time,
      neverExpires,
      status: coupon.status,
    };
  }

  // Default startDate = today so validFrom < validUntil even when the user
  // doesn't explicitly pick a start date.
  const today = new Date().toISOString().split('T')[0]!;
  return {
    code: '',
    description: '',
    type: 'Percentage',
    amount: '',
    applyTo: 'Memberships',
    usageLimit: '',
    perUserLimit: '1',
    startDate: today,
    startTime: '00:00:00',
    endDate: '',
    endTime: '23:59:59',
    neverExpires: false,
    status: 'Active',
  };
}

type CouponFormContentProps = {
  coupon?: Coupon | null;
  onCloseAction: () => void;
  onSaveAction: (couponData: CouponFormData, isEdit: boolean) => void;
};

function CouponFormContent({ coupon, onCloseAction, onSaveAction }: CouponFormContentProps) {
  const t = useTranslations('MarketingPage.AddEditCouponModal');
  const [formData, setFormData] = useState<CouponFormData>(() => getInitialFormData(coupon));
  const [errors, setErrors] = useState<Partial<Record<keyof CouponFormData, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isEditMode = !!coupon?.id;

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CouponFormData, string>> = {};

    if (!formData.code.trim()) {
      newErrors.code = t('code_error');
    }

    if (!formData.description.trim()) {
      newErrors.description = t('description_error');
    }

    if (!formData.amount.trim()) {
      newErrors.amount = t('amount_error');
    } else {
      const parsed = Number.parseFloat(formData.amount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        newErrors.amount = t('amount_error');
      }
    }

    if (formData.perUserLimit.trim()) {
      const parsed = Number.parseInt(formData.perUserLimit, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        newErrors.perUserLimit = t('per_user_limit_error');
      }
    }

    // Only require end date if neverExpires is false
    if (!formData.neverExpires && !formData.endDate.trim()) {
      newErrors.endDate = t('end_date_error');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setSubmitError(null);

    try {
      await onSaveAction(formData, isEditMode);
      setSuccessMessage(isEditMode ? t('update_success') : t('create_success'));
      setTimeout(() => {
        onCloseAction();
      }, 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('submit_error');
      setSubmitError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof CouponFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleNeverExpiresChange = (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      neverExpires: checked,
      // Clear end date/time if never expires is checked
      endDate: checked ? '' : prev.endDate,
      endTime: checked ? '' : prev.endTime,
    }));
    // Clear any end date error when toggling
    if (errors.endDate) {
      setErrors(prev => ({ ...prev, endDate: undefined }));
    }
  };

  const couponTypes: CouponType[] = ['Percentage', 'Fixed Amount', 'Free Trial'];
  const applyToOptions: CouponApplyTo[] = ['Memberships', 'Products', 'Both'];
  const statusOptions: CouponStatus[] = ['Active', 'Inactive', 'Expired'];

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEditMode ? t('edit_title') : t('add_title')}
        </DialogTitle>
      </DialogHeader>

      <div className="py-4">
        {successMessage
          ? (
              <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950/30">
                <p className="text-sm text-green-900 dark:text-green-200">
                  {successMessage}
                </p>
              </div>
            )
          : (
              <div className="space-y-4">
                {submitError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="coupon-submit-error">
                    {submitError}
                  </div>
                )}
                {/* Coupon Code */}
                <div className="space-y-2">
                  <Label htmlFor="coupon-code">{t('code_label')}</Label>
                  <Input
                    id="coupon-code"
                    value={formData.code}
                    onChange={e => handleInputChange('code', e.target.value)}
                    placeholder={t('code_placeholder')}
                    data-testid="coupon-code-input"
                  />
                  {errors.code && (
                    <p className="text-sm text-destructive">{errors.code}</p>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="coupon-description">{t('description_label')}</Label>
                  <Input
                    id="coupon-description"
                    value={formData.description}
                    onChange={e => handleInputChange('description', e.target.value)}
                    placeholder={t('description_placeholder')}
                    data-testid="coupon-description-input"
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive">{errors.description}</p>
                  )}
                </div>

                {/* Type and Amount */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="coupon-type">{t('type_label')}</Label>
                    <Select
                      value={formData.type}
                      onValueChange={value => handleInputChange('type', value)}
                    >
                      <SelectTrigger id="coupon-type" data-testid="coupon-type-select">
                        <SelectValue placeholder={t('type_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {couponTypes.map(type => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coupon-amount">{t('amount_label')}</Label>
                    <Input
                      id="coupon-amount"
                      value={formData.amount}
                      onChange={e => handleInputChange('amount', e.target.value)}
                      placeholder={formData.type === 'Percentage' ? '15' : formData.type === 'Free Trial' ? '7' : '50'}
                      data-testid="coupon-amount-input"
                    />
                    {errors.amount && (
                      <p className="text-sm text-destructive">{errors.amount}</p>
                    )}
                  </div>
                </div>

                {/* Apply To and Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="coupon-apply-to">{t('apply_to_label')}</Label>
                    <Select
                      value={formData.applyTo}
                      onValueChange={value => handleInputChange('applyTo', value)}
                    >
                      <SelectTrigger id="coupon-apply-to" data-testid="coupon-apply-to-select">
                        <SelectValue placeholder={t('apply_to_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {applyToOptions.map(option => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coupon-status">{t('status_label')}</Label>
                    <Select
                      value={formData.status}
                      onValueChange={value => handleInputChange('status', value)}
                    >
                      <SelectTrigger id="coupon-status" data-testid="coupon-status-select">
                        <SelectValue placeholder={t('status_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map(status => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Usage Limit + Per-User Limit */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="coupon-usage-limit">{t('usage_limit_label')}</Label>
                    <Input
                      id="coupon-usage-limit"
                      type="number"
                      min="1"
                      value={formData.usageLimit}
                      onChange={e => handleInputChange('usageLimit', e.target.value)}
                      placeholder={t('usage_limit_placeholder')}
                      data-testid="coupon-usage-limit-input"
                    />
                    <p className="text-xs text-muted-foreground">{t('usage_limit_help')}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coupon-per-user-limit">{t('per_user_limit_label')}</Label>
                    <Input
                      id="coupon-per-user-limit"
                      type="number"
                      min="1"
                      value={formData.perUserLimit}
                      onChange={e => handleInputChange('perUserLimit', e.target.value)}
                      placeholder={t('per_user_limit_placeholder')}
                      data-testid="coupon-per-user-limit-input"
                    />
                    <p className="text-xs text-muted-foreground">{t('per_user_limit_help')}</p>
                    {errors.perUserLimit && (
                      <p className="text-sm text-destructive">{errors.perUserLimit}</p>
                    )}
                  </div>
                </div>

                {/* Start Date and Time */}
                <DateTimePicker
                  date={formData.startDate}
                  time={formData.startTime}
                  onDateChange={date => handleInputChange('startDate', date)}
                  onTimeChange={time => handleInputChange('startTime', time)}
                  dateLabel={t('start_date_label')}
                  timeLabel={t('start_time_label')}
                  datePlaceholder={t('start_date_placeholder')}
                  data-testid-date="coupon-start-date-input"
                  data-testid-time="coupon-start-time-input"
                />

                {/* Never Expires Checkbox */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="coupon-never-expires"
                    checked={formData.neverExpires}
                    onCheckedChange={handleNeverExpiresChange}
                    data-testid="coupon-never-expires-checkbox"
                  />
                  <Label
                    htmlFor="coupon-never-expires"
                    className="cursor-pointer text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t('never_expires_label')}
                  </Label>
                </div>

                {/* End Date and Time - hidden when Never Expires is checked */}
                {!formData.neverExpires && (
                  <>
                    <DateTimePicker
                      date={formData.endDate}
                      time={formData.endTime}
                      onDateChange={date => handleInputChange('endDate', date)}
                      onTimeChange={time => handleInputChange('endTime', time)}
                      dateLabel={t('end_date_label')}
                      timeLabel={t('end_time_label')}
                      datePlaceholder={t('end_date_placeholder')}
                      data-testid-date="coupon-end-date-input"
                      data-testid-time="coupon-end-time-input"
                    />
                    {errors.endDate && (
                      <p className="text-sm text-destructive">{errors.endDate}</p>
                    )}
                  </>
                )}
              </div>
            )}
      </div>

      {!successMessage && (
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCloseAction}
            disabled={isLoading}
          >
            {t('cancel_button')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading
              ? t('saving_button')
              : isEditMode
                ? t('save_changes_button')
                : t('add_button')}
          </Button>
        </DialogFooter>
      )}
    </>
  );
}

export function AddEditCouponModal({
  isOpen,
  onCloseAction,
  coupon,
  onSaveAction,
}: AddEditCouponModalProps) {
  // Use coupon ID as key to reset form when editing different coupons
  // When modal is closed, we don't render content, so no key needed
  const formKey = coupon?.id ?? 'new';

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCloseAction()}>
      <DialogContent className="max-w-lg">
        {isOpen && (
          <CouponFormContent
            key={formKey}
            coupon={coupon}
            onCloseAction={onCloseAction}
            onSaveAction={onSaveAction}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
