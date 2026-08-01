'use client';

import { CalendarIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type CalendarDateNavProps = {
  currentDate: Date;
  onDateChangeAction: (date: Date) => void;
  display: string;
};

/**
 * Calendar header date navigator — a clickable heading that opens a popover
 * Calendar so the user can jump to any date without paging through Previous /
 * Next. Addresses #149: the original header was a static `<h2>` with no way
 * to navigate to a specific date.
 *
 * We deliberately do NOT expose a free-text date input — typed dates are
 * easy to mis-parse and add a layer of error handling that doesn't earn its
 * keep. The popover is the only entry point.
 */
export function CalendarDateNav({ currentDate, onDateChangeAction, display }: CalendarDateNavProps) {
  const t = useTranslations('Calendar');
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-2 py-1 text-lg font-semibold text-foreground hover:bg-muted"
          aria-label={t('open_picker_aria')}
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={currentDate}
          onSelect={(d) => {
            if (d) {
              onDateChangeAction(d);
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
