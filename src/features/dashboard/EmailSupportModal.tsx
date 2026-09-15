'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type EmailSupportModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function EmailSupportModal({ isOpen, onClose }: EmailSupportModalProps) {
  const t = useTranslations('EmailSupportModal');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({});

  const validateForm = (): boolean => {
    const newErrors: { subject?: string; message?: string } = {};

    if (!subject.trim()) {
      newErrors.subject = t('subject_error');
    }

    if (!message.trim()) {
      newErrors.message = t('message_error');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    // Simulate sending email - in a real app, this would call an API
    await new Promise(resolve => setTimeout(resolve, 1000));

    setIsSubmitting(false);
    setSubject('');
    setMessage('');
    setErrors({});
    onClose();
  };

  const handleClose = () => {
    setSubject('');
    setMessage('');
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="support-subject">{t('subject_label')}</Label>
            <Input
              id="support-subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={t('subject_placeholder')}
              error={!!errors.subject}
            />
            {errors.subject && (
              <p className="text-sm text-destructive">{errors.subject}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="support-message">{t('message_label')}</Label>
            <Textarea
              id="support-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('message_placeholder')}
              rows={5}
              error={!!errors.message}
            />
            {errors.message && (
              <p className="text-sm text-destructive">{errors.message}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('cancel_button')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('sending_button') : t('send_button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
