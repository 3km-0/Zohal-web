'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

// MARK: - Toast Store

interface ToastState {
  error: UserFacingError | null;
  show: (error: UserFacingError) => void;
  showError: (error: unknown, endpoint?: string) => void;
  dismiss: () => void;
}

export const useToast = create<ToastState>((set) => ({
  error: null,
  show: (error) => set({ error }),
  showError: (error, endpoint) => set({ error: mapError(error, endpoint) }),
  dismiss: () => set({ error: null }),
}));

// MARK: - Toast Component

interface ToastProps {
  onAction?: (action: UserFacingError['action']) => void;
}

export function Toast({ onAction }: ToastProps) {
  const { error, dismiss } = useToast();

  // Auto-dismiss after 5 seconds (except for auth/limit errors)
  useEffect(() => {
    if (!error) return;
    if (error.category === 'auth' || error.category === 'limit') return;

    const timer = setTimeout(dismiss, 5000);
    return () => clearTimeout(timer);
  }, [error, dismiss]);

  const handleAction = () => {
    if (error?.action) {
      onAction?.(error.action);
    }
    dismiss();
  };

  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', duration: 0.4 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4"
        >
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 p-4 flex items-start gap-3">
            {/* Icon */}
            <div className={`flex-shrink-0 ${getIconColor(error.category)}`}>
              {getIcon(error.category)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-zinc-900 dark:text-white text-sm">
                {error.title}
              </h4>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm mt-0.5 line-clamp-2">
                {error.message}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {error.action && error.action !== 'dismiss' && (
                <button
                  onClick={handleAction}
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  {getActionLabel(error.action)}
                </button>
              )}
              <button
                onClick={dismiss}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
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
      return 'text-orange-500';
    case 'network':
      return 'text-zinc-500';
    case 'not_found':
      return 'text-zinc-400';
    case 'limit':
      return 'text-yellow-500';
    case 'permission':
      return 'text-red-500';
    case 'server':
    case 'unknown':
    default:
      return 'text-red-500';
  }
}

function getActionLabel(action: UserFacingError['action']) {
  switch (action) {
    case 'retry':
      return 'Retry';
    case 'sign-in':
      return 'Sign In';
    case 'upgrade':
      return 'Upgrade';
    default:
      return 'OK';
  }
}

