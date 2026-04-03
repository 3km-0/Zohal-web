'use client';

import { useTranslations } from 'next-intl';
import { Crown, FolderOpen, House, LogOut, Menu, Search, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAppShell } from './AppShellContext';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function AppHeader({ title, subtitle, leading, actions, className }: AppHeaderProps) {
  const { user, signOut } = useAuth();
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const tSidebar = useTranslations('sidebar');
  const { openMobileSidebar } = useAppShell();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      className={cn(
        'flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md md:px-6 md:py-4',
        className
      )}
    >
      {/* Left: Title */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={openMobileSidebar}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-scholar-sm border border-border text-text-soft transition-colors hover:bg-surface-alt md:hidden"
          aria-label={tSidebar('openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="min-w-0">
          {title && <h1 className="truncate text-xl font-semibold leading-none text-text">{title}</h1>}
          {subtitle && <p className="mt-1 hidden truncate text-sm text-text-soft md:block">{subtitle}</p>}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="ml-auto flex shrink-0 items-center justify-end gap-2 sm:gap-4">
        {actions}

        {/* Global Search */}
        <Link
          href="/ask"
          className="hidden rounded-scholar-sm p-2 transition-colors hover:bg-surface-alt md:inline-flex"
          aria-label={tNav('ask')}
          data-tour="global-search"
        >
          <Search className="w-5 h-5 text-text-soft" />
        </Link>

        {/* Language Switcher */}
        <div className="hidden md:block">
          <LanguageSwitcher />
        </div>

        {/* User Menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1 rounded-full hover:bg-surface-alt transition-colors"
            aria-label="User menu"
          >
            {/* Initials avatar — uses color-mix to avoid invalid CSS variable opacity */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{
                background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                color: 'var(--accent)',
              }}
            >
              {(user?.user_metadata?.full_name as string | undefined)?.[0]?.toUpperCase() ||
                user?.email?.[0]?.toUpperCase() ||
                '?'}
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-60 bg-surface border border-border rounded-scholar shadow-[var(--shadowMd)] z-50 overflow-hidden animate-fade-in">
              {/* User info header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                    color: 'var(--accent)',
                  }}
                >
                  {(user?.user_metadata?.full_name as string | undefined)?.[0]?.toUpperCase() ||
                    user?.email?.[0]?.toUpperCase() ||
                    '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text truncate">
                    {(user?.user_metadata?.full_name as string | undefined) || tCommon('zohalUser')}
                  </p>
                  <p className="text-xs text-text-soft truncate">{user?.email || ''}</p>
                </div>
              </div>

              {/* Nav links */}
              <div className="py-1">
                <Link
                  href="/workspaces"
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  {tNav('dashboard')}
                </Link>
                <Link
                  href="/home"
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  <House className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  {tNav('home')}
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  <Settings className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  {tNav('settings')}
                </Link>
                <Link
                  href="/subscription"
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  <Crown className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  {tSidebar('subscription')}
                </Link>
                <hr className="my-1 border-border" />
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    signOut();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-error hover:bg-error/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  {tSidebar('logOut')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
