import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from './AppHeader';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      ask: 'Ask',
      dashboard: 'Dashboard',
      home: 'Home',
      settings: 'Settings',
      subscription: 'Subscription',
      logOut: 'Log Out',
      zohalUser: 'Zohal User',
      openMenu: 'Open menu',
      switchToDarkMode: 'Switch to dark mode',
      switchToLightMode: 'Switch to light mode',
    })[key] ?? key,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      email: 'user@example.com',
      user_metadata: {
        full_name: 'A User',
      },
    },
    signOut: vi.fn(),
  }),
}));

vi.mock('./AppShellContext', () => ({
  useAppShell: () => ({
    openMobileSidebar: vi.fn(),
  }),
}));

vi.mock('./LanguageSwitcher', () => ({
  LanguageSwitcher: () => <button type="button">Lang</button>,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('AppHeader', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'slate-light');
  });

  it('toggles from light to dark mode from the header control', () => {
    render(<AppHeader title="Workspace" />);

    const toggle = screen.getByTestId('app-header-theme-toggle');
    expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode');

    fireEvent.click(toggle);

    expect(document.documentElement.getAttribute('data-theme')).toBe('slate-dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
  });
});
