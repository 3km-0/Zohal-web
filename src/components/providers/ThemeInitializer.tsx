'use client';

import { useEffect } from 'react';

type Theme = 'light' | 'dark';

function normalizeTheme(value: string | null): Theme | null {
  if (value === 'light' || value === 'dark') return value;
  return null;
}

/**
 * Ensures a stable theme selection across the app.
 *
 * - Default theme is dark (set server-side on <html data-theme="dark">).
 * - If user has a saved preference in localStorage, apply it on the client.
 */
export function ThemeInitializer() {
  useEffect(() => {
    const saved = normalizeTheme(localStorage.getItem('theme'));
    const theme: Theme = saved ?? 'dark';

    document.documentElement.setAttribute('data-theme', theme);

    // Persist default so Settings reflects reality on first visit.
    if (!saved) localStorage.setItem('theme', theme);
  }, []);

  return null;
}

