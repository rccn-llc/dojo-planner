'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Helpers';

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChangeAction: (page: number) => void;
};

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChangeAction,
}: PaginationProps) {
  const startItem = currentPage * itemsPerPage + 1;
  const endItem = Math.min((currentPage + 1) * itemsPerPage, totalItems);

  // Generate page numbers to display (with ellipsis if needed)
  const getPageNumbers = () => {
    const pages: (number | { type: 'ellipsis'; id: string })[] = [];
    const maxVisible = 5;
    const halfVisible = Math.floor(maxVisible / 2);

    if (totalPages <= maxVisible) {
      // Show all pages if total is less than max visible
      for (let i = 0; i < totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(0);

      // Calculate range around current page
      let start = Math.max(1, currentPage - halfVisible);
      let end = Math.min(totalPages - 1, currentPage + halfVisible);

      // Adjust if near the beginning
      if (currentPage <= halfVisible) {
        end = Math.min(totalPages - 1, maxVisible - 1);
      }

      // Adjust if near the end
      if (currentPage >= totalPages - halfVisible - 1) {
        start = Math.max(1, totalPages - maxVisible);
      }

      // Add ellipsis if needed
      if (start > 1) {
        pages.push({ type: 'ellipsis', id: 'start' });
      }

      // Add middle pages
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      // Add ellipsis if needed
      if (end < totalPages - 2) {
        pages.push({ type: 'ellipsis', id: 'end' });
      }

      // Always show last page if not already included
      if (totalPages > 1 && end < totalPages - 1) {
        pages.push(totalPages - 1);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();
  const shouldShowControls = totalPages > 1;

  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div className="shrink-0 text-left text-sm text-neutral-1000">
        Showing
        {' '}
        <span className="font-semibold">
          {startItem}
          -
          {endItem}
        </span>
        {' '}
        of
        {' '}
        <span className="font-semibold">{totalItems}</span>
        {' '}
        entries
      </div>

      {shouldShowControls && (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChangeAction(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="h-10 gap-2 border border-neutral-400 bg-neutral-100 text-neutral-1000 shadow-none disabled:text-neutral-600"
          >
            <ArrowLeft className="size-4" />
            Previous
          </Button>

          <div className="flex gap-1">
            {pageNumbers.map((page) => {
              if (typeof page === 'object') {
                return (
                  <span
                    key={`ellipsis-${page.id}`}
                    className="flex items-center justify-center px-3 py-2 text-sm text-neutral-1000"
                  >
                    ...
                  </span>
                );
              }

              const pageNum = page as number;
              const isActive = pageNum === currentPage;

              return (
                <Button
                  key={`page-${pageNum}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => onPageChangeAction(pageNum)}
                  className={cn(
                    'h-10 min-w-10 border shadow-none',
                    isActive
                      ? 'border-neutral-1500 bg-neutral-1500 text-neutral-100 hover:bg-neutral-1500'
                      : 'border-neutral-400 bg-neutral-100 text-neutral-1000 hover:bg-neutral-200',
                  )}
                >
                  {pageNum + 1}
                </Button>
              );
            })}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChangeAction(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage === totalPages - 1}
            className="h-10 gap-2 border border-neutral-400 bg-neutral-100 text-neutral-1000 shadow-none disabled:text-neutral-600"
          >
            Next
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
