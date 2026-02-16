'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { trackMarketingEvent } from '@/lib/analytics';

type Content = {
  brand: { name: string; tagline: string; theme: string };
  nav: {
    links: Array<{ label: string; href: string }>;
    actions: {
      languageToggle: { left: string; right: string };
      a11y: {
        switchToArabic: string;
        switchToEnglish: string;
        openMenu: string;
        closeMenu: string;
      };
      login: { label: string; href: string };
      primaryCta: { label: string; href: string };
    };
  };
  hero: {
    headline: string;
    subhead: string;
    ctas: Array<{ type: string; label: string; href?: string; action?: string }>;
    proofLine: string;
    mock: { title: string; panels: string[] };
  };
  credibilityStrip: { label: string; items: string[] };
  problem: {
    title: string;
    body: string[];
    sideCard: { title: string; before: string[]; after: string[] };
  };
  howItWorks: {
    title: string;
    subhead: string;
    steps: Array<{ title: string; body: string }>;
    ctas: Array<{ type: string; label: string; href: string }>;
  };
  stats: { items: Array<{ value: string; label: string }>; footnote: string };
  capabilities: {
    title: string;
    tabs: Array<{ id: string; label: string; title: string; bullets: string[] }>;
  };
  applications: {
    title: string;
    cards: Array<{
      id: string;
      title: string;
      subtitle: string;
      bullets: string[];
      cta: { label: string; href: string };
    }>;
  };
  decisionPack: { id: string; title: string; bullets: string[]; exportButtons: string[] };
  security: {
    id: string;
    title: string;
    leftBullets: string[];
    rightCard: { title: string; bullets: string[] };
  };
  pricing: {
    id: string;
    title: string;
    toggleLabels: string[];
    professional: Array<{
      id: string;
      name: string;
      price: string;
      bullets: string[];
      cta: { label: string; href: string };
    }>;
    enterprise: Array<{
      id: string;
      name: string;
      price: string;
      bullets: string[];
      cta: { label: string; href: string };
    }>;
    usageMeter: { title: string; body: string };
  };
  insights: {
    id: string;
    title: string;
    subhead: string;
    items: Array<{
      id: string;
      tag: string;
      title: string;
      excerpt: string;
      date: string;
      readTime: string;
      href: string;
    }>;
    cta: { label: string; href: string };
  };
  faq: {
    title: string;
    intro: string;
    items: Array<{ id: string; q: string; a: string }>;
    contactRow: {
      note: string;
      ctas: Array<{ type: string; label: string; href: string }>;
    };
  };
  finalCta: {
    title: string;
    subhead: string;
    ctas: Array<{ type: string; label: string; href: string }>;
  };
  footer: {
    columns: Array<{ title: string; links: Array<{ label: string; href: string }> }>;
    legalNote: string;
  };
  ui: {
    mentalModelLine: string;
    beforeLabel: string;
    afterLabel: string;
    modal: {
      demoTitle: string;
      demoPlaceholderBody: string;
      demoShowsLabel: string;
      demoShowsBody: string;
      close: string;
    };
    mock: {
      decisionPackLabel: string;
      samplePackTitle: string;
      provisional: string;
      finalized: string;
      samplePartyAValue: string;
      sampleEffectiveDateValue: string;
      sampleTermMonthsValue: string;
      documentViewer: string;
      verifiedVariables: string;
      exports: string;
      showEvidence: string;
      hideEvidence: string;
      evidence: string;
      pageLabel: string;
      highlightSnippet: string;
      verificationObjectFilename: string;
      uiMockLabel: string;
      exceptionsQueueTitle: string;
      exceptionsQueueBody: string;
      claimKey: string;
      statusKey: string;
      confidenceKey: string;
      citationsKey: string;
    };
    decisionPackPreview: {
      deliverablesLabel: string;
      deliverables: string[];
      deliverablesBody: string;
    };
    security: {
      buyersCareTitle: string;
    };
    finalCta: {
      previewLabel: string;
    };
  };
};

function useMarketingHomeContent(): Content {
  const t = useTranslations('marketingHome');
  return t.raw('content') as Content;
}

function useScrolled(thresholdPx = 12) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > thresholdPx);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [thresholdPx]);

  return isScrolled;
}

function useInViewOnce<T extends Element>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || isInView) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsInView(true);
          obs.disconnect();
        }
      },
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.15, ...(options ?? {}) }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [isInView, options]);

  return { ref, isInView };
}

function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        'max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-[72px] py-16 sm:py-20 lg:py-28',
        className
      )}
    >
      {children}
    </section>
  );
}

function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const { ref, isInView } = useInViewOnce<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
        isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
        className
      )}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}

