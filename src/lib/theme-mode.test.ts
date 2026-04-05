import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemeMode,
  DEFAULT_THEME_MODE,
  initializeThemeMode,
  normalizeThemeMode,
  readThemeModeFromStorage,
  themeModeToDataTheme,
} from './theme-mode';

describe('theme mode helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'slate-light');
  });

  it('defaults to light mode when no preference is stored', () => {
    expect(DEFAULT_THEME_MODE).toBe('light');
    expect(readThemeModeFromStorage()).toBeNull();
    expect(initializeThemeMode()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('slate-light');
    expect(window.localStorage.getItem('theme')).toBe('light');
  });

  it('applies and persists dark mode when requested', () => {
    const handler = vi.fn();
    window.addEventListener('zohal-theme-change', handler);

    applyThemeMode('dark');

    expect(document.documentElement.getAttribute('data-theme')).toBe('slate-dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('normalizes supported theme values only', () => {
    expect(normalizeThemeMode('light')).toBe('light');
    expect(normalizeThemeMode('dark')).toBe('dark');
    expect(normalizeThemeMode('sepia')).toBeNull();
    expect(themeModeToDataTheme('light')).toBe('slate-light');
    expect(themeModeToDataTheme('dark')).toBe('slate-dark');
  });
});
