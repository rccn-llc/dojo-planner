'use client';

import { HelpCircle, Mail, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmailSupportModal } from './EmailSupportModal';
import { PhoneSupportModal } from './PhoneSupportModal';

export function HelpButton() {
  const t = useTranslations('HelpButton');
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleEmailClick = () => {
    setIsPopoverOpen(false);
    setIsEmailModalOpen(true);
  };

  const handlePhoneClick = () => {
    setIsPopoverOpen(false);
    setIsPhoneModalOpen(true);
  };

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="default"
            size="icon"
            className="fixed right-6 bottom-6 z-50 size-[30px] rounded-full shadow-lg"
            aria-label={t('button_aria_label')}
          >
            <HelpCircle className="size-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-64 p-2"
          sideOffset={8}
        >
          <div className="flex flex-col gap-1">
            <h3 className="px-2 py-1.5 text-sm font-semibold text-foreground">
              {t('popover_title')}
            </h3>
            <button
              type="button"
              onClick={handleEmailClick}
              className="flex w-full cursor-pointer items-center gap-3 rounded-md p-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Mail className="size-4 text-muted-foreground" />
              {t('email_option')}
            </button>
            <button
              type="button"
              onClick={handlePhoneClick}
              className="flex w-full cursor-pointer items-center gap-3 rounded-md p-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Phone className="size-4 text-muted-foreground" />
              {t('phone_option')}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <EmailSupportModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
      />

      <PhoneSupportModal
        isOpen={isPhoneModalOpen}
        onClose={() => setIsPhoneModalOpen(false)}
      />
    </>
  );
}
