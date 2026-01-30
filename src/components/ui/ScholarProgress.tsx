'use client';

import { type ReactNode } from 'react';
import { CheckCircle, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ScholarProgress - iOS-style step-by-step progress indicator
 *
 * Usage:
 * <ScholarProgress
 *   currentStep={2}
 *   steps={[
 *     { label: 'Preparing', description: 'Setting up analysis' },
 *     { label: 'Analyzing', description: 'Processing pages' },
 *     { label: 'Finalizing', description: 'Generating results' },
 *   ]}
 * />
 */

export interface ScholarProgressStep {
  label: string;
  description?: string;
  icon?: ReactNode;
}

export interface ScholarProgressProps {
  currentStep: number;
  steps: ScholarProgressStep[];
  className?: string;
  /** Show as compact horizontal bar (default) or expanded grid */
  variant?: 'bar' | 'grid';
  /** Status message to show below progress */
  statusMessage?: string;
}

export function ScholarProgress({
  currentStep,
  steps,
  className,
  variant = 'bar',
  statusMessage,
}: ScholarProgressProps) {
  const totalSteps = steps.length;
  const progressPercent = Math.min(100, ((currentStep + 1) / totalSteps) * 100);

  if (variant === 'bar') {
    return (
      <div className={cn('space-y-3', className)}>
        {/* Progress bar */}
        <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Current step label */}
        {statusMessage && (
          <div className="text-sm text-text-soft font-medium">{statusMessage}</div>
        )}
      </div>
    );
  }

  // Grid variant - matches iOS step grid
  return (
    <div className={cn('space-y-4', className)}>
      {/* Progress bar */}
      <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className="text-sm text-text-soft font-medium">{statusMessage}</div>
      )}

      {/* Step grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {steps.map((step, idx) => {
          const isComplete = idx < currentStep;
          const isActive = idx === currentStep;
          const isPending = idx > currentStep;

          return (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-scholar border transition-colors duration-200',
                isComplete && 'border-success/30 bg-success/5',
                isActive && 'border-accent/30 bg-accent/5',
                isPending && 'border-border bg-surface-alt/50'
              )}
            >
              {/* Status icon */}
              <div className="flex-shrink-0">
                {isComplete ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 text-accent animate-spin" />
                ) : (
                  <Circle className="w-5 h-5 text-border" />
                )}
              </div>

              {/* Label */}
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'text-sm font-semibold truncate',
                    isComplete && 'text-success',
                    isActive && 'text-accent',
                    isPending && 'text-text-soft'
                  )}
                >
                  {step.label}
                </div>
                {step.description && (
                  <div className="text-xs text-text-soft truncate">{step.description}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ScholarProgressCard - Full card wrapper for progress display (iOS analyzing view style)
 */
export interface ScholarProgressCardProps extends ScholarProgressProps {
  title: string;
  titleIcon?: ReactNode;
  footer?: ReactNode;
}

export function ScholarProgressCard({
  title,
  titleIcon,
  footer,
  ...progressProps
}: ScholarProgressCardProps) {
  return (
    <div className="rounded-scholar border border-border bg-surface shadow-[var(--shadowSm)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-surface-alt border-b border-border">
        <div className="flex items-center gap-2">
          {titleIcon && <span className="text-accent">{titleIcon}</span>}
          <h3 className="text-sm font-semibold text-text">{title}</h3>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        <ScholarProgress {...progressProps} />
      </div>

      {/* Footer */}
      {footer && (
        <div className="px-4 py-3 bg-surface-alt border-t border-border text-xs text-text-soft">
          {footer}
        </div>
      )}
    </div>
  );
}
