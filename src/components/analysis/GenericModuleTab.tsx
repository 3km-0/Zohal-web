'use client';

import { useState, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { Puzzle } from 'lucide-react';
import { EmptyState, Badge } from '@/components/ui';
import { AnalysisRecordCard, AIConfidenceBadge, AnalysisSectionHeader, type AIConfidence } from './AnalysisRecordCard';
import { getSeverityBorderClass } from './SeverityIndicator';
import { cn } from '@/lib/utils';

export interface GenericModuleItem {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  severity?: string;
  confidence?: AIConfidence;
  needsAttention?: boolean;
  attentionLabel?: string;
  spotCheckSuggested?: boolean;
  evidence?: { page_number?: number; snippet?: string; document_id?: string };
  sourceHref?: string | null;
  sourcePage?: number;
  metadata?: Record<string, any>;
  /** Icon to show in the card; defaults to Puzzle */
  icon?: ReactNode;
  iconColor?: string;
  /** Tool action for the card */
  toolAction?: { type: 'calendar' | 'edit' | 'task'; label: string };
  onToolAction?: () => void;
  /** Custom children to render inside the card */
  children?: ReactNode;
}

export interface GenericModuleTabProps {
  moduleId: string;
  moduleTitle: string;
  items: GenericModuleItem[];
  layout?: 'cards' | 'table' | 'list' | 'timeline';
  groupBy?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onReject: (itemId: string) => void;
  /** If the entire module is rejected */
  isModuleRejected?: boolean;
  onRestoreModule?: () => void;
  isPatchingSnapshot?: boolean;
  workspaceId: string;
  documentId: string;
  /** Additional header actions (e.g. add finding) */
  headerAction?: ReactNode;
  /** Optional raw module result for recursive fallback rendering */
  rawResult?: unknown;
  rawSchema?: Record<string, unknown> | null;
}

export function GenericModuleTab({
  moduleId,
  moduleTitle,
  items,
  layout,
  groupBy,
  emptyTitle,
  emptyDescription,
  onReject,
  isModuleRejected,
  onRestoreModule,
  isPatchingSnapshot,
  workspaceId,
  documentId,
  headerAction,
  rawResult,
}: GenericModuleTabProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Group items if groupBy is specified (must be called before any early returns)
  const groups = useMemo(() => {
    if (!groupBy) return [{ key: '_all', label: '', items }];
    const map = new Map<string, GenericModuleItem[]>();
    for (const item of items) {
      const groupValue = String((item as any)[groupBy] || item.metadata?.[groupBy] || 'other');
      if (!map.has(groupValue)) map.set(groupValue, []);
      map.get(groupValue)!.push(item);
    }
    return Array.from(map.entries()).map(([key, groupItems]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      items: groupItems,
    }));
  }, [items, groupBy]);

  // If the module itself is rejected, show empty state with restore option
  if (isModuleRejected) {
    return (
      <EmptyState
        title="Module Rejected"
        description="This module was marked as rejected."
        action={
          onRestoreModule
            ? {
                label: isPatchingSnapshot ? 'Saving...' : 'Restore',
                onClick: () => {
                  if (!isPatchingSnapshot && onRestoreModule) onRestoreModule();
                },
              }
            : undefined
        }
      />
    );
  }

  if (items.length === 0) {
    if (rawResult !== undefined && rawResult !== null) {
      return (
        <div className="rounded-scholar border border-border bg-surface p-3">
          <RecursiveValue value={rawResult} depth={0} />
        </div>
      );
    }
    return (
      <EmptyState
        title={emptyTitle || `No ${moduleTitle}`}
        description={emptyDescription || `No items found for this module.`}
      />
    );
  }

  return (
    <div className="space-y-3 transition-opacity duration-150">
      {headerAction && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-text-soft">{moduleTitle}</p>
          {headerAction}
        </div>
      )}

      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          {/* Section header if grouped */}
          {group.label && groups.length > 1 && (
            <AnalysisSectionHeader
              icon={<Puzzle className="w-4 h-4" />}
              iconColor="text-accent"
              title={group.label}
              count={group.items.length}
              isExpanded={expandedSections.has(group.key) || expandedSections.size === 0}
              onToggle={() => toggleSection(group.key)}
            />
          )}

          {/* Items */}
          {(expandedSections.has(group.key) || expandedSections.size === 0 || groups.length === 1) &&
            group.items.map((item, idx) => (
              <div
                key={item.id}
                className={cn(
                  'animate-fadeInUp',
                  layout === 'list' && 'border border-border rounded-scholar px-2',
                  getSeverityBorderClass(item.severity) !== 'border-l-border' && 'border-l-[3px]',
                  getSeverityBorderClass(item.severity),
                  'rounded-r-scholar',
                )}
                style={{ animationDelay: `${Math.min(idx, 8) * 30}ms`, animationFillMode: 'both' }}
              >
                <AnalysisRecordCard
                  icon={item.icon || <Puzzle className="w-4 h-4" />}
                  iconColor={item.iconColor}
                  title={item.title}
                  subtitle={item.subtitle}
                  confidence={item.confidence}
                  needsAttention={item.needsAttention}
                  attentionLabel={item.attentionLabel}
                  spotCheckSuggested={item.spotCheckSuggested}
                  sourceHref={item.sourceHref}
                  sourcePage={item.sourcePage}
                  toolAction={item.toolAction}
                  onReject={() => onReject(item.id)}
                  onToolAction={item.onToolAction}
                  evidenceSnippet={item.evidence?.snippet}
                >
                  {/* Body text */}
                  {item.body && (
                    <p className="text-sm text-text-soft whitespace-pre-wrap line-clamp-3">{item.body}</p>
                  )}

                  {/* Metadata key-value pairs */}
                  {item.metadata && Object.keys(item.metadata).length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-soft">
                      {Object.entries(item.metadata).map(([k, v]) => (
                        <span key={k}>
                          <span className="font-medium text-text">{k}:</span> {String(v ?? '—')}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Custom children */}
                  {item.children}
                </AnalysisRecordCard>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function RecursiveValue({ value, depth }: { value: unknown; depth: number }) {
  if (depth > 5) {
    return <code className="text-xs text-text-soft">…</code>;
  }
  if (value === null || value === undefined) {
    return <code className="text-xs text-text-soft">null</code>;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-sm text-text break-words">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <code className="text-xs text-text-soft">[]</code>;
    return (
      <div className="space-y-2">
        {value.slice(0, 100).map((item, idx) => (
          <div key={idx} className="rounded-scholar border border-border/70 bg-surface-alt p-2">
            <RecursiveValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <code className="text-xs text-text-soft">{'{}'}</code>;
    return (
      <div className="space-y-2">
        {entries.slice(0, 120).map(([k, v]) => (
          <div key={k} className="rounded-scholar border border-border/70 bg-surface-alt p-2">
            <div className="text-xs font-semibold text-text-soft">{k}</div>
            <div className="mt-1">
              <RecursiveValue value={v} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return <code className="text-xs text-text-soft">{String(value)}</code>;
}
