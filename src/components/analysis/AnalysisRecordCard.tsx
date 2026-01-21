'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { X, FileSearch, Calendar, Pencil, ChevronDown, ChevronUp, ListTodo } from 'lucide-react';
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
  sourceHref?: string | null;
  sourcePage?: number;
  toolAction?: ToolAction;
  onReject: () => void;
  onToolAction?: () => void;
  children?: ReactNode;
}

export function AnalysisRecordCard({
  icon,
  iconColor = 'text-accent',
  title,
  subtitle,
  confidence,
  sourceHref,
  sourcePage,
  toolAction,
  onReject,
  onToolAction,
  children,
}: AnalysisRecordCardProps) {
  const ToolIcon = toolAction ? toolActionConfig[toolAction.type].icon : null;

  return (
    <div className="rounded-scholar border border-border bg-surface p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn('flex-shrink-0 mt-0.5', iconColor)}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-text truncate">{title}</h4>
            {confidence && <AIConfidenceBadge confidence={confidence} />}
          </div>
          {subtitle && <p className="text-xs text-text-soft mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>

      {/* Custom content */}
      {children && <div className="text-sm text-text">{children}</div>}

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Reject */}
        <button
          onClick={onReject}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-scholar-sm text-xs font-medium text-error bg-error/10 hover:bg-error/20 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Reject
        </button>

        {/* Source */}
        {sourceHref && (
          <Link
            href={sourceHref}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-scholar-sm text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 transition-colors"
          >
            <FileSearch className="w-3.5 h-3.5" />
            {sourcePage ? `Source p.${sourcePage}` : 'View Source'}
          </Link>
        )}

        <div className="flex-1" />

        {/* Tool action */}
        {toolAction && onToolAction && ToolIcon && (
          <button
            onClick={onToolAction}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-scholar-sm text-xs font-medium text-white bg-accent hover:bg-accent/90 transition-colors"
          >
            <ToolIcon className="w-3.5 h-3.5" />
            {toolAction.label}
          </button>
        )}
      </div>
    </div>
  );
}

// Section header for grouping records
export interface AnalysisSectionHeaderProps {
  icon: ReactNode;
  iconColor?: string;
  title: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export function AnalysisSectionHeader({
  icon,
  iconColor = 'text-accent',
  title,
  count,
  isExpanded,
  onToggle,
}: AnalysisSectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 py-2 text-left hover:bg-surface-alt/50 rounded-scholar-sm transition-colors"
    >
      <span className={iconColor}>{icon}</span>
      <span className="text-sm font-semibold text-text">{title}</span>
      <span className="text-xs text-text-soft">({count})</span>
      <span className="flex-1" />
      {isExpanded ? (
        <ChevronUp className="w-4 h-4 text-text-soft" />
      ) : (
        <ChevronDown className="w-4 h-4 text-text-soft" />
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
