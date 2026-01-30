'use client';

import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ScholarSelect - iOS-style dropdown select matching scholar theme
 */

export interface ScholarSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  helperText?: string;
  error?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  icon?: ReactNode;
}

export const ScholarSelect = forwardRef<HTMLSelectElement, ScholarSelectProps>(
  ({ label, helperText, error, options, placeholder, icon, className, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-semibold text-text-soft">{label}</label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-soft pointer-events-none">
              {icon}
            </div>
          )}
          <select
            ref={ref}
            className={cn(
              'w-full appearance-none rounded-scholar border border-border bg-surface text-text',
              'px-4 py-2.5 pr-10 text-sm font-medium',
              'transition-colors duration-200',
              'hover:border-text-soft/50',
              'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
              icon && 'pl-10',
              error && 'border-error focus:border-error focus:ring-error/20',
              props.disabled && 'opacity-50 cursor-not-allowed bg-surface-alt',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-soft pointer-events-none" />
        </div>
        {helperText && !error && (
          <p className="text-xs text-text-soft">{helperText}</p>
        )}
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  }
);

ScholarSelect.displayName = 'ScholarSelect';
