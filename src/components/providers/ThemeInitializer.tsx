'use client';

import { useEffect } from 'react';

type Theme = 'light' | 'dark';

function normalizeTheme(value: string | null): Theme | null {
  if (value === 'light' || value === 'dark') return value;
  return null;
}

function readThemeFromStorage(): Theme | null {
  try {
    return normalizeTheme(window.localStorage.getItem('theme'));
  } catch {
    return null;
  }
}

function writeThemeToStorage(theme: Theme): void {
  try {
    window.localStorage.setItem('theme', theme);
  } catch {
    // Ignore blocked storage environments (privacy mode / hardened reviewers).
  }
}

/**
 * Ensures a stable theme selection across the app.
 *
 * - Default theme is dark (set server-side on <html data-theme="dark">).
 * - If user has a saved preference in localStorage, apply it on the client.
 */
export function ThemeInitializer() {
  useEffect(() => {
    const saved = readThemeFromStorage();
    const theme: Theme = saved ?? 'dark';

    document.documentElement.setAttribute('data-theme', theme);

    // Persist default so Settings reflects reality on first visit.
    if (!saved) writeThemeToStorage(theme);
  }, []);

  return null;
}
