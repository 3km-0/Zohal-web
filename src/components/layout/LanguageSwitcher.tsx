'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export function LanguageSwitcher() {
  const locale = useLocale();
  const tCommon = useTranslations('common');
  const router = useRouter();

  const toggleLanguage = () => {
    const newLocale = locale === 'en' ? 'ar' : 'en';
    // Persist locale preference and mark it as an explicit user choice so
    // the geo-detection middleware won't override it on future visits.
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
    document.cookie = `LOCALE_EXPLICIT=1; path=/; max-age=31536000`;
    router.refresh();
  };

  return (
    <button
      onClick={toggleLanguage}
      className={cn(
        'min-h-[42px] rounded-[var(--rSm)] border border-border bg-surface-alt px-3',
        'text-sm font-medium text-text-soft',
        'hover:border-accent hover:bg-white hover:text-text',
        'transition-colors duration-200'
      )}
      aria-label={locale === 'en' ? tCommon('switchToArabic') : tCommon('switchToEnglish')}
    >
      {locale === 'en' ? 'العربية' : 'English'}
    </button>
  );
}
