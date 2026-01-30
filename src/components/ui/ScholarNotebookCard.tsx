'use client';

import { forwardRef, type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * ScholarNotebookCard - Matches iOS ScholarNotebookCard
 *
 * A card component with an optional header section styled with surfaceAlt background
 * and overline text styling. Content section has surface background.
 *
 * Usage:
 * <ScholarNotebookCard header="SECTION TITLE">
 *   <div className="p-4">Content here</div>
 * </ScholarNotebookCard>
 *
 * Or with custom header:
 * <ScholarNotebookCard headerContent={<div>Custom header</div>}>
 *   <div className="p-4">Content here</div>
 * </ScholarNotebookCard>
 */

export interface ScholarNotebookCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Simple string header - renders as overline text */
  header?: string;
  /** Custom header content - use for complex headers */
  headerContent?: ReactNode;
  /** Card content */
  children: ReactNode;
  /** Additional classes for the card container */
  className?: string;
}

export const ScholarNotebookCard = forwardRef<HTMLDivElement, ScholarNotebookCardProps>(
  ({ header, headerContent, children, className, ...props }, ref) => {
    const hasHeader = !!header || !!headerContent;

    return (
      <div
        ref={ref}
        className={cn(
          'bg-surface rounded-scholar border border-border overflow-hidden shadow-[var(--shadowSm)]',
          className
        )}
        {...props}
      >
        {hasHeader && (
          <div className="px-4 py-3 bg-surface-alt border-b border-border">
            {header ? (
              <span className="text-[11px] font-semibold text-text-soft uppercase tracking-[1.2px]">
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

ScholarNotebookCard.displayName = 'ScholarNotebookCard';

/**
 * ScholarOverline - Text styled as section overline (matching iOS scholarOverline())
 */
export interface ScholarOverlineProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export function ScholarOverline({ children, className, ...props }: ScholarOverlineProps) {
  return (
    <span
      className={cn(
        'text-[11px] font-semibold text-text-soft uppercase tracking-[1.2px]',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/**
 * ScholarSectionHeader - Used inside cards for grouped content with overline
 */
export interface ScholarSectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  action?: ReactNode;
}

export function ScholarSectionHeader({ title, action, className, ...props }: ScholarSectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 mb-3', className)} {...props}>
      <ScholarOverline>{title}</ScholarOverline>
      {action}
    </div>
  );
}
