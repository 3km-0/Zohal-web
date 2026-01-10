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
          <div className={`rounded-xl shadow-lg border p-4 flex items-start gap-3 ${
            success 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
              : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700'
          }`}>
            {/* Icon */}
            <div className={`flex-shrink-0 ${success ? 'text-green-500' : getIconColor(error!.category)}`}>
              {success ? (
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
              ) : (
                getIcon(error!.category)
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className={`font-medium text-sm ${success ? 'text-green-800 dark:text-green-200' : 'text-zinc-900 dark:text-white'}`}>
                {success ? success.title : error!.title}
              </h4>
              {(success?.message || error?.message) && (
                <p className={`text-sm mt-0.5 line-clamp-2 ${success ? 'text-green-600 dark:text-green-300' : 'text-zinc-600 dark:text-zinc-400'}`}>
                  {success ? success.message : error!.message}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {error?.action && error.action !== 'dismiss' && (
                <button
                  onClick={handleAction}
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  {getActionLabel(error.action)}
                </button>
              )}
              <button
                onClick={dismiss}
                className={`p-1 transition-colors ${success ? 'text-green-400 hover:text-green-600' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
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

