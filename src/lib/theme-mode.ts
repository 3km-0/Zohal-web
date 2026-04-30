'use client';

export type ThemeMode = 'light' | 'dark';
export type DataTheme = 'zohal-light' | 'zohal-dark';

export const THEME_STORAGE_KEY = 'theme';
export const THEME_CHANGE_EVENT = 'zohal-theme-change';
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

export function normalizeThemeMode(value: string | null | undefined): ThemeMode | null {
  if (value === 'light' || value === 'dark') return value;
  return null;
}

export function themeModeToDataTheme(theme: ThemeMode): DataTheme {
  return theme === 'light' ? 'zohal-light' : 'zohal-dark';
}

export function readThemeModeFromStorage(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function resolveThemeMode(): ThemeMode {
  return readThemeModeFromStorage() ?? DEFAULT_THEME_MODE;
}

export function writeThemeModeToStorage(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore blocked storage environments.
  }
}

function dispatchThemeModeChange(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: theme }));
}

export function applyThemeMode(theme: ThemeMode, options?: { persist?: boolean; notify?: boolean }): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', themeModeToDataTheme(theme));

  if (options?.persist !== false) {
    writeThemeModeToStorage(theme);
  }

  if (options?.notify !== false) {
    dispatchThemeModeChange(theme);
  }
}

export function initializeThemeMode(): ThemeMode {
  const theme = resolveThemeMode();
  applyThemeMode(theme, { persist: true, notify: false });
  return theme;
}

export function subscribeToThemeMode(callback: (theme: ThemeMode) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleThemeChange = (event: Event) => {
    const customEvent = event as CustomEvent<ThemeMode>;
    const theme = normalizeThemeMode(customEvent.detail) ?? resolveThemeMode();
    callback(theme);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    callback(resolveThemeMode());
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange as EventListener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
}
