'use client';

import { ArrowDown01, ArrowDownAZ, ArrowUp10, ArrowUpZA } from 'lucide-react';

import { cn } from '@/utils/Helpers';

export type SortDirection = 'asc' | 'desc';

export type SortableHeaderProps<TField extends string> = {
  /** The field this header sorts by. */
  'field': TField;
  /** The field the table is currently sorted by. */
  'activeField': TField | null;
  /** Direction of the current sort. */
  'direction': SortDirection;
  'onSort': (field: TField) => void;
  'children': React.ReactNode;
  /**
   * Which icon pair to show. `alpha` (default) is A–Z; `numeric` is 0–1, used
   * for dates and amounts where an alphabetic glyph would misdescribe the
   * ordering. Some tables already made this distinction by hand.
   */
  'sortIcons'?: 'alpha' | 'numeric';
  'className'?: string;
  'data-testid'?: string;
};

/**
 * A sortable column header button.
 *
 * This markup was previously copy-pasted at 28 sites across six tables with a
 * byte-identical class string and the same arrow logic. Extracting it keeps
 * every table's sort affordance in step and gives them all a visible focus
 * ring, which the hand-rolled copies lacked.
 */
function SortableHeader<TField extends string>({
  field,
  activeField,
  direction,
  onSort,
  children,
  sortIcons = 'alpha',
  className,
  'data-testid': dataTestId,
}: SortableHeaderProps<TField>) {
  const isActive = activeField === field;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      data-testid={dataTestId}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-sm hover:text-foreground/80',
        'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
    >
      {children}
      {isActive && (
        sortIcons === 'numeric'
          ? (direction === 'asc'
              ? <ArrowDown01 className="size-4" />
              : <ArrowUp10 className="size-4" />)
          : (direction === 'asc'
              ? <ArrowDownAZ className="size-4" />
              : <ArrowUpZA className="size-4" />)
      )}
    </button>
  );
}

export { SortableHeader };
