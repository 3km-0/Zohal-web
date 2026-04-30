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
    document.documentElement.setAttribute('data-theme', 'zohal-light');
  });

  it('defaults to Obsidian dark mode when no preference is stored', () => {
    expect(DEFAULT_THEME_MODE).toBe('dark');
    expect(readThemeModeFromStorage()).toBeNull();
    expect(initializeThemeMode()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('zohal-dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });

  it('applies and persists dark mode when requested', () => {
    const handler = vi.fn();
    window.addEventListener('zohal-theme-change', handler);

    applyThemeMode('dark');

    expect(document.documentElement.getAttribute('data-theme')).toBe('zohal-dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('normalizes supported theme values only', () => {
    expect(normalizeThemeMode('light')).toBe('light');
    expect(normalizeThemeMode('dark')).toBe('dark');
    expect(normalizeThemeMode('sepia')).toBeNull();
    expect(themeModeToDataTheme('light')).toBe('zohal-light');
    expect(themeModeToDataTheme('dark')).toBe('zohal-dark');
  });
});
