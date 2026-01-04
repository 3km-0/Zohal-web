'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations();
  const currentYear = new Date().getFullYear();

  const footerLinks = [
    { href: '/terms', label: t('nav.terms') },
    { href: '/privacy', label: t('nav.privacy') },
    { href: '/support', label: t('nav.support') },
  ];

  return (
    <footer className="border-t border-border mt-10 pt-12 pb-8">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <div className="text-xl font-bold text-accent mb-4">Zohal</div>

        <div className="flex flex-wrap justify-center gap-6 mb-6">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-text-soft hover:text-accent transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <p className="text-text-soft text-sm opacity-70">
          {t('footer.copyright', { year: currentYear })}
        </p>
      </div>
    </footer>
  );
}

