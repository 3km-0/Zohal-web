'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const toggleLanguage = () => {
    const newLocale = locale === 'en' ? 'ar' : 'en';
    
    // Set cookie to persist preference
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
    
    // Refresh the page to apply the new locale
    router.refresh();
  };

  return (
    <button
      onClick={toggleLanguage}
      className={cn(
        'px-3 py-1.5 rounded-scholar-sm',
        'bg-surface-alt border border-border',
        'text-sm font-medium text-text-soft',
        'hover:border-accent hover:text-accent',
        'transition-colors duration-200'
      )}
      aria-label={`Switch to ${locale === 'en' ? 'Arabic' : 'English'}`}
    >
      {locale === 'en' ? 'العربية' : 'English'}
    </button>
  );
}

