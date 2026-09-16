import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-body font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:bg-neutral-500 disabled:text-neutral-1500 disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-1300 dark:aria-invalid:ring-destructive/40 [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
  {
    variants: {
      variant: {
        default:
          'bg-neutral-1500 text-neutral-100 enabled:hover:bg-neutral-1200 dark:bg-foreground dark:text-background enabled:dark:hover:bg-foreground/80',
        destructive:
          'bg-destructive text-white enabled:hover:bg-destructive/90',
        outline:
          'border border-border bg-background text-foreground shadow-xs enabled:hover:bg-accent enabled:hover:text-accent-foreground dark:border-input dark:bg-background dark:text-foreground enabled:dark:hover:bg-accent enabled:dark:hover:text-accent-foreground',
        secondary:
          'bg-neutral-100 text-neutral-1500 enabled:hover:bg-neutral-200 enabled:dark:hover:bg-neutral-200/80',
        ghost:
          'enabled:hover:bg-accent enabled:hover:text-accent-foreground enabled:dark:hover:bg-accent/20',
        link: 'text-primary underline-offset-4 enabled:hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
