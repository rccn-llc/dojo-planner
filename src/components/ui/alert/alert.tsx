import { AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/Helpers';

export type AlertProps = {
  children: React.ReactNode;
  variant?: 'error' | 'warning' | 'success' | 'info';
  className?: string;
};

function Alert({ children, variant = 'error', className }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium',
        variant === 'error' && 'bg-red-600 text-white',
        variant === 'warning' && 'bg-yellow-500 text-white',
        variant === 'success' && 'bg-green-600 text-white',
        variant === 'info' && 'bg-blue-600 text-white',
        className,
      )}
    >
      <AlertTriangle className="size-5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export { Alert };
