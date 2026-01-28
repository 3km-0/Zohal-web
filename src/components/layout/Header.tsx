'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Button } from '@/components/ui';

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
        variant === 'default' && 'bg-surface/80 backdrop-blur-md border-b border-border',
        variant === 'transparent' && 'bg-transparent',
        className
      )}
    >
      <Link
        href="/"
        className="text-2xl font-semibold text-accent tracking-tight hover:opacity-80 transition-opacity"
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
                className="text-text-soft hover:text-text transition-colors font-medium"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
        
        <LanguageSwitcher />

        {showAuthButtons && (
          <div className="flex items-center gap-2">
            <Link href="/auth/login">
              <Button variant="ghost" size="sm">
                {authT('login')}
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm">
                {authT('signup')}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