function PrimaryLinkButton({
  href,
  children,
  className,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--rSm)]',
        'bg-accent text-background font-semibold px-5 py-2.5',
        'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'hover:bg-highlight hover:-translate-y-0.5 active:translate-y-0',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2',
        className
      )}
    >
      {children}
    </Link>
  );
}

function SecondaryButton({
  children,
  className,
  onClick,
  type = 'button',
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--rSm)]',
        'bg-transparent border border-border text-text font-semibold px-5 py-2.5',
        'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'hover:border-highlight hover:text-highlight',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2',
        className
      )}
    >
      {children}
    </button>
  );
}

function TertiaryLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2 text-accent font-medium',
        'hover:underline underline-offset-4',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2',
        className
      )}
    >
      {children}
    </Link>
  );
}

function LanguageToggle({
  leftLabel,
  rightLabel,
  ariaSwitchToArabic,
  ariaSwitchToEnglish,
}: {
  leftLabel: string;
  rightLabel: string;
  ariaSwitchToArabic: string;
  ariaSwitchToEnglish: string;
}) {
  const locale = useLocale();
  const isEn = locale === 'en';

  const onToggle = () => {
    const newLocale = isEn ? 'ar' : 'en';
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <button
      onClick={onToggle}
      className={cn(
        'min-h-[44px] px-3 rounded-[var(--rSm)]',
        'border border-border bg-transparent text-text',
        'transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'hover:border-highlight hover:text-highlight',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
      )}
      aria-label={isEn ? ariaSwitchToArabic : ariaSwitchToEnglish}
    >
      <span className="text-xs tracking-[0.10em] uppercase">
        {leftLabel} <span className="text-text-soft">|</span> {rightLabel}
      </span>
    </button>
  );
}

function MarketingModal({
  isOpen,
  title,
  closeAriaLabel,
  onClose,
  children,
}: {
  isOpen: boolean;
  title: string;
  closeAriaLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const root = document.getElementById('marketing-modal-root');
      if (!root) return;

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        id="marketing-modal-root"
        className={cn(
          'relative w-full max-w-[960px]',
          'rounded-[var(--rLg)] border border-border bg-surface shadow-[var(--shadowMd)]',
          'p-5 sm:p-6'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg sm:text-xl font-semibold text-text">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className={cn(
              'min-h-[44px] min-w-[44px] rounded-[var(--rSm)] border border-border bg-transparent',
              'text-text-soft hover:text-text hover:border-highlight transition-colors duration-200',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
            )}
            aria-label={closeAriaLabel}
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[var(--rMd)] border border-border bg-surface p-6 shadow-[var(--shadowSm)]">
      <div className="text-2xl sm:text-3xl font-semibold text-text">{value}</div>
      <div className="mt-2 text-sm text-text-soft">{label}</div>
    </div>
  );
}

function Card({
  brandLabel,
  title,
  subtitle,
  bullets,
  footer,
  onClick,
}: {
  brandLabel: string;
  title: string;
  subtitle?: string;
  bullets: string[];
  footer?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--rMd)] border border-border bg-surface p-6 shadow-[var(--shadowSm)]',
        onClick &&
          'cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-accent'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="text-xs tracking-[0.10em] uppercase text-text-soft">{brandLabel}</div>
      <h3 className="mt-2 text-lg font-semibold text-text">{title}</h3>
      {subtitle ? <p className="mt-2 text-text-soft">{subtitle}</p> : null}
      <ul className="mt-4 space-y-2 text-sm text-text-soft">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-[2px] text-accent">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {footer ? <div className="mt-5">{footer}</div> : null}
    </div>
  );
}

function PillTabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const isActive = t.id === activeId;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'min-h-[44px] px-4 rounded-[var(--rPill)] border text-sm font-semibold',
              'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2',
              isActive
                ? 'bg-accent text-background border-accent'
                : 'bg-transparent text-text border-border hover:border-highlight hover:text-highlight'
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Accordion({
  items,
  onOpen,
}: {
  items: Array<{ id: string; q: string; a: string }>;
  onOpen?: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="divide-y divide-[color:var(--border)] rounded-[var(--rMd)] border border-border bg-surface shadow-[var(--shadowSm)]">
      {items.map((item) => {
        const isOpen = item.id === openId;
        const panelId = `faq-panel-${item.id}`;
        const buttonId = `faq-button-${item.id}`;
        return (
          <div key={item.id}>
            <button
              id={buttonId}
              className={cn(
                'w-full text-left px-5 py-4 flex items-center justify-between gap-4',
                'transition-colors duration-200 hover:bg-surface-alt',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-[-2px]'
              )}
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => {
                setOpenId((prev) => {
                  const next = prev === item.id ? null : item.id;
                  if (next && next !== prev) onOpen?.(next);
                  return next;
                });
              }}
            >
              <span className="font-semibold text-text">{item.q}</span>
              <span
                aria-hidden="true"
                className={cn(
                  'text-text-soft transition-transform duration-200',
                  isOpen ? 'rotate-45' : 'rotate-0'
                )}
              >
                +
              </span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className={cn(
                'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              )}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-5 text-text-soft">{item.a}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Nav({ content }: { content: Content }) {
  const isScrolled = useScrolled(12);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const bg = isScrolled ? 'var(--nav-bg-scrolled)' : 'var(--nav-bg-top)';

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
      style={{ backgroundColor: bg, borderBottom: '1px solid var(--nav-border)' }}
    >
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-[72px] h-[72px] flex items-center justify-between">
        <Link
          href="/home"
          className={cn(
            'text-xl sm:text-2xl font-semibold tracking-tight text-text',
            'hover:text-highlight transition-colors duration-200',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
          )}
        >
          {content.brand.name}
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {content.nav.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'text-sm font-medium text-text-soft hover:text-text transition-colors duration-200',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <LanguageToggle
              leftLabel={content.nav.actions.languageToggle.left}
              rightLabel={content.nav.actions.languageToggle.right}
              ariaSwitchToArabic={content.nav.actions.a11y.switchToArabic}
              ariaSwitchToEnglish={content.nav.actions.a11y.switchToEnglish}
            />
          </div>

          <Link
            href={content.nav.actions.login.href}
            className={cn(
              'hidden sm:inline-flex min-h-[44px] items-center justify-center rounded-[var(--rSm)] px-3',
              'text-text-soft hover:text-text hover:bg-surface/40 transition-colors duration-200',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
            )}
          >
            {content.nav.actions.login.label}
          </Link>

          <div className="hidden sm:block">
            <PrimaryLinkButton
              href={content.nav.actions.primaryCta.href}
              onClick={() => trackMarketingEvent('cta_start_free_click', { location: 'nav' })}
            >
              {content.nav.actions.primaryCta.label}
            </PrimaryLinkButton>
          </div>

          <button
            className={cn(
              'md:hidden min-h-[44px] min-w-[44px] rounded-[var(--rSm)] border border-border bg-transparent',
              'text-text-soft hover:text-text hover:border-highlight transition-colors duration-200',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
            )}
            aria-label={content.nav.actions.a11y.openMenu}
            onClick={() => setMobileOpen(true)}
          >
            ☰
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="md:hidden border-t border-[color:var(--nav-border)]">
          <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-4 space-y-2">
            <div className="flex items-center justify-between">
              <LanguageToggle
                leftLabel={content.nav.actions.languageToggle.left}
                rightLabel={content.nav.actions.languageToggle.right}
                ariaSwitchToArabic={content.nav.actions.a11y.switchToArabic}
                ariaSwitchToEnglish={content.nav.actions.a11y.switchToEnglish}
              />
              <button
                className={cn(
                  'min-h-[44px] min-w-[44px] rounded-[var(--rSm)] border border-border bg-transparent',
                  'text-text-soft hover:text-text hover:border-highlight transition-colors duration-200',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                )}
                aria-label={content.nav.actions.a11y.closeMenu}
                onClick={() => setMobileOpen(false)}
              >
                ✕
              </button>
            </div>
            {content.nav.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'block rounded-[var(--rSm)] border border-border bg-surface px-4 py-3',
                  'text-text hover:border-highlight hover:text-highlight transition-colors duration-200',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                )}
              >
                {l.label}
              </Link>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <Link
                href={content.nav.actions.login.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'min-h-[44px] rounded-[var(--rSm)] border border-border bg-transparent px-4 py-3 text-center font-semibold text-text',
                  'hover:border-highlight hover:text-highlight transition-colors duration-200',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                )}
              >
                {content.nav.actions.login.label}
              </Link>
              <PrimaryLinkButton
                href={content.nav.actions.primaryCta.href}
                onClick={() => {
                  trackMarketingEvent('cta_start_free_click', { location: 'nav_mobile' });
                  setMobileOpen(false);
                }}
                className="w-full"
              >
                {content.nav.actions.primaryCta.label}
              </PrimaryLinkButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DecisionPackMock() {
  const [showEvidence, setShowEvidence] = useState(false);
  const content = useMarketingHomeContent();
  const pageLabel = (page: number) =>
    content.ui.mock.pageLabel.replace('{page}', String(page));

  return (
    <div className="rounded-[var(--rLg)] border border-border bg-surface shadow-[var(--shadowMd)] overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
            {content.ui.mock.decisionPackLabel}
          </div>
          <div className="text-lg font-semibold text-text">{content.ui.mock.samplePackTitle}</div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="px-3 py-1 rounded-[var(--rPill)] border border-[color:var(--accent-alt)] text-xs font-semibold text-text">
            {content.ui.mock.provisional}
          </span>
          <span className="px-3 py-1 rounded-[var(--rPill)] border border-success text-xs font-semibold text-text">
            {content.ui.mock.finalized}
          </span>
        </div>
      </div>

      <div className="p-5 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr,360px]">
          <div className="rounded-[var(--rMd)] border border-border bg-[rgba(0,0,0,0.12)] p-4">
            <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
              {content.ui.mock.documentViewer}
            </div>
            <div className="mt-3 grid gap-2">
              <div className="h-3 rounded bg-[rgba(255,255,255,0.08)] w-11/12" />
              <div className="h-3 rounded bg-[rgba(255,255,255,0.08)] w-10/12" />
              <div className="h-3 rounded bg-[rgba(255,255,255,0.08)] w-9/12" />
              <div className="mt-3 rounded-[var(--rSm)] border border-[color:var(--highlight)] bg-[rgba(243,207,122,0.10)] p-3">
                <div className="text-xs font-mono text-highlight">{content.ui.mock.highlightSnippet}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--rMd)] border border-border bg-surface-alt p-4">
            <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
              {content.ui.mock.verifiedVariables}
            </div>
            <div className="mt-3 space-y-3">
              {[
                { k: 'party_a', v: content.ui.mock.samplePartyAValue, s: content.ui.mock.finalized },
                { k: 'effective_date', v: content.ui.mock.sampleEffectiveDateValue, s: content.ui.mock.provisional },
                { k: 'term_months', v: content.ui.mock.sampleTermMonthsValue, s: content.ui.mock.finalized }
              ].map((row) => (
                <div key={row.k} className="rounded-[var(--rSm)] border border-border bg-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-xs text-text-soft">{row.k}</div>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-[var(--rPill)] border text-[11px] font-semibold',
                        row.s === content.ui.mock.finalized
                          ? 'border-success text-text'
                          : 'border-[color:var(--accent-alt)] text-text'
                      )}
                    >
                      {row.s}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-text">{row.v}</div>
                </div>
              ))}
              <button
                onClick={() => setShowEvidence((v) => !v)}
                className={cn(
                  'w-full min-h-[44px] rounded-[var(--rSm)] border border-border bg-transparent',
                  'text-sm font-semibold text-accent hover:underline underline-offset-4',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                )}
              >
                {showEvidence ? content.ui.mock.hideEvidence : content.ui.mock.showEvidence}
              </button>
              {showEvidence ? (
                <div className="rounded-[var(--rMd)] border border-border bg-surface p-4">
                  <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
                    {content.ui.mock.evidence}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-[var(--rSm)] border border-border bg-[rgba(0,0,0,0.10)] p-3">
                      <div className="text-xs text-text-soft">{pageLabel(3)}</div>
                      <div className="mt-2 h-12 rounded bg-[rgba(255,255,255,0.08)]" />
                      <div className="mt-2 h-2 rounded bg-[rgba(243,207,122,0.22)] w-10/12" />
                    </div>
                    <div className="rounded-[var(--rSm)] border border-border bg-[rgba(0,0,0,0.10)] p-3">
                      <div className="text-xs text-text-soft">{pageLabel(5)}</div>
                      <div className="mt-2 h-12 rounded bg-[rgba(255,255,255,0.08)]" />
                      <div className="mt-2 h-2 rounded bg-[rgba(243,207,122,0.22)] w-9/12" />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--rMd)] border border-border bg-surface-alt p-4">
          <div className="text-xs tracking-[0.10em] uppercase text-text-soft">{content.ui.mock.exports}</div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {content.decisionPack.exportButtons.map((label) => (
              <button
                key={label}
                className={cn(
                  'min-h-[44px] rounded-[var(--rSm)] border border-border bg-surface px-3 text-sm font-semibold text-text',
                  'hover:border-highlight hover:text-highlight transition-colors duration-200',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                )}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Homepage() {
  const content = useMarketingHomeContent();
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [activeCapability, setActiveCapability] = useState(content.capabilities.tabs[0]?.id ?? '');
  const [pricingLane, setPricingLane] = useState<'professional' | 'enterprise'>('professional');

  const capability = useMemo(
    () => content.capabilities.tabs.find((t) => t.id === activeCapability) ?? content.capabilities.tabs[0],
    [activeCapability, content.capabilities.tabs]
  );

  return (
    <div className="marketing-grid-bg min-h-screen">
      <Nav content={content} />

      <main className="pt-[72px]">
        {/* Hero */}
        <Section className="pt-10 sm:pt-14 lg:pt-20">
          <div className="grid gap-10 lg:grid-cols-[7fr,5fr] lg:items-center">
            <Reveal>
              <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
                {content.ui.mentalModelLine}
              </div>
              <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-text">
                {content.hero.headline}
              </h1>
              <p className="mt-5 text-lg sm:text-xl text-text-soft leading-relaxed max-w-[62ch]">
                {content.hero.subhead}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <PrimaryLinkButton
                  href={content.nav.actions.primaryCta.href}
                  onClick={() => trackMarketingEvent('cta_start_free_click', { location: 'hero' })}
                >
                  {content.hero.ctas.find((c) => c.type === 'primary')?.label}
                </PrimaryLinkButton>
                {/* Temporarily hidden - 60s demo button
                <SecondaryButton
                  onClick={() => {
                    trackMarketingEvent('cta_watch_demo_click');
                    setIsDemoOpen(true);
                  }}
                >
                  {content.hero.ctas.find((c) => c.type === 'secondary')?.label}
                </SecondaryButton>
                */}
              </div>

              <div className="mt-5 text-sm text-text-soft">{content.hero.proofLine}</div>
            </Reveal>

            <Reveal delayMs={90}>
              <DecisionPackMock />
            </Reveal>
          </div>
        </Section>

        {/* Credibility strip */}
        <Section className="py-10 sm:py-12 lg:py-14">
          <Reveal>
            <div className="rounded-[var(--rLg)] border border-border bg-surface shadow-[var(--shadowSm)] p-6 sm:p-7">
              <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
                {content.credibilityStrip.label}
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {content.credibilityStrip.items.map((item) => (
                  <div
                    key={item}
                    className={cn(
                      'rounded-[var(--rMd)] border border-border bg-transparent px-4 py-3',
                      'text-sm text-text-soft hover:bg-surface-alt transition-colors duration-200'
                    )}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </Section>

        {/* Problem */}
        <Section id="product">
          <div className="grid gap-8 lg:grid-cols-[7fr,5fr] lg:items-start">
            <Reveal>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
                {content.problem.title}
              </h2>
              <div className="mt-5 space-y-4 text-text-soft text-base sm:text-lg leading-relaxed">
                {content.problem.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </Reveal>

            <Reveal delayMs={90}>
              <div className="rounded-[var(--rLg)] border border-border bg-surface shadow-[var(--shadowSm)] p-6">
                <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
                  {content.problem.sideCard.title}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-[var(--rMd)] border border-border bg-surface-alt p-4">
                    <div className="text-sm font-semibold text-text">{content.ui.beforeLabel}</div>
                    <ul className="mt-2 space-y-2 text-sm text-text-soft">
                      {content.problem.sideCard.before.map((b) => (
                        <li key={b} className="flex gap-2">
                          <span className="text-danger">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-[var(--rMd)] border border-border bg-surface-alt p-4">
                    <div className="text-sm font-semibold text-text">{content.ui.afterLabel}</div>
                    <ul className="mt-2 space-y-2 text-sm text-text-soft">
                      {content.problem.sideCard.after.map((b) => (
                        <li key={b} className="flex gap-2">
                          <span className="text-success">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* How it works */}
        <Section id="how">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
              {content.howItWorks.title}
            </h2>
            <p className="mt-4 text-text-soft text-base sm:text-lg max-w-[72ch]">
              {content.howItWorks.subhead}
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {content.howItWorks.steps.map((step, idx) => (
              <Reveal key={step.title} delayMs={idx * 90}>
                <Card brandLabel={content.brand.name} title={step.title} bullets={[step.body]} />
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-8 flex flex-col sm:flex-row gap-3" delayMs={90}>
            <TertiaryLink href={content.howItWorks.ctas[0]?.href ?? '#decision-pack'}>
              {content.howItWorks.ctas[0]?.label} →
            </TertiaryLink>
            <Link
              href={content.howItWorks.ctas[1]?.href ?? '#playbooks'}
              className={cn(
                'inline-flex min-h-[44px] items-center justify-center rounded-[var(--rSm)] border border-border bg-transparent',
                'text-text font-semibold px-5 py-2.5 hover:border-highlight hover:text-highlight transition-colors duration-200',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
              )}
            >
              {content.howItWorks.ctas[1]?.label}
            </Link>
          </Reveal>
        </Section>

        {/* Stats */}
        <Section>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {content.stats.items.map((s, idx) => (
              <Reveal key={s.label} delayMs={idx * 90}>
                <StatCard value={s.value} label={s.label} />
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-4 text-sm text-text-soft" delayMs={120}>
            {content.stats.footnote}
          </Reveal>
        </Section>

        {/* Capabilities tabs */}
        <Section id="playbooks">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
              {content.capabilities.title}
            </h2>
          </Reveal>

          <Reveal className="mt-8" delayMs={90}>
            <PillTabs
              tabs={content.capabilities.tabs.map((t) => ({ id: t.id, label: t.label }))}
              activeId={activeCapability}
              onChange={(id) => {
                setActiveCapability(id);
                trackMarketingEvent('tab_change', { capability_id: id });
              }}
            />
          </Reveal>

          <div className="mt-6 grid gap-4 lg:grid-cols-[7fr,5fr] lg:items-start">
            <Reveal delayMs={90}>
              <div className="rounded-[var(--rLg)] border border-border bg-surface shadow-[var(--shadowSm)] p-6">
                <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
                  {capability?.label}
                </div>
                <h3 className="mt-2 text-2xl font-semibold text-text">{capability?.title}</h3>
                <ul className="mt-4 space-y-2 text-text-soft">
                  {(capability?.bullets ?? []).map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="mt-[2px] text-highlight">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delayMs={180}>
              <div className="rounded-[var(--rLg)] border border-border bg-surface-alt p-6">
                <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
                  {content.ui.mock.uiMockLabel}
                </div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-[var(--rMd)] border border-border bg-surface p-4">
                    <div className="font-mono text-xs text-text-soft">
                      {content.ui.mock.verificationObjectFilename}
                    </div>
                    <pre className="mt-3 text-xs text-text overflow-auto font-mono leading-relaxed">
{`{
  "${content.ui.mock.claimKey}": "…",
  "${content.ui.mock.statusKey}": "${capability?.id === 'verification' ? content.ui.mock.finalized : content.ui.mock.provisional}",
  "${content.ui.mock.confidenceKey}": ${capability?.id === 'exceptions' ? '0.62' : '0.91'},
  "${content.ui.mock.citationsKey}": ["p3:12-18", "p5:4-9"]
}`}
                    </pre>
                  </div>
                  <div className="rounded-[var(--rMd)] border border-border bg-surface p-4">
                    <div className="text-sm font-semibold text-text">
                      {content.ui.mock.exceptionsQueueTitle}
                    </div>
                    <div className="mt-2 text-sm text-text-soft">{content.ui.mock.exceptionsQueueBody}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* Applications grid */}
        <Section>
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
              {content.applications.title}
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {content.applications.cards.map((c, idx) => (
              <Reveal key={c.id} delayMs={idx * 90}>
                <Card
                  brandLabel={content.brand.name}
                  title={c.title}
                  subtitle={c.subtitle}
                  bullets={c.bullets}
                  footer={
                    <TertiaryLink
                      href={c.cta.href}
                      className="text-highlight"
                    >
                      {c.cta.label} →
                    </TertiaryLink>
                  }
                  onClick={() => {
                    trackMarketingEvent('application_card_click', { application_id: c.id });
                    window.location.hash = c.cta.href.startsWith('#') ? c.cta.href : '#product';
                  }}
                />
              </Reveal>
            ))}
          </div>
        </Section>

        {/* Decision pack preview */}
        <Section id={content.decisionPack.id}>
          <div className="grid gap-10 lg:grid-cols-[7fr,5fr] lg:items-start">
            <Reveal>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
                {content.decisionPack.title}
              </h2>
              <ul className="mt-5 space-y-3 text-text-soft">
                {content.decisionPack.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-[2px] text-highlight">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {content.decisionPack.exportButtons.map((b) => (
                  <button
                    key={b}
                    className={cn(
                      'min-h-[44px] rounded-[var(--rSm)] border border-border bg-surface px-3 text-sm font-semibold text-text',
                      'hover:border-highlight hover:text-highlight transition-colors duration-200',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                    )}
                    type="button"
                  >
                    {b}
                  </button>
                ))}
              </div>
            </Reveal>

            <Reveal delayMs={120}>
              <div className="rounded-[var(--rLg)] border border-border bg-surface shadow-[var(--shadowSm)] p-6">
                <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
                  {content.ui.decisionPackPreview.deliverablesLabel}
                </div>
                <div className="mt-4 space-y-3">
                  {content.ui.decisionPackPreview.deliverables.map((label) => (
                    <div
                      key={label}
                      className="rounded-[var(--rMd)] border border-border bg-surface-alt p-4"
                    >
                      <div className="text-sm font-semibold text-text">{label}</div>
                      <div className="mt-2 text-sm text-text-soft">
                        {content.ui.decisionPackPreview.deliverablesBody}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* Deployment & Isolation */}
        <Section id={content.security.id}>
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
              {content.security.title}
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <Reveal delayMs={90}>
              <Card
                brandLabel={content.brand.name}
                title={content.ui.security.buyersCareTitle}
                bullets={content.security.leftBullets}
              />
            </Reveal>
            <Reveal delayMs={180}>
              <Card
                brandLabel={content.brand.name}
                title={content.security.rightCard.title}
                bullets={content.security.rightCard.bullets}
              />
            </Reveal>
          </div>
        </Section>

        {/* Pricing */}
        <Section id={content.pricing.id}>
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
              {content.pricing.title}
            </h2>
          </Reveal>

          <Reveal className="mt-8" delayMs={90}>
            <div className="inline-flex rounded-[var(--rPill)] border border-border bg-surface p-1">
              {(['professional', 'enterprise'] as const).map((lane, idx) => {
                const label = content.pricing.toggleLabels[idx];
                const active = pricingLane === lane;
                return (
                  <button
                    key={lane}
                    className={cn(
                      'min-h-[44px] px-4 rounded-[var(--rPill)] text-sm font-semibold transition-colors duration-200',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2',
                      active ? 'bg-accent text-background' : 'bg-transparent text-text hover:text-highlight'
                    )}
                    onClick={() => {
                      setPricingLane(lane);
                      trackMarketingEvent('pricing_toggle_change', { lane });
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Reveal>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {(pricingLane === 'professional' ? content.pricing.professional : content.pricing.enterprise).map(
              (p, idx) => (
                <Reveal key={p.id} delayMs={idx * 90}>
                  <div className="rounded-[var(--rLg)] border border-border bg-surface shadow-[var(--shadowSm)] p-6">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="text-lg font-semibold text-text">{p.name}</div>
                      <div className="text-text-soft">{p.price}</div>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm text-text-soft">
                      {p.bullets.map((b) => (
                        <li key={b} className="flex gap-2">
                          <span className="mt-[2px] text-highlight">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6">
                      <PrimaryLinkButton
                        href={p.cta.href}
                        className="w-full"
                        onClick={() => trackMarketingEvent('pricing_plan_click', { plan_id: p.id })}
                      >
                        {p.cta.label}
                      </PrimaryLinkButton>
                    </div>
                  </div>
                </Reveal>
              )
            )}
          </div>

          <Reveal className="mt-6" delayMs={120}>
            <div className="rounded-[var(--rLg)] border border-border bg-surface-alt p-6">
              <div className="text-sm font-semibold text-text">{content.pricing.usageMeter.title}</div>
              <div className="mt-2 text-sm text-text-soft">{content.pricing.usageMeter.body}</div>
            </div>
          </Reveal>
        </Section>

        {/* Insights */}
        <Section id={content.insights.id}>
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
              {content.insights.title}
            </h2>
            <p className="mt-4 text-text-soft text-base sm:text-lg max-w-[72ch]">
              {content.insights.subhead}
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {content.insights.items.map((i, idx) => (
              <Reveal key={i.id} delayMs={idx * 90}>
                <Link
                  href={i.href}
                  className={cn(
                    'block rounded-[var(--rLg)] border border-border bg-surface shadow-[var(--shadowSm)] p-6',
                    'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-accent',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                  )}
                >
                  <div className="text-xs tracking-[0.10em] uppercase text-text-soft">{i.tag}</div>
                  <div className="mt-2 text-lg font-semibold text-text">{i.title}</div>
                  <div className="mt-2 text-text-soft">{i.excerpt}</div>
                  <div className="mt-4 text-sm text-text-soft">
                    {i.date} • {i.readTime}
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-8" delayMs={120}>
            <TertiaryLink href={content.insights.cta.href}>{content.insights.cta.label} →</TertiaryLink>
          </Reveal>
        </Section>

        {/* FAQ */}
        <Section>
          <div className="grid gap-10 lg:grid-cols-[7fr,5fr] lg:items-start">
            <Reveal>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
                {content.faq.title}
              </h2>
              <p className="mt-4 text-text-soft">{content.faq.intro}</p>
            </Reveal>
            <Reveal delayMs={90}>
              <Accordion
                items={content.faq.items}
                onOpen={(id) => trackMarketingEvent('faq_open', { question_id: id })}
              />
              <div className="mt-6 rounded-[var(--rLg)] border border-border bg-surface-alt p-6">
                <div className="text-text-soft">{content.faq.contactRow.note}</div>
                <div className="mt-4 flex flex-col sm:flex-row gap-3">
                  <Link
                    href={content.faq.contactRow.ctas[0]?.href ?? '/support'}
                    onClick={() => trackMarketingEvent('contact_click')}
                    className={cn(
                      'inline-flex min-h-[44px] items-center justify-center rounded-[var(--rSm)] border border-border bg-transparent',
                      'text-text font-semibold px-5 py-2.5 hover:border-highlight hover:text-highlight transition-colors duration-200',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                    )}
                  >
                    {content.faq.contactRow.ctas[0]?.label}
                  </Link>
                  <PrimaryLinkButton
                    href={content.faq.contactRow.ctas[1]?.href ?? content.nav.actions.primaryCta.href}
                    onClick={() => trackMarketingEvent('cta_start_free_click', { location: 'faq' })}
                  >
                    {content.faq.contactRow.ctas[1]?.label ?? content.nav.actions.primaryCta.label}
                  </PrimaryLinkButton>
                </div>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* Final CTA */}
        <Section className="pt-0">
          <Reveal>
            <div
              className={cn(
                'rounded-[var(--rLg)] border border-border',
                'bg-gradient-to-br from-surface to-surface-alt',
                'p-8 sm:p-10 lg:p-14 shadow-[var(--shadowSm)]'
              )}
            >
              <div className="grid gap-8 lg:grid-cols-[7fr,5fr] lg:items-center">
                <div>
                  <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
                    {content.finalCta.title}
                  </h2>
                  <p className="mt-4 text-text-soft text-base sm:text-lg">{content.finalCta.subhead}</p>
                  <div className="mt-7 flex flex-col sm:flex-row gap-3">
                    <PrimaryLinkButton
                      href={content.finalCta.ctas[0]?.href ?? content.nav.actions.primaryCta.href}
                      onClick={() => trackMarketingEvent('cta_start_free_click', { location: 'final' })}
                    >
                      {content.finalCta.ctas[0]?.label ?? content.nav.actions.primaryCta.label}
                    </PrimaryLinkButton>
                    <Link
                      href={content.finalCta.ctas[1]?.href ?? '/support'}
                      onClick={() => trackMarketingEvent('contact_click')}
                      className={cn(
                        'inline-flex min-h-[44px] items-center justify-center rounded-[var(--rSm)] border border-border bg-transparent',
                        'text-text font-semibold px-5 py-2.5 hover:border-highlight hover:text-highlight transition-colors duration-200',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                      )}
                    >
                      {content.finalCta.ctas[1]?.label}
                    </Link>
                  </div>
                </div>
                <div className="rounded-[var(--rLg)] border border-border bg-[rgba(0,0,0,0.12)] p-6">
                  <div className="text-xs tracking-[0.10em] uppercase text-text-soft">
                    {content.ui.finalCta.previewLabel}
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="h-10 rounded bg-[rgba(255,255,255,0.08)]" />
                    <div className="h-10 rounded bg-[rgba(255,255,255,0.08)]" />
                    <div className="h-10 rounded bg-[rgba(243,207,122,0.16)] border border-[color:var(--highlight)]" />
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </Section>

        {/* Footer */}
        <footer className="border-t border-border">
          <div className="max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-[72px] py-14">
            <div className="grid gap-10 lg:grid-cols-[2fr,10fr]">
              <div>
                <div className="text-2xl font-semibold text-text">{content.brand.name}</div>
                <div className="mt-2 text-text-soft">{content.brand.tagline}</div>
              </div>
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                {content.footer.columns.map((col) => (
                  <div key={col.title}>
                    <div className="text-xs tracking-[0.10em] uppercase text-text-soft">{col.title}</div>
                    <div className="mt-3 space-y-2">
                      {col.links.map((l) => {
                        const isExternal = /^https?:\/\//i.test(l.href);
                        return (
                        <Link
                          key={l.href + l.label}
                          href={l.href}
                          target={isExternal ? '_blank' : undefined}
                          rel={isExternal ? 'noreferrer noopener' : undefined}
                          className={cn(
                            'block text-sm text-text-soft hover:text-text transition-colors duration-200',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                          )}
                        >
                          {l.label}
                        </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-text-soft">
              <div>© {new Date().getFullYear()} {content.brand.name}</div>
              <div>{content.footer.legalNote}</div>
            </div>
          </div>
        </footer>
      </main>

      <MarketingModal
        isOpen={isDemoOpen}
        title={content.ui.modal.demoTitle}
        closeAriaLabel={content.ui.modal.close}
        onClose={() => setIsDemoOpen(false)}
      >
        <div className="rounded-[var(--rLg)] border border-border bg-surface-alt p-6">
          <div className="text-text-soft">
            {content.ui.modal.demoPlaceholderBody}
          </div>
          <div className="mt-4 rounded-[var(--rMd)] border border-border bg-[rgba(0,0,0,0.20)] p-6">
            <div className="text-text">▶︎</div>
            <div className="mt-2 text-sm text-text-soft">
              {content.ui.modal.demoShowsLabel} {content.ui.modal.demoShowsBody}
            </div>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <PrimaryLinkButton
              href={content.nav.actions.primaryCta.href}
              onClick={() => trackMarketingEvent('cta_start_free_click', { location: 'demo_modal' })}
            >
              {content.nav.actions.primaryCta.label}
            </PrimaryLinkButton>
            <SecondaryButton onClick={() => setIsDemoOpen(false)}>{content.ui.modal.close}</SecondaryButton>
          </div>
        </div>
      </MarketingModal>
    </div>
  );
}
