'use client';

import { useTranslations } from 'next-intl';
import { Search, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function AppHeader({ title, subtitle, actions, className }: AppHeaderProps) {
  const { user, signOut } = useAuth();
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const tSidebar = useTranslations('sidebar');
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
        'flex items-center justify-between px-6 py-4 bg-surface/80 backdrop-blur-md border-b border-border',
        className
      )}
    >
      {/* Left: Title */}
      <div>
        {title && <h1 className="text-xl font-semibold text-text">{title}</h1>}
        {subtitle && <p className="text-sm text-text-soft">{subtitle}</p>}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-4">
        {actions}

        {/* Global Search */}
        <Link
          href="/search"
          className="p-2 rounded-scholar-sm hover:bg-surface-alt transition-colors"
          aria-label={tCommon('search')}
        >
          <Search className="w-5 h-5 text-text-soft" />
        </Link>

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* User Menu */}
        <div className="relative" ref={menuRef}>
          <button
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

