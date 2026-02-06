'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { CheckCircle, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Animated ellipsis that cycles through ".", "..", "..." */
function AnimatedDots({ className }: { className?: string }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(id);
  }, []);
  return <span className={className}>{dots}</span>;
}

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
  /**
   * Optional explicit progress percent (0-100).
   * When provided, it overrides the step-based calculation.
   */
  progressPercent?: number;
}

export function ScholarProgress({
  currentStep,
  steps,
  className,
  variant = 'bar',
  statusMessage,
  progressPercent,
}: ScholarProgressProps) {
  const totalSteps = steps.length;
  const computedPercent =
    totalSteps > 0 ? Math.min(100, ((currentStep + 1) / totalSteps) * 100) : 0;
  const resolvedPercent = Number.isFinite(progressPercent as number)
    ? Math.max(0, Math.min(100, Number(progressPercent)))
    : computedPercent;

  const isActive = resolvedPercent > 0 && resolvedPercent < 100;

  if (variant === 'bar') {
    return (
      <div className={cn('space-y-3', className)}>
        {/* Progress bar */}
        <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
          <div
            className={cn(
              'h-full bg-accent transition-all duration-500 ease-out relative overflow-hidden',
              isActive && 'after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/25 after:to-transparent after:animate-[shimmer_1.8s_ease-in-out_infinite]'
            )}
            style={{ width: `${resolvedPercent}%` }}
          />
        </div>

        {/* Current step label */}
        {statusMessage && (
          <div className="text-sm text-text-soft font-medium flex items-center gap-0.5">
            {isActive && (
              <Loader2 className="w-3.5 h-3.5 text-accent animate-spin mr-1.5 flex-shrink-0" />
            )}
            <span>{statusMessage}</span>
            {isActive && <AnimatedDots />}
          </div>
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
          className={cn(
            'h-full bg-accent transition-all duration-500 ease-out relative overflow-hidden',
            isActive && 'after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/25 after:to-transparent after:animate-[shimmer_1.8s_ease-in-out_infinite]'
          )}
          style={{ width: `${resolvedPercent}%` }}
        />
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className="text-sm text-text-soft font-medium flex items-center gap-0.5">
          {isActive && (
            <Loader2 className="w-3.5 h-3.5 text-accent animate-spin mr-1.5 flex-shrink-0" />
          )}
          <span>{statusMessage}</span>
          {isActive && <AnimatedDots />}
        </div>
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
  const percent = progressProps.progressPercent ?? 0;
  const isActive = percent > 0 && percent < 100;

  return (
    <div className={cn(
      'rounded-scholar border border-border bg-surface shadow-[var(--shadowSm)] overflow-hidden transition-shadow duration-500',
      isActive && 'border-accent/30 shadow-[0_0_16px_rgba(var(--accent-rgb,99,102,241),0.12)]'
    )}>
      {/* Header */}
      <div className="px-4 py-3 bg-surface-alt border-b border-border">
        <div className="flex items-center gap-2">
          {titleIcon && <span className={cn('text-accent', isActive && 'animate-pulse')}>{titleIcon}</span>}
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          {isActive && <Loader2 className="w-4 h-4 text-accent animate-spin ml-auto" />}
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
