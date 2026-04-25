'use client';

import { forwardRef, type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * ZohalNotebookCard - Matches iOS ZohalNotebookCard
 *
 * A card component with an optional header section styled with surfaceAlt background
 * and overline text styling. Content section has surface background.
 *
 * Usage:
 * <ZohalNotebookCard header="SECTION TITLE">
 *   <div className="p-4">Content here</div>
 * </ZohalNotebookCard>
 *
 * Or with custom header:
 * <ZohalNotebookCard headerContent={<div>Custom header</div>}>
 *   <div className="p-4">Content here</div>
 * </ZohalNotebookCard>
 */

export interface ZohalNotebookCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Simple string header - renders as overline text */
  header?: string;
  /** Custom header content - use for complex headers */
  headerContent?: ReactNode;
  /** Card content */
  children: ReactNode;
  /** Additional classes for the card container */
  className?: string;
}

export const ZohalNotebookCard = forwardRef<HTMLDivElement, ZohalNotebookCardProps>(
  ({ header, headerContent, children, className, ...props }, ref) => {
    const hasHeader = !!header || !!headerContent;

    return (
      <div
        ref={ref}
        className={cn(
          'bg-surface rounded-zohal border border-border overflow-hidden shadow-[var(--shadowSm)]',
          className
        )}
        {...props}
      >
        {hasHeader && (
          <div className="px-4 py-3 bg-surface-alt border-b border-border">
            {header ? (
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[1.2px]">
                {header}
              </span>
            ) : (
              headerContent
            )}
          </div>
        )}
        <div className="w-full">{children}</div>
      </div>
    );
  }
);

ZohalNotebookCard.displayName = 'ZohalNotebookCard';

/**
 * ZohalOverline - Text styled as section overline (matching iOS zohalOverline())
 */
export interface ZohalOverlineProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export function ZohalOverline({ children, className, ...props }: ZohalOverlineProps) {
  return (
    <span
      className={cn(
        'text-[11px] font-semibold text-text-muted uppercase tracking-[1.2px]',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/**
 * ZohalSectionHeader - Used inside cards for grouped content with overline
 */
export interface ZohalSectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  action?: ReactNode;
}

export function ZohalSectionHeader({ title, action, className, ...props }: ZohalSectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 mb-3', className)} {...props}>
      <ZohalOverline>{title}</ZohalOverline>
      {action}
    </div>
  );
}
