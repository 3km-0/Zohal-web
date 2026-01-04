'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'accent';
  size?: 'sm' | 'md';
  dot?: boolean;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    { className, variant = 'default', size = 'md', dot = false, children, ...props },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center gap-1.5 font-medium rounded-full';

    const variants = {
      default: 'bg-surface border border-border text-text-soft',
      success: 'bg-success/10 border border-success/20 text-success',
      warning: 'bg-highlight/10 border border-highlight/20 text-highlight',
      error: 'bg-error/10 border border-error/20 text-error',
      accent: 'bg-accent/10 border border-accent/20 text-accent',
    };

    const sizes = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-3 py-1 text-sm',
    };

    const dotColors = {
      default: 'bg-text-soft',
      success: 'bg-success',
      warning: 'bg-highlight',
      error: 'bg-error',
      accent: 'bg-accent',
    };

    return (
      <span
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {dot && (
          <span
            className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])}
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };

