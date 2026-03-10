'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface AppModeSwitchProps {
  active: 'ask' | 'workspaces';
  className?: string;
}

export function AppModeSwitch({ active, className }: AppModeSwitchProps) {
  const t = useTranslations('askAgent.modes');

  return (
    <div className={cn('inline-flex items-center gap-1 rounded-[18px] border border-border bg-surface-alt p-1', className)}>
      <Link
        href="/ask"
        className={cn(
          'rounded-[14px] px-4 py-2 text-sm font-semibold transition-colors',
          active === 'ask' ? 'bg-accent text-white shadow-[var(--shadowSm)]' : 'text-text-soft hover:bg-surface hover:text-text'
        )}
      >
        {t('ask')}
      </Link>
      <Link
        href="/workspaces"
        className={cn(
          'rounded-[14px] px-4 py-2 text-sm font-semibold transition-colors',
          active === 'workspaces' ? 'bg-accent text-white shadow-[var(--shadowSm)]' : 'text-text-soft hover:bg-surface hover:text-text'
        )}
      >
        {t('workspaces')}
      </Link>
    </div>
  );
}
