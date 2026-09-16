import { cva } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-neutral-500 text-neutral-1500 [a&]:hover:bg-neutral-600',
        secondary:
          'border-transparent bg-neutral-1400 text-neutral-100 [a&]:hover:bg-neutral-1300',
        destructive:
          'border-transparent bg-destructive text-white focus-visible:ring-destructive/20 [a&]:hover:bg-destructive/90',
        outline:
          'border-neutral-600 bg-transparent text-neutral-1500 dark:border-neutral-950 dark:text-neutral-100 [a&]:hover:bg-neutral-500 [a&]:hover:text-neutral-1500 [a&]:dark:hover:bg-neutral-1400 [a&]:dark:hover:text-neutral-100',
        warning:
          'border-yellow-600 bg-yellow-100 text-yellow-800 dark:border-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-300',
        success:
          'border-green-600 bg-green-100 text-green-800 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);
