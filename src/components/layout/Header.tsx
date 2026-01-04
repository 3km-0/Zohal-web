'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';

interface HeaderProps {
  variant?: 'default' | 'transparent';
  showNavLinks?: boolean;
  className?: string;
}

export function Header({
  variant = 'default',
  showNavLinks = true,
  className,
}: HeaderProps) {
  const t = useTranslations('nav');

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
        'px-6 py-4 md:px-8',
        variant === 'default' && 'bg-surface border-b border-border',
        variant === 'transparent' && 'bg-transparent',
        className
      )}
    >
      <Link
        href="/"
        className="text-2xl font-bold text-accent tracking-tight hover:opacity-80 transition-opacity"
      >
        Zohal
      </Link>

      <div className="flex items-center gap-6">
        {showNavLinks && (
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-text-soft hover:text-accent transition-colors font-medium"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
        <LanguageSwitcher />
      </div>
    </nav>
  );
}

