'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IconBox } from './IconBox';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Secondary action */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  /** Visual variant */
  variant?: 'default' | 'card' | 'inline';
}

/**
 * ScholarEmptyState - iOS-style empty state matching ScholarEmptyState
 *
 * Variants:
 * - default: Centered with icon, title, description
 * - card: Wrapped in a card with surface background
 * - inline: Smaller, for use within sections
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  variant = 'default',
}: EmptyStateProps) {
  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        variant === 'inline' ? 'py-6 px-4' : 'py-12 px-6',
        variant === 'card' && 'rounded-scholar border border-border bg-surface shadow-[var(--shadowSm)]',
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-surface-alt border border-border mb-4',
            variant === 'inline' ? 'w-12 h-12' : 'w-16 h-16'
          )}
        >
          <span className={cn('text-text-soft', variant === 'inline' ? 'w-6 h-6' : 'w-8 h-8')}>
            {icon}
          </span>
        </div>
      )}
      <h3
        className={cn(
          'font-semibold text-text mb-1',
          variant === 'inline' ? 'text-base' : 'text-lg'
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'text-text-soft max-w-md',
            variant === 'inline' ? 'text-sm' : 'text-base',
            (action || secondaryAction) && 'mb-4'
          )}
        >
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {action && (
            <Button onClick={action.onClick} variant="primary" size={variant === 'inline' ? 'sm' : 'md'}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button onClick={secondaryAction.onClick} variant="secondary" size={variant === 'inline' ? 'sm' : 'md'}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return content;
}

