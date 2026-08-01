import { cn } from '@/utils/Helpers';

export type InputProps = React.ComponentProps<'input'> & {
  error?: boolean;
  variant?: 'default' | 'highlight';
};

function Input({ className, type, error, variant = 'default', ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      aria-invalid={error || props['aria-invalid']}
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-neutral-800 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-100 md:text-sm dark:bg-input/30',
        // Variant-specific styles
        variant === 'default' && 'border-neutral-600 bg-neutral-100 text-neutral-1500 disabled:bg-neutral-500 disabled:text-neutral-800 dark:text-foreground dark:disabled:text-muted-foreground',
        variant === 'highlight' && 'border-neutral-1500 bg-neutral-100 text-neutral-1500 disabled:bg-neutral-500 disabled:text-neutral-800 dark:text-foreground dark:disabled:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-red-500 aria-invalid:ring-red-500/20 dark:aria-invalid:ring-red-500/40',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
