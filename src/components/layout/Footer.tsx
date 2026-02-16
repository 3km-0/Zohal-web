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
    <footer className="border-t border-border mt-10 pt-12 pb-10">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <div className="text-xl font-semibold text-accent mb-4">{t('common.appName')}</div>

        <div className="flex flex-wrap justify-center gap-6 mb-6">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-text-soft hover:text-text transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={ndgpCertificateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-soft hover:text-text transition-colors"
          >
            {t('footer.ndgpCertificate')}
          </a>
        </div>

        <p className="text-text-soft text-xs mb-3">{t('footer.dataLocality')}</p>
        <p className="text-text-soft text-sm opacity-70">
          {t('footer.copyright', { year: currentYear })}
        </p>
      </div>
    </footer>
  );
}
