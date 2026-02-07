'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { X, FileSearch, Calendar, Pencil, ChevronDown, ChevronUp, ListTodo, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI Confidence types matching iOS
export type AIConfidence = 'high' | 'medium' | 'low';

export interface AIConfidenceBadgeProps {
  confidence: AIConfidence;
}

export function AIConfidenceBadge({ confidence }: AIConfidenceBadgeProps) {
  const config = {
    high: { label: 'High', bg: 'bg-success/10', border: 'border-success/20', text: 'text-success', dot: 'bg-success' },
    medium: { label: 'Medium', bg: 'bg-highlight/10', border: 'border-highlight/20', text: 'text-highlight', dot: 'bg-highlight' },
    low: { label: 'Low', bg: 'bg-error/10', border: 'border-error/20', text: 'text-error', dot: 'bg-error' },
  };
  const c = config[confidence];

  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', c.bg, c.border, c.text, 'border')}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
      {c.label}
    </span>
  );
}

// Verification Attention banner component (now inlined in AnalysisRecordCard)
// This indicates the AI extraction needs human verification (low confidence or conflict)
// NOT to be confused with content risk level (high-risk clause vs low-confidence extraction)

// Tool action types
export type ToolActionType = 'calendar' | 'edit' | 'task';

export interface ToolAction {
  type: ToolActionType;
  label: string;
}

const toolActionConfig: Record<ToolActionType, { icon: typeof Calendar; label: string }> = {
  calendar: { icon: Calendar, label: 'Add to Calendar' },
  edit: { icon: Pencil, label: 'Edit' },
  task: { icon: ListTodo, label: 'Add Task' },
};

// Main card props
export interface AnalysisRecordCardProps {
  icon: ReactNode;
  iconColor?: string;
  title: string;
  subtitle?: string;
  confidence?: AIConfidence;
  needsAttention?: boolean;
  attentionLabel?: string;
  spotCheckSuggested?: boolean;
  sourceHref?: string | null;
  sourcePage?: number;
  toolAction?: ToolAction;
  onReject: () => void;
  onToolAction?: () => void;
  children?: ReactNode;
  /** Optional severity color class for left border accent (e.g. 'border-l-error') */
  severityBorderColor?: string;
  /** Optional inline evidence snippet preview */
  evidenceSnippet?: string | null;
}

export function AnalysisRecordCard({
  icon,
  iconColor = 'text-accent',
  title,
  subtitle,
  confidence,
  needsAttention,
  attentionLabel,
  spotCheckSuggested,
  sourceHref,
  sourcePage,
  toolAction,
  onReject,
  onToolAction,
  children,
  severityBorderColor,
  evidenceSnippet,
}: AnalysisRecordCardProps) {
  const ToolIcon = toolAction ? toolActionConfig[toolAction.type].icon : null;

  return (
    <div className={cn(
      'rounded-scholar border border-border bg-surface shadow-[var(--shadowSm)] overflow-hidden',
      severityBorderColor && `border-l-[3px] ${severityBorderColor}`,
    )}>
      {/* Verification Attention banner (for low confidence / needs_review items) */}
      {needsAttention && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-xs font-bold">
          <AlertTriangle className="w-4 h-4" />
          <span>Verify This</span>
          {attentionLabel && <span className="ml-auto text-xs font-medium">{attentionLabel}</span>}
        </div>
      )}
      
      {/* Spot check suggestion banner (for medium confidence items) */}
      {!needsAttention && spotCheckSuggested && (
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-alt border-b border-border text-text-soft text-xs font-medium">
          <FileSearch className="w-3.5 h-3.5" />
          <span>Spot Check Suggested</span>
          <span className="ml-auto">Medium Confidence</span>
        </div>
      )}
      
      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={cn('flex-shrink-0 w-8 h-8 rounded-full bg-surface-alt border border-border flex items-center justify-center', iconColor)}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-text truncate">{title}</h4>
              {confidence && <AIConfidenceBadge confidence={confidence} />}
            </div>
            {subtitle && <p className="text-xs text-text-soft mt-0.5">{subtitle}</p>}
          </div>
        </div>

        {/* Custom content */}
        {children && <div className="text-sm text-text">{children}</div>}

        {/* Inline evidence snippet preview */}
        {evidenceSnippet && (
          <blockquote className="text-xs text-text-soft italic border-l-2 border-accent/30 pl-3 py-1 line-clamp-2 bg-surface-alt/50 rounded-r-sm">
            {evidenceSnippet}
          </blockquote>
        )}

        {/* Divider */}
        <div className="h-px bg-border -mx-4 my-3" />

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Source - Primary action */}
          {sourceHref && (
            <Link
              href={sourceHref}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-accent hover:bg-accent/90 transition-colors shadow-sm"
            >
              <FileSearch className="w-3.5 h-3.5" />
              {sourcePage ? `Source p.${sourcePage}` : 'View Source'}
            </Link>
          )}

          {/* Tool action */}
          {toolAction && onToolAction && ToolIcon && (
            <button
              onClick={onToolAction}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-accent-alt bg-accent-alt/10 hover:bg-accent-alt/20 border border-accent-alt/30 transition-colors"
            >
              <ToolIcon className="w-3.5 h-3.5" />
              {toolAction.label}
            </button>
          )}

          <div className="flex-1" />

          {/* Reject */}
          <button
            onClick={onReject}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-error bg-error/5 hover:bg-error/15 border border-error/20 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// Section header for grouping records - iOS style collapsible header
export interface AnalysisSectionHeaderProps {
  icon: ReactNode;
  iconColor?: string;
  title: string;
  count: number;
  attentionCount?: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export function AnalysisSectionHeader({
  icon,
  iconColor = 'text-accent',
  title,
  count,
  attentionCount = 0,
  isExpanded,
  onToggle,
}: AnalysisSectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3 text-left bg-surface-alt border border-border rounded-scholar transition-colors hover:bg-surface"
    >
      <div className={cn('w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center', iconColor)}>
        {icon}
      </div>
      <span className="text-sm font-semibold text-text">{title}</span>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-xs font-bold bg-text-soft/20 text-text">
          {count}
        </span>
        {attentionCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-600">
            {attentionCount}
          </span>
        )}
      </div>
      <span className="flex-1" />
      {isExpanded ? (
        <ChevronUp className="w-5 h-5 text-text-soft" />
      ) : (
        <ChevronDown className="w-5 h-5 text-text-soft" />
      )}
    </button>
  );
}

// Expandable JSON display for custom modules
export interface ExpandableJSONProps {
  json: string | null;
  maxCollapsedLines?: number;
}

export function ExpandableJSON({ json, maxCollapsedLines = 4 }: ExpandableJSONProps) {
  if (!json) return <span className="text-text-soft">null</span>;

  const lines = json.split('\n');
  const needsExpand = lines.length > maxCollapsedLines;

  return (
    <details className="group">
      <summary className="cursor-pointer text-xs text-accent hover:underline">
        {needsExpand ? 'Show result JSON' : 'Result'}
      </summary>
      <pre className="mt-2 p-3 rounded-scholar-sm border border-border bg-surface-alt text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
        {json}
      </pre>
    </details>
  );
}
