'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-text mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full min-h-[44px] px-4 py-3 bg-surface border rounded-scholar',
            'text-text placeholder:text-text-soft',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-highlight focus:ring-offset-2 focus:ring-offset-background',
            error ? 'border-error' : 'border-border focus:border-highlight',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-error">{error}</p>}
        {hint && !error && (
          <p className="mt-1.5 text-sm text-text-soft">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };

