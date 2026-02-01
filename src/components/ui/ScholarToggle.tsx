'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ScholarToggle - iOS-style toggle switch with label, caption, and optional icon
 */

export interface ScholarToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  caption?: string;
  icon?: ReactNode;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const ScholarToggle = forwardRef<HTMLInputElement, ScholarToggleProps>(
  ({ label, caption, icon, checked, onCheckedChange, className, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
      onChange?.(e);
    };

    return (
      <label className={cn('flex items-start gap-3 cursor-pointer group', className)}>
        <div className="relative flex-shrink-0 mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            checked={checked}
            onChange={handleChange}
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              'w-11 h-6 rounded-full transition-colors duration-200',
              'bg-border peer-checked:bg-accent-alt',
              'peer-focus:ring-2 peer-focus:ring-accent/20 peer-focus:ring-offset-2 peer-focus:ring-offset-surface'
            )}
          />
          <div
            className={cn(
              'absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow-sm',
              'transition-transform duration-200',
              'peer-checked:translate-x-5'
            )}
          />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            {icon && <span className="text-accent-alt">{icon}</span>}
            <span className="text-sm font-semibold text-text group-hover:text-accent transition-colors">
              {label}
            </span>
          </div>
          {caption && (
            <span className="text-xs text-text-soft">{caption}</span>
          )}
        </div>
      </label>
    );
  }
);

ScholarToggle.displayName = 'ScholarToggle';
