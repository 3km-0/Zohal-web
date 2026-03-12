'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations();
  const currentYear = new Date().getFullYear();
  const ndgpCertificateUrl =
    'https://dgp.sdaia.gov.sa/wps/portal/pdp/services/certificate/3bb4185f-7506-f111-b127-005056ab563b/!ut/p/z1/jc9BDoIwEAXQs3CAZqatLbhEQyJojYaA2I1pF0USBWKIC09v41IiOLtJ3p_MBw0V6NY8m9oMTdeam9_PWl7SOJEbmiOj5Uqg5GovxJYzTDicvkBRLj04MpXFKccDB_1PHn9MjHP5bA74Buyh1qoG3ZvhSprWdVBxaxc0Eo6EnhNHKSWWspAgChTSWCG59b_pyesRG4Fx_Q-Y6Nffi-q1c3laB8EbHJvoQA!!/';

  const footerLinks = [
    { href: '/terms', label: t('nav.terms') },
    { href: '/privacy', label: t('nav.privacy') },
    { href: '/support', label: t('nav.support') },
  ];

  return (
    <footer className="mt-12 border-t border-border bg-[rgba(255,255,255,0.7)] py-12 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <div className="website-display mb-4 text-[2rem] text-text">{t('common.appName')}</div>

        <div className="mb-6 flex flex-wrap justify-center gap-6">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-text-soft transition-colors hover:text-text"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={ndgpCertificateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-soft transition-colors hover:text-text"
          >
            {t('footer.ndgpCertificate')}
          </a>
        </div>

        <p className="mb-3 text-xs uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
          {t('footer.dataLocality')}
        </p>
        <p className="text-sm text-text-soft">
          {t('footer.copyright', { year: currentYear })}
        </p>
      </div>
    </footer>
  );
}
