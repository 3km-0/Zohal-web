'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ScholarTabs - iOS-style tab selector with accent colors and optional badges
 *
 * Usage:
 * <ScholarTabs
 *   tabs={[
 *     { id: 'overview', label: 'Overview', icon: <FileText /> },
 *     { id: 'variables', label: 'Variables', icon: <FileText />, count: 12, attentionCount: 2 },
 *   ]}
 *   activeTab="overview"
 *   onTabChange={(id) => setTab(id)}
 * />
 */

export interface ScholarTab {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Total count to show as badge */
  count?: number | null;
  /** Attention/warning count (shown in parentheses within badge) */
  attentionCount?: number;
}

export interface ScholarTabsProps {
  tabs: ScholarTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  /** Tour target attribute for coach marks */
  dataTour?: string;
}

export function ScholarTabs({ tabs, activeTab, onTabChange, className, dataTour }: ScholarTabsProps) {
  return (
    <div 
      className={cn('flex flex-wrap gap-2', className)}
      data-tour={dataTour}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const hasCount = tab.count !== null && tab.count !== undefined && tab.count > 0;
        const hasAttention = (tab.attentionCount ?? 0) > 0;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-scholar text-sm font-semibold transition-all duration-200',
              isActive
                ? 'bg-accent/10 text-accent border-2 border-accent shadow-sm'
                : 'bg-surface text-text border border-border hover:bg-surface-alt hover:border-text-soft/30'
            )}
          >
            {tab.icon && (
              <span className={cn('w-4 h-4', isActive ? 'text-accent' : 'text-text-soft')}>
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {hasCount && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold min-w-[24px] justify-center',
                  isActive ? 'bg-accent text-white' : 'bg-text-soft/20 text-text'
                )}
              >
                {tab.count}
                {hasAttention && (
                  <span className="text-amber-400 ml-0.5">({tab.attentionCount})</span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * ScholarTabContent - Container for tab content with consistent styling
 */
export interface ScholarTabContentProps {
  children: ReactNode;
  className?: string;
}

export function ScholarTabContent({ children, className }: ScholarTabContentProps) {
  return (
    <div className={cn('mt-4 space-y-4', className)}>
      {children}
    </div>
  );
}
