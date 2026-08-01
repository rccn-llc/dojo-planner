'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/utils/Helpers';
import { Input } from './input';

export type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  error?: boolean;
  variant?: 'default' | 'highlight';
  showToggle?: boolean;
};

function PasswordInput({
  className,
  showToggle = true,
  disabled,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  const toggleVisibility = () => setShowPassword(!showPassword);

  if (!showToggle || disabled) {
    return <Input type="password" className={className} disabled={disabled} {...props} />;
  }

  return (
    <div className="relative">
      <Input
        type={showPassword ? 'text' : 'password'}
        className={cn('pr-10', className)}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        onClick={toggleVisibility}
        className="absolute top-1/2 right-3 z-10 flex size-5 -translate-y-1/2 items-center justify-center text-neutral-800 hover:text-neutral-1500 focus:text-neutral-1500 focus:outline-none"
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword
          ? (
              <EyeOff className="size-4" />
            )
          : (
              <Eye className="size-4" />
            )}
      </button>
    </div>
  );
}

export { PasswordInput };
