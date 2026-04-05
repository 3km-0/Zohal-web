'use client';

import { useEffect } from 'react';
import { initializeThemeMode } from '@/lib/theme-mode';

/**
 * Ensures a stable theme selection across the app.
 *
 * - Default theme is Slate light (set server-side on <html data-theme="slate-light">).
 * - If user has a saved preference in localStorage, apply it on the client.
 */
export function ThemeInitializer() {
  useEffect(() => {
    initializeThemeMode();
  }, []);

  return null;
}
