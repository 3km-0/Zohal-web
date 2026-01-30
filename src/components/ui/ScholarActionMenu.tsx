'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ScholarActionMenu - iOS-style capsule action menu with dropdown
 *
 * Replaces HTML <details> with a proper styled popover menu.
 *
 * Usage:
 * <ScholarActionMenu
 *   icon={<Bolt className="w-4 h-4" />}
 *   label="Actions"
 *   items={[
 *     { label: 'Generate Report', icon: <FileText />, onClick: () => {} },
 *     { type: 'divider' },
 *     { label: 'Export Calendar', icon: <Calendar />, onClick: () => {} },
 *   ]}
 * />
 */

export type ScholarActionMenuItem =
  | { type: 'divider' }
  | { type: 'section'; label: string }
  | {
      label: string;
      icon?: ReactNode;
      onClick: () => void;
      disabled?: boolean;
      destructive?: boolean;
    };

export interface ScholarActionMenuProps {
  icon?: ReactNode;
  label: string;
  items: ScholarActionMenuItem[];
  className?: string;
  isLoading?: boolean;
  /** Tour target attribute */
  dataTour?: string;
}

export function ScholarActionMenu({
  icon,
  label,
  items,
  className,
  isLoading,
  dataTour,
}: ScholarActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  return (
    <div ref={menuRef} className={cn('relative', className)} data-tour={dataTour}>
      {/* Trigger Button - iOS capsule style */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
          'bg-surface-alt border border-border',
          'text-sm font-semibold text-text',
          'transition-all duration-200',
          'hover:border-accent/50 hover:bg-surface',
          isOpen && 'border-accent bg-surface',
          isLoading && 'opacity-60 cursor-not-allowed'
        )}
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        ) : (
          icon && <span className="text-accent-alt">{icon}</span>
        )}
        <span>{label}</span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-text-soft transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute right-0 top-full mt-2 min-w-[200px] max-w-[280px]',
            'bg-surface border border-border rounded-scholar shadow-[var(--shadowMd)]',
            'overflow-hidden z-50',
            'animate-fade-in'
          )}
        >
          <div className="py-1">
            {items.map((item, index) => {
              if ('type' in item && item.type === 'divider') {
                return <div key={index} className="h-px bg-border my-1" />;
              }

              if ('type' in item && item.type === 'section') {
                return (
                  <div
                    key={index}
                    className="px-3 py-2 text-[11px] font-semibold text-text-soft uppercase tracking-[1.2px] bg-surface-alt border-b border-border"
                  >
                    {item.label}
                  </div>
                );
              }

              const actionItem = item as {
                label: string;
                icon?: ReactNode;
                onClick: () => void;
                disabled?: boolean;
                destructive?: boolean;
              };

              return (
                <button
                  key={index}
                  onClick={() => {
                    actionItem.onClick();
                    setIsOpen(false);
                  }}
                  disabled={actionItem.disabled}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-left',
                    'transition-colors duration-150',
                    actionItem.disabled
                      ? 'text-text-soft cursor-not-allowed opacity-50'
                      : actionItem.destructive
                        ? 'text-error hover:bg-error/10'
                        : 'text-text hover:bg-surface-alt'
                  )}
                >
                  {actionItem.icon && (
                    <span
                      className={cn(
                        'w-4 h-4 flex-shrink-0',
                        actionItem.destructive ? 'text-error' : 'text-text-soft'
                      )}
                    >
                      {actionItem.icon}
                    </span>
                  )}
                  <span>{actionItem.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
