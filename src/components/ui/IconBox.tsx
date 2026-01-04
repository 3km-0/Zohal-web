'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface IconBoxProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'accent' | 'muted';
  icon?: ReactNode;
}

const IconBox = forwardRef<HTMLDivElement, IconBoxProps>(
  ({ className, size = 'md', variant = 'default', icon, children, ...props }, ref) => {
    const baseStyles =
      'flex items-center justify-center rounded-scholar-lg border';

    const variants = {
      default: 'bg-surface-alt border-border text-text',
      accent: 'bg-accent/10 border-accent/20 text-accent',
      muted: 'bg-surface border-border text-text-soft',
    };

    const sizes = {
      sm: 'w-9 h-9 text-lg',
      md: 'w-11 h-11 text-xl',
      lg: 'w-14 h-14 text-2xl',
      xl: 'w-20 h-20 text-4xl',
    };

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {icon || children}
      </div>
    );
  }
);

IconBox.displayName = 'IconBox';

export { IconBox };

