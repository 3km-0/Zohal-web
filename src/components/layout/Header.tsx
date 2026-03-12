'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';

interface HeaderProps {
  variant?: 'default' | 'transparent';
  showNavLinks?: boolean;
  showAuthButtons?: boolean;
  className?: string;
}

export function Header({
  variant = 'default',
  showNavLinks = true,
  showAuthButtons = true,
  className,
}: HeaderProps) {
  const tCommon = useTranslations('common');
  const t = useTranslations('nav');
  const authT = useTranslations('auth');

  const navLinks = [
    { href: '/terms', label: t('terms') },
    { href: '/privacy', label: t('privacy') },
    { href: '/support', label: t('support') },
  ];

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'flex items-center justify-between',
        'px-6 h-[72px] md:px-8',
        variant === 'default' &&
          'border-b backdrop-blur-xl [background-color:var(--nav-bg-scrolled)] [border-color:var(--nav-border)]',
        variant === 'transparent' && 'bg-transparent',
        className
      )}
    >
      <Link
        href="/"
        className="website-display text-[1.85rem] font-normal tracking-[-0.04em] text-text transition-colors hover:text-accent"
      >
        {tCommon('appName')}
      </Link>

      <div className="flex items-center gap-4 md:gap-6">
        {showNavLinks && (
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[13.5px] font-medium text-text-soft transition-colors hover:text-text"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
        
        <LanguageSwitcher />

        {showAuthButtons && (
          <div className="flex items-center gap-2">
            <Link
              href="/auth/login"
              className="inline-flex min-h-[42px] items-center justify-center rounded-[var(--rSm)] px-4 text-sm font-medium text-text-soft transition-colors hover:text-text"
            >
              {authT('login')}
            </Link>
            <Link
              href="/auth/signup"
              className="inline-flex min-h-[42px] items-center justify-center rounded-[var(--rSm)] bg-text px-4 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:opacity-95"
            >
              {authT('signup')}
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
