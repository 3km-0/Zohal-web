'use client';

import { useEffect } from 'react';
import { initializeThemeMode } from '@/lib/theme-mode';

/**
 * Ensures a stable theme selection across the app.
 *
 * - Default theme is Obsidian dark (set server-side on <html data-theme="zohal-dark">).
 * - If user has a saved preference in localStorage, apply it on the client.
 */
export function ThemeInitializer() {
  useEffect(() => {
    initializeThemeMode();
  }, []);

  return null;
}
