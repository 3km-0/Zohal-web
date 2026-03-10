'use client';

import { useTranslations } from 'next-intl';
import { Menu, Search, User } from 'lucide-react';
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
            className="flex items-center gap-2 p-1.5 rounded-scholar-sm hover:bg-surface-alt transition-colors"
          >
            <div className="w-8 h-8 bg-accent/10 border border-accent/20 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-accent" />
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-scholar shadow-[var(--shadowMd)] z-50 overflow-hidden animate-fade-in">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-text truncate">
                  {user?.email || tCommon('user')}
                </p>
                <p className="text-xs text-text-soft">
                  {user?.user_metadata?.full_name || tCommon('zohalUser')}
                </p>
              </div>
              <div className="py-1">
                <Link
                  href="/workspaces"
                  className="block px-4 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  {tNav('dashboard')}
                </Link>
                <Link
                  href="/home"
                  className="block px-4 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  {tNav('home')}
                </Link>
                <Link
                  href="/settings"
                  className="block px-4 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  {tNav('settings')}
                </Link>
                <Link
                  href="/settings/subscription"
                  className="block px-4 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  {tSidebar('subscription')}
                </Link>
                <hr className="my-1 border-border" />
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    signOut();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error/10 transition-colors"
                >
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
