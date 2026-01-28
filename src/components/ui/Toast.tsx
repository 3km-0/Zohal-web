'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { 
  AlertCircle, 
  WifiOff, 
  Lock, 
  Search, 
  AlertTriangle, 
  ServerCrash,
  X 
} from 'lucide-react';
import { create } from 'zustand';
import { UserFacingError, mapError } from '@/lib/errors';
import { cn } from '@/lib/utils';

// MARK: - Toast Store

interface ToastMessage {
  type: 'error' | 'success';
  title: string;
  message?: string;
  error?: UserFacingError;
}

interface ToastState {
  error: UserFacingError | null;
  success: { title: string; message?: string } | null;
  show: (error: UserFacingError) => void;
  showError: (error: unknown, endpoint?: string) => void;
  showSuccess: (title: string, message?: string) => void;
  dismiss: () => void;
}

export const useToast = create<ToastState>((set) => ({
  error: null,
  success: null,
  show: (error) => set({ error, success: null }),
  showError: (error, endpoint) => set({ error: mapError(error, endpoint), success: null }),
  showSuccess: (title, message) => set({ success: { title, message }, error: null }),
  dismiss: () => set({ error: null, success: null }),
}));

// MARK: - Toast Component

interface ToastProps {
  onAction?: (action: UserFacingError['action']) => void;
}

export function Toast({ onAction }: ToastProps) {
  const { error, success, dismiss } = useToast();
  const tCommon = useTranslations('common');
  const tAuth = useTranslations('auth');
  const tSubscription = useTranslations('subscription');

  // Auto-dismiss after 5 seconds (except for auth/limit errors)
  useEffect(() => {
    if (!error && !success) return;
    if (error?.category === 'auth' || error?.category === 'limit') return;

    const timer = setTimeout(dismiss, success ? 3000 : 5000);
    return () => clearTimeout(timer);
  }, [error, success, dismiss]);

  const handleAction = () => {
    if (error?.action) {
      onAction?.(error.action);
    }
    dismiss();
  };

  const showToast = error || success;
  const isSuccess = Boolean(success);

  return (
    <AnimatePresence>
      {showToast && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', duration: 0.4 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4"
        >
          <div
            className="rounded-scholar shadow-[var(--shadowMd)] border border-border bg-surface p-4 flex items-start gap-3"
            role="status"
            aria-live="polite"
          >
            {/* Icon */}
            <div className={cn('flex-shrink-0', isSuccess ? 'text-success' : getIconColor(error!.category))}>
              {isSuccess ? <CheckIcon /> : getIcon(error!.category)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm text-text">
                {isSuccess ? success!.title : error!.title}
              </h4>
              {(success?.message || error?.message) && (
                <p className="text-sm mt-0.5 line-clamp-2 text-text-soft">
                  {isSuccess ? success!.message : error!.message}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {error?.action && error.action !== 'dismiss' && (
                <button
                  onClick={handleAction}
                  className="text-sm font-semibold text-accent hover:underline underline-offset-4 transition-colors"
                >
                  {getActionLabel(error.action, {
                    tCommon,
                    tAuth,
                    tSubscription,
                  })}
                </button>
              )}
              <button
                onClick={dismiss}
                className="p-1 rounded-scholar-sm text-text-soft hover:text-text hover:bg-surface-alt transition-colors"
                aria-label={tCommon('close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// MARK: - Helpers

function CheckIcon() {
  return (
    <div className="w-5 h-5 rounded-full bg-success flex items-center justify-center">
      <span className="text-background text-xs font-bold">✓</span>
    </div>
  );
}

function getIcon(category: UserFacingError['category']) {
  switch (category) {
    case 'auth':
      return <Lock className="w-5 h-5" />;
    case 'network':
      return <WifiOff className="w-5 h-5" />;
    case 'not_found':
      return <Search className="w-5 h-5" />;
    case 'limit':
      return <AlertTriangle className="w-5 h-5" />;
    case 'permission':
      return <Lock className="w-5 h-5" />;
    case 'server':
      return <ServerCrash className="w-5 h-5" />;
    default:
      return <AlertCircle className="w-5 h-5" />;
  }
}

function getIconColor(category: UserFacingError['category']) {
  switch (category) {
    case 'auth':
      return 'text-highlight';
    case 'network':
      return 'text-text-soft';
    case 'not_found':
      return 'text-text-soft';
    case 'limit':
      return 'text-highlight';
    case 'permission':
      return 'text-error';
    case 'server':
    case 'unknown':
    default:
      return 'text-error';
  }
}

function getActionLabel(
  action: UserFacingError['action'],
  t: {
    tCommon: ReturnType<typeof useTranslations>;
    tAuth: ReturnType<typeof useTranslations>;
    tSubscription: ReturnType<typeof useTranslations>;
  }
) {
  switch (action) {
    case 'retry':
      return t.tCommon('retry');
    case 'sign-in':
      return t.tAuth('login');
    case 'upgrade':
      return t.tSubscription('upgrade');
    default:
      return t.tCommon('confirm');
  }
}

