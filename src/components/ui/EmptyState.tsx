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
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
    >
      {icon && (
        <IconBox size="xl" variant="muted" className="mb-4">
          {icon}
        </IconBox>
      )}
      <h3 className="text-lg font-semibold text-text mb-1">{title}</h3>
      {description && (
        <p className="text-text-soft max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} variant="primary">
          {action.label}
        </Button>
      )}
    </div>
  );
}

