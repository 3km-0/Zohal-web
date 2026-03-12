'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  FileText,
  Languages,
  PlayCircle,
  Scale,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trackMarketingEvent } from '@/lib/analytics';
import { useAuth } from '@/hooks/useAuth';

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
      openDemoLabel: string;
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
      verifiedStatus: string;
      reviewStatus: string;
      sampleGoverningLawLabel: string;
      sampleGoverningLawValue: string;
      samplePartyALabel: string;
      samplePartyAValue: string;
      sampleEffectiveDateLabel: string;
      sampleEffectiveDateValue: string;
      sampleTermLabel: string;
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
      fieldEvidenceLabel: string;
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

function splitProofLine(line: string) {
  return line
    .split('•')
    .map((item) => item.trim())
    .filter(Boolean);
}

function trackPrimaryCtaClick(location: string, href: string) {
  if (href.startsWith('/support')) {
    trackMarketingEvent('contact_click', { location });
    return;
  }

  trackMarketingEvent('cta_start_free_click', { location });
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

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reducedMotion;
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
        'bg-accent text-[#172018] font-semibold px-5 py-2.5',
        'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'shadow-[0_10px_28px_rgba(201,151,62,0.14)] hover:bg-highlight hover:-translate-y-0.5 active:translate-y-0',
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
    document.cookie = `LOCALE_EXPLICIT=1; path=/; max-age=31536000`;
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
        className={cn(
          'relative w-full max-w-[1080px]',
          'rounded-[28px] border border-border bg-surface shadow-[var(--shadowMd)]',
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
    <div className="rounded-[22px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-6 shadow-[var(--shadowSm)]">
      <div className="text-2xl sm:text-3xl font-[family:var(--font-source-serif)] font-semibold text-text">
        {value}
      </div>
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
        'flex h-full flex-col rounded-[22px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-6 shadow-[var(--shadowSm)]',
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
      <h3 className="mt-2 text-lg font-[family:var(--font-source-serif)] font-semibold text-text">
        {title}
      </h3>
      {subtitle ? <p className="mt-2 text-text-soft">{subtitle}</p> : null}
      <ul className="mt-4 space-y-2 text-sm text-text-soft">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-[2px] text-accent">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {footer ? <div className="mt-auto pt-5">{footer}</div> : null}
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
  const { user, signOut } = useAuth();
  const tNav = useTranslations('nav');
  const tSidebar = useTranslations('sidebar');

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
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8 lg:px-[72px] h-[78px] flex items-center justify-between font-[family:var(--font-inter)]">
        <Link
          href="/home"
          className={cn(
            'text-2xl sm:text-3xl font-[family:var(--font-source-serif)] font-semibold tracking-tight leading-none text-text',
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

          {user ? (
            <>
              <Link
                href="/workspaces"
                className={cn(
                  'hidden sm:inline-flex min-h-[44px] items-center justify-center rounded-[var(--rSm)] px-3',
                  'text-text-soft hover:text-text hover:bg-surface/40 transition-colors duration-200',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                )}
              >
                {tNav('dashboard')}
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className={cn(
                  'hidden sm:inline-flex min-h-[44px] items-center justify-center rounded-[var(--rSm)] px-3',
                  'text-text-soft hover:text-text hover:bg-surface/40 transition-colors duration-200',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                )}
              >
                {tSidebar('logOut')}
              </button>
            </>
          ) : (
            <>
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
            </>
          )}

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
            {user ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <Link
                  href="/workspaces"
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'min-h-[44px] rounded-[var(--rSm)] border border-border bg-transparent px-4 py-3 text-center font-semibold text-text',
                    'hover:border-highlight hover:text-highlight transition-colors duration-200',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                  )}
                >
                  {tNav('dashboard')}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    signOut();
                  }}
                  className={cn(
                    'min-h-[44px] rounded-[var(--rSm)] border border-border bg-transparent px-4 py-3 text-center font-semibold text-text',
                    'hover:border-highlight hover:text-highlight transition-colors duration-200',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                  )}
                >
                  {tSidebar('logOut')}
                </button>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DecisionPackMock() {
  const content = useMarketingHomeContent();
  const pageLabel = (page: number) =>
    content.ui.mock.pageLabel.replace('{page}', String(page));

  const factRows = [
    {
      label: content.ui.mock.sampleGoverningLawLabel,
      value: content.ui.mock.sampleGoverningLawValue,
      status: content.ui.mock.verifiedStatus,
      accent: 'success',
    },
    {
      label: content.ui.mock.samplePartyALabel,
      value: content.ui.mock.samplePartyAValue,
      status: content.ui.mock.verifiedStatus,
      accent: 'success',
    },
    {
      label: content.ui.mock.sampleEffectiveDateLabel,
      value: content.ui.mock.sampleEffectiveDateValue,
      status: content.ui.mock.reviewStatus,
      accent: 'highlight',
    },
    {
      label: content.ui.mock.sampleTermLabel,
      value: content.ui.mock.sampleTermMonthsValue,
      status: content.ui.mock.verifiedStatus,
      accent: 'success',
    },
  ] as const;

  return (
    <div className="relative overflow-hidden rounded-[34px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(29,44,37,0.98),rgba(18,28,23,0.98))] shadow-[0_28px_90px_rgba(3,10,7,0.34)]">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(243,207,122,0),rgba(243,207,122,0.35),rgba(243,207,122,0))]" />
      <div className="absolute -right-20 top-10 h-40 w-40 rounded-full bg-[rgba(201,151,62,0.12)] blur-3xl" />
      <div className="absolute -left-12 bottom-12 h-32 w-32 rounded-full bg-[rgba(45,136,120,0.14)] blur-3xl" />

      <div className="relative flex items-start justify-between gap-4 border-b border-[rgba(255,255,255,0.06)] px-6 py-5">
        <div>
          <div className="text-[11px] tracking-[0.22em] uppercase text-text-soft">
            {content.ui.mock.decisionPackLabel}
          </div>
          <div className="mt-2 max-w-[28ch] text-xl font-[family:var(--font-source-serif)] font-semibold text-text sm:text-2xl">
            {content.ui.mock.samplePackTitle}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="rounded-[var(--rPill)] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-[11px] font-semibold text-text-soft">
            {content.ui.mock.reviewStatus}
          </span>
          <span className="rounded-[var(--rPill)] border border-[rgba(59,164,106,0.34)] bg-[rgba(59,164,106,0.16)] px-3 py-1 text-[11px] font-semibold text-success">
            {content.ui.mock.verifiedStatus}
          </span>
        </div>
      </div>

      <div className="relative grid gap-5 p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr),minmax(280px,0.85fr)]">
          <div className="rounded-[28px] border border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
                {content.ui.mock.documentViewer}
              </div>
              <div className="rounded-[var(--rPill)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[10px] tracking-[0.16em] uppercase text-text-soft">
                PDF
              </div>
            </div>
            <div className="mt-5 rounded-[24px] border border-[rgba(255,255,255,0.06)] bg-[rgba(8,14,11,0.24)] p-5">
              <div className="space-y-3">
                <div className="h-2.5 w-11/12 rounded-full bg-[rgba(255,255,255,0.08)]" />
                <div className="h-2.5 w-8/12 rounded-full bg-[rgba(255,255,255,0.08)]" />
                <div className="h-2.5 w-10/12 rounded-full bg-[rgba(255,255,255,0.08)]" />
                <div className="h-2.5 w-7/12 rounded-full bg-[rgba(255,255,255,0.08)]" />
              </div>
              <div className="mt-5 rounded-[20px] border border-[rgba(201,151,62,0.3)] bg-[rgba(201,151,62,0.08)] p-4 text-sm leading-7 text-accent">
                {content.ui.mock.highlightSnippet}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[4, 12].map((page) => (
                  <div
                    key={page}
                    className="rounded-[18px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.025)] p-3"
                  >
                    <div className="text-xs text-text-soft">{pageLabel(page)}</div>
                    <div className="mt-2 h-12 rounded-[14px] bg-[rgba(255,255,255,0.06)]" />
                    <div className="mt-2 h-2 w-8/12 rounded-full bg-[rgba(243,207,122,0.24)]" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
                {content.ui.mock.verifiedVariables}
              </div>
              <div className="mt-4 space-y-3">
                {factRows.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-[22px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-text-soft">{row.label}</div>
                      <span
                        className={cn(
                          'rounded-[var(--rPill)] px-2.5 py-1 text-[11px] font-semibold',
                          row.accent === 'success'
                            ? 'border border-[rgba(59,164,106,0.32)] bg-[rgba(59,164,106,0.16)] text-success'
                            : 'border border-[color:var(--accent-alt)] bg-[rgba(201,151,62,0.06)] text-accent'
                        )}
                      >
                        {row.status}
                      </span>
                    </div>
                    <div className="mt-2 text-base text-text">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-[color:var(--accent-alt)] bg-[linear-gradient(180deg,rgba(201,151,62,0.12),rgba(201,151,62,0.05))] p-5">
              <div className="text-[11px] tracking-[0.18em] uppercase text-accent">
                {content.ui.mock.exceptionsQueueTitle}
              </div>
              <div className="mt-3 text-lg leading-relaxed text-text sm:text-xl">
                {content.ui.mock.exceptionsQueueBody}
              </div>
            </div>

            <div className="rounded-[24px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-5">
              <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
                {content.ui.mock.fieldEvidenceLabel}
              </div>
              <div className="mt-4 grid gap-2">
                {[pageLabel(4), pageLabel(12)].map((label) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-[18px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
                  >
                    <span className="text-sm text-text">{label}</span>
                    <span className="text-xs uppercase tracking-[0.16em] text-text-soft">
                      {content.ui.mock.evidence}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroVisualScene({
  content,
  isRtl,
  reducedMotion,
}: {
  content: Content;
  isRtl: boolean;
  reducedMotion: boolean;
}) {
  const factRows = [
    {
      label: content.ui.mock.sampleGoverningLawLabel,
      value: content.ui.mock.sampleGoverningLawValue,
      tone: "success",
      status: content.ui.mock.verifiedStatus,
    },
    {
      label: content.ui.mock.samplePartyALabel,
      value: content.ui.mock.samplePartyAValue,
      tone: "success",
      status: content.ui.mock.verifiedStatus,
    },
    {
      label: content.ui.mock.sampleEffectiveDateLabel,
      value: content.ui.mock.sampleEffectiveDateValue,
      tone: "warning",
      status: content.ui.mock.reviewStatus,
    },
  ] as const;

  const dashClass = reducedMotion ? "" : "homepage-scene-dash";
  const pulseClass = reducedMotion ? "" : "homepage-scene-pulse";
  const floatClass = reducedMotion ? "" : "homepage-scene-float";
  const shimmerClass = reducedMotion ? "" : "homepage-scene-shimmer";

  return (
    <div className={cn("relative mx-auto w-full", isRtl ? "max-w-[780px]" : "max-w-[760px]")}>
      <div className="relative overflow-hidden rounded-[34px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(30,45,38,0.98),rgba(18,29,24,0.98))] p-5 shadow-[0_28px_90px_rgba(3,10,7,0.3)] sm:p-6 lg:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(45,136,120,0.09),transparent_22%),radial-gradient(circle_at_84%_16%,rgba(201,151,62,0.12),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]" />
        <div
          className={cn(
            "absolute top-4 h-px w-28 bg-[linear-gradient(90deg,rgba(243,207,122,0),rgba(243,207,122,0.5),rgba(243,207,122,0))]",
            isRtl ? "left-6" : "right-6"
          )}
        />

        <div className="relative z-10 flex flex-wrap gap-2">
          <span className="rounded-[var(--rPill)] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.035)] px-3 py-1.5 text-[11px] tracking-[0.16em] uppercase text-text-soft">
            {content.hero.mock.title}
          </span>
          {content.hero.mock.panels.map((panel) => (
            <span
              key={panel}
              className="rounded-[var(--rPill)] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-3 py-1.5 text-xs text-text-soft"
            >
              {panel}
            </span>
          ))}
        </div>

        <div
          className={cn(
            "relative z-10 mt-5 grid gap-4",
            isRtl
              ? "min-[1800px]:grid-cols-[minmax(0,1fr),minmax(280px,0.86fr)]"
              : "lg:grid-cols-[minmax(0,1.05fr),minmax(250px,0.82fr)]"
          )}
        >
          <div className="relative rounded-[28px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,16,13,0.26)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
                {content.ui.mock.documentViewer}
              </div>
              <div className="rounded-[var(--rPill)] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[10px] tracking-[0.16em] uppercase text-text-soft">
                PDF
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-5">
              <div className="space-y-3">
                <div className="h-2.5 w-11/12 rounded-full bg-[rgba(255,255,255,0.08)]" />
                <div className="h-2.5 w-9/12 rounded-full bg-[rgba(255,255,255,0.08)]" />
                <div className="h-2.5 w-10/12 rounded-full bg-[rgba(255,255,255,0.08)]" />
                <div className="h-2.5 w-8/12 rounded-full bg-[rgba(255,255,255,0.08)]" />
              </div>

              <div
                className={cn(
                  "relative mt-5 overflow-hidden rounded-[20px] border border-[rgba(201,151,62,0.28)] bg-[rgba(201,151,62,0.08)] p-4",
                  isRtl && "p-4 sm:p-5"
                )}
              >
                <div className={cn("absolute inset-y-0 -left-1/3 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(243,207,122,0.18),transparent)]", shimmerClass)} />
                <div className={cn("relative text-sm leading-7 text-accent", isRtl && "sm:text-[15px] sm:leading-8")}>
                  {content.ui.mock.highlightSnippet}
                </div>
              </div>

              <div className="mt-5 grid gap-3 min-[560px]:grid-cols-2">
                {[4, 12].map((page) => (
                  <div
                    key={page}
                    className="rounded-[18px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-3"
                  >
                    <div className="text-xs text-text-soft">
                      {content.ui.mock.pageLabel.replace("{page}", String(page))}
                    </div>
                    <div className="mt-2 h-12 rounded-[14px] bg-[rgba(255,255,255,0.06)]" />
                    <div className="mt-2 h-2 w-8/12 rounded-full bg-[rgba(243,207,122,0.22)]" />
                  </div>
                ))}
              </div>
            </div>

            <div
              className={cn(
                "pointer-events-none absolute top-[92px] w-16 border-t border-dashed border-[rgba(243,207,122,0.38)]",
                isRtl ? "left-[-28px]" : "right-[-28px]",
                dashClass
              )}
            />
          </div>

          <div className="relative space-y-4 min-w-0">
            <div className="rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
              <div className={cn("flex gap-3", isRtl ? "flex-col items-start sm:flex-row sm:items-center sm:justify-between" : "items-center justify-between")}>
                <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
                  {content.ui.mock.verifiedVariables}
                </div>
                <span className="rounded-[var(--rPill)] border border-[rgba(59,164,106,0.34)] bg-[rgba(59,164,106,0.16)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-success">
                  {content.ui.mock.verifiedStatus}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {factRows.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-[18px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-3"
                  >
                    <div className={cn("flex gap-2", isRtl ? "flex-col items-start" : "items-center justify-between gap-3")}>
                      <div className="min-w-0 text-xs font-semibold leading-6 text-text-soft">{row.label}</div>
                      <span
                        className={cn(
                          "shrink-0 rounded-[var(--rPill)] px-2 py-0.5 text-[10px] font-semibold",
                          row.tone === "success"
                            ? "border border-[rgba(59,164,106,0.32)] bg-[rgba(59,164,106,0.16)] text-success"
                            : "border border-[rgba(201,151,62,0.26)] bg-[rgba(201,151,62,0.07)] text-accent"
                        )}
                      >
                        {row.status}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-text">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative rounded-[24px] border border-[rgba(201,151,62,0.28)] bg-[linear-gradient(180deg,rgba(201,151,62,0.13),rgba(201,151,62,0.05))] p-4">
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full bg-accent", pulseClass)} />
                <div className="text-[11px] tracking-[0.18em] uppercase text-accent">
                  {content.ui.mock.exceptionsQueueTitle}
                </div>
              </div>
              <div className="mt-3 text-sm leading-6 text-text">{content.ui.mock.exceptionsQueueBody}</div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "relative z-10 mt-4 grid gap-4",
            isRtl
              ? "min-[1800px]:grid-cols-[minmax(260px,0.82fr),minmax(0,1fr)] min-[1800px]:items-start"
              : "lg:grid-cols-[minmax(0,0.78fr),minmax(0,1fr)] lg:items-start"
          )}
        >
          <div
            className={cn(
              "rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 shadow-[0_18px_50px_rgba(3,10,7,0.18)]",
              floatClass
            )}
          >
            <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
              {content.ui.decisionPackPreview.deliverablesLabel}
            </div>
            <div className="mt-4 space-y-2.5">
              {content.ui.decisionPackPreview.deliverables.slice(0, 3).map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5"
                >
                  <span className="text-sm text-text">{label}</span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-text-soft">
                    {content.ui.mock.verifiedStatus}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,16,13,0.22)] p-4">
            <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
              {content.ui.mock.fieldEvidenceLabel}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[4, 12].map((page) => (
                <div
                  key={page}
                  className="rounded-[18px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] px-3 py-3"
                >
                  <div className="text-xs text-text-soft">
                    {content.ui.mock.pageLabel.replace("{page}", String(page))}
                  </div>
                  <div className="mt-2 h-10 rounded-[14px] bg-[rgba(255,255,255,0.06)]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function CapabilityPreviewCard() {
  const content = useMarketingHomeContent();

  const rows = [
    {
      label: content.ui.mock.sampleGoverningLawLabel,
      value: content.ui.mock.sampleGoverningLawValue,
      status: content.ui.mock.verifiedStatus,
      tone: 'success',
    },
    {
      label: content.ui.mock.samplePartyALabel,
      value: content.ui.mock.samplePartyAValue,
      status: content.ui.mock.verifiedStatus,
      tone: 'success',
    },
    {
      label: content.ui.mock.sampleEffectiveDateLabel,
      value: content.ui.mock.sampleEffectiveDateValue,
      status: content.ui.mock.reviewStatus,
      tone: 'warning',
    },
    {
      label: content.ui.mock.sampleTermLabel,
      value: content.ui.mock.sampleTermMonthsValue,
      status: content.ui.mock.verifiedStatus,
      tone: 'success',
    },
  ] as const;

  return (
    <div className="rounded-[32px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-6 shadow-[var(--shadowSm)]">
      <div className="text-xs tracking-[0.14em] uppercase text-text-soft">
        {content.ui.mock.uiMockLabel}
      </div>
      <div className="mt-4 rounded-[22px] border border-[color:var(--accent-alt)] bg-[rgba(201,151,62,0.06)] p-5">
        <div className="text-xs tracking-[0.14em] uppercase text-accent">
          {content.ui.mock.exceptionsQueueTitle}
        </div>
        <div className="mt-2 text-sm text-text-soft">{content.ui.mock.exceptionsQueueBody}</div>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-[22px] border border-border bg-[rgba(255,255,255,0.02)] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-text-soft">{row.label}</div>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-[var(--rPill)] text-[11px] font-semibold',
                  row.tone === 'success'
                    ? 'bg-[rgba(59,164,106,0.18)] text-success'
                    : 'border border-[color:var(--accent-alt)] text-accent'
                )}
              >
                {row.status}
              </span>
            </div>
            <div className="mt-2 text-sm text-text">{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function extractYouTubeId(input: string | undefined) {
  const value = (input || '').trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.replace(/^\/+/, '').trim();
    }

    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/watch')) {
        return url.searchParams.get('v') || '';
      }

      const segments = url.pathname.split('/').filter(Boolean);
      const embedIndex = segments.findIndex((segment) => segment === 'embed' || segment === 'shorts');
      if (embedIndex >= 0) {
        return segments[embedIndex + 1] || '';
      }
    }
  } catch {
    return '';
  }

  return '';
}

export function Homepage() {
  const content = useMarketingHomeContent();
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const reducedMotion = useReducedMotion();
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [activeCapability, setActiveCapability] = useState(content.capabilities.tabs[0]?.id ?? '');
  const [pricingLane, setPricingLane] = useState<'professional' | 'enterprise'>('professional');
  const heroPrimaryCta = content.hero.ctas.find((c) => c.type === 'primary');
  const heroSecondaryCta = content.hero.ctas.find((c) => c.type === 'secondary');

  const capability = useMemo(
    () => content.capabilities.tabs.find((t) => t.id === activeCapability) ?? content.capabilities.tabs[0],
    [activeCapability, content.capabilities.tabs]
  );
  const proofItems = useMemo(() => splitProofLine(content.hero.proofLine), [content.hero.proofLine]);
  const demoVideoId = useMemo(
    () => extractYouTubeId(process.env.NEXT_PUBLIC_MARKETING_DEMO_URL),
    []
  );
  const demoEmbedUrl = demoVideoId
    ? `https://www.youtube-nocookie.com/embed/${demoVideoId}?autoplay=1&rel=0&modestbranding=1`
    : '';
  const pricingTabs = useMemo(
    () => [
      { id: 'professional', label: content.pricing.toggleLabels[0] },
      { id: 'enterprise', label: content.pricing.toggleLabels[1] },
    ],
    [content.pricing.toggleLabels]
  );
  const pricingCards = pricingLane === 'professional' ? content.pricing.professional : content.pricing.enterprise;
  const spotlightCards = useMemo(() => {
    const defs = [
      {
        id: 'bilingual',
        icon: Languages,
      },
      {
        id: 'conflicts',
        icon: TriangleAlert,
      },
      {
        id: 'packs',
        icon: FileText,
      },
    ];

    return defs.map((def, index) => {
      const tab = content.capabilities.tabs.find((item) => item.id === def.id);
      return {
        id: def.id,
        icon: def.icon,
        title: tab?.label ?? content.stats.items[index]?.value ?? '',
        body: tab?.bullets[0] ?? content.stats.items[index]?.label ?? '',
      };
    });
  }, [content.capabilities.tabs, content.stats.items]);
  const proofIcons = [ShieldCheck, Languages, Scale];

  return (
    <div
      data-theme="scholar-dark"
      className="relative isolate min-h-screen overflow-x-hidden bg-[color:var(--bg)] font-[family:var(--font-inter)]"
    >
      <div className="grid-bg" />
      <Nav content={content} />

      <main className="relative z-10 pt-[78px]">
        <Section className="pt-8 sm:pt-12 lg:pt-16">
          <div className="relative overflow-hidden rounded-[40px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(22,35,28,0.98),rgba(14,23,18,0.98))] px-6 py-8 shadow-[0_28px_90px_rgba(3,10,7,0.3)] sm:px-8 sm:py-10 lg:px-12 lg:py-14">
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_30%),linear-gradient(180deg,rgba(7,12,10,0.08),rgba(7,12,10,0.28))]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(45,136,120,0.08),transparent_24%),radial-gradient(circle_at_82%_18%,rgba(201,151,62,0.12),transparent_22%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.04),transparent_24%)]" />
              <div
                className={cn(
                  'absolute top-[12%] h-[420px] w-[420px] rounded-full bg-[rgba(201,151,62,0.07)] blur-3xl',
                  isRtl ? 'left-[-110px]' : 'right-[-110px]'
                )}
              />
              <div
                className={cn(
                  'absolute bottom-[-120px] h-[320px] w-[320px] rounded-full bg-[rgba(45,136,120,0.1)] blur-3xl',
                  isRtl ? 'right-[-110px]' : 'left-[-110px]'
                )}
              />
            </div>
            <div
              className={cn(
                "relative z-10 grid gap-10",
                isRtl
                  ? "xl:grid-cols-[minmax(0,0.82fr),minmax(440px,1.18fr)] xl:items-center"
                  : "lg:grid-cols-[minmax(0,0.9fr),minmax(380px,1.1fr)] lg:items-center"
              )}
            >
              <Reveal className={cn(isRtl && 'lg:order-2')}>
                <div className="text-[11px] tracking-[0.22em] uppercase text-text-soft">
                  {content.ui.mentalModelLine}
                </div>
                <h1 className="mt-5 max-w-[11ch] text-5xl font-[family:var(--font-source-serif)] font-bold leading-[0.96] tracking-[-0.045em] text-text sm:max-w-[13ch] sm:text-6xl lg:max-w-[10ch] lg:text-[4.6rem] xl:text-[5.2rem]">
                  {content.hero.headline}
                </h1>
                <p className="mt-6 max-w-[34rem] text-base leading-8 text-text-soft sm:text-lg sm:leading-8">
                  {content.hero.subhead}
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <PrimaryLinkButton
                    href={heroPrimaryCta?.href ?? content.nav.actions.primaryCta.href}
                    onClick={() =>
                      trackPrimaryCtaClick(
                        'hero',
                        heroPrimaryCta?.href ?? content.nav.actions.primaryCta.href
                      )
                    }
                  >
                    {heroPrimaryCta?.label ?? content.nav.actions.primaryCta.label}
                  </PrimaryLinkButton>
                  {demoVideoId ? (
                    <SecondaryButton
                      onClick={() => {
                        trackMarketingEvent('cta_watch_demo_click');
                        setIsDemoOpen(true);
                      }}
                    >
                      <PlayCircle className="h-4 w-4" />
                      {content.ui.modal.openDemoLabel}
                    </SecondaryButton>
                  ) : (
                    <Link
                      href={heroSecondaryCta?.href ?? '#decision-pack'}
                      className={cn(
                        'inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[var(--rSm)] border border-border px-5 py-2.5 font-semibold text-text transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                        'hover:border-highlight hover:text-highlight',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                      )}
                    >
                      {heroSecondaryCta?.label}
                      <ArrowRight className={cn('h-4 w-4', isRtl && 'rtl-flip')} />
                    </Link>
                  )}
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {proofItems.map((item, index) => {
                    const Icon = proofIcons[index] ?? ShieldCheck;
                    return (
                      <div
                        key={item}
                        className="rounded-[22px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] text-accent">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="text-sm leading-6 text-text-soft">{item}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Reveal>

              <Reveal delayMs={100} className={cn(isRtl && 'lg:order-1')}>
                <HeroVisualScene content={content} isRtl={isRtl} reducedMotion={reducedMotion} />
              </Reveal>
            </div>
          </div>

          <Reveal className="mt-6" delayMs={150}>
            <div className="rounded-[28px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-5 py-5 shadow-[var(--shadowSm)] sm:px-6">
              <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
                {content.credibilityStrip.label}
              </div>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {content.credibilityStrip.items.map((item) => (
                  <div
                    key={item}
                    className="rounded-[var(--rPill)] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] px-4 py-2 text-sm text-text-soft"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </Section>

        <Section>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {content.stats.items.map((item, idx) => (
              <Reveal key={item.value} delayMs={idx * 70}>
                <StatCard value={item.value} label={item.label} />
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-4 max-w-[70ch] text-sm text-text-soft" delayMs={140}>
            {content.stats.footnote}
          </Reveal>
        </Section>

        <Section id="product">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.78fr),minmax(320px,0.92fr)] lg:items-start">
            <Reveal>
              <div className="max-w-[44rem]">
                <h2 className="text-3xl font-[family:var(--font-source-serif)] font-semibold tracking-tight text-text sm:text-4xl">
                  {content.problem.title}
                </h2>
                <div className="mt-5 space-y-4 text-base leading-8 text-text-soft sm:text-lg">
                  {content.problem.body.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delayMs={100}>
              <div className="rounded-[32px] border border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-6 shadow-[var(--shadowSm)]">
                <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
                  {content.problem.sideCard.title}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-[rgba(212,107,85,0.28)] bg-[rgba(212,107,85,0.07)] p-5">
                    <div className="text-sm font-semibold text-text">{content.ui.beforeLabel}</div>
                    <ul className="mt-3 space-y-3 text-sm leading-6 text-text-soft">
                      {content.problem.sideCard.before.map((b) => (
                        <li key={b} className="flex gap-2">
                          <span className="text-[#d46b55]">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-[24px] border border-[rgba(59,164,106,0.28)] bg-[rgba(59,164,106,0.07)] p-5">
                    <div className="text-sm font-semibold text-text">{content.ui.afterLabel}</div>
                    <ul className="mt-3 space-y-3 text-sm leading-6 text-text-soft">
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

          <div className="mt-12">
            <Reveal>
              <h3 className="text-2xl font-[family:var(--font-source-serif)] font-semibold tracking-tight text-text sm:text-3xl">
                {content.applications.title}
              </h3>
            </Reveal>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {content.applications.cards.map((card, index) => (
                <Reveal key={card.id} delayMs={index * 80}>
                  <Card
                    brandLabel={content.brand.name}
                    title={card.title}
                    subtitle={card.subtitle}
                    bullets={card.bullets}
                    footer={
                      <TertiaryLink href={card.cta.href}>
                        {card.cta.label}
                        <ArrowRight className={cn('h-4 w-4', isRtl && 'rtl-flip')} />
                      </TertiaryLink>
                    }
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </Section>

        <Section id="how">
          <Reveal>
            <div className="max-w-[44rem]">
              <h2 className="text-3xl font-[family:var(--font-source-serif)] font-semibold tracking-tight text-text sm:text-4xl">
                {content.howItWorks.title}
              </h2>
              <p className="mt-4 text-base leading-8 text-text-soft sm:text-lg">
                {content.howItWorks.subhead}
              </p>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {content.howItWorks.steps.map((step, idx) => (
              <Reveal key={step.title} delayMs={idx * 90}>
                <div className="group h-full rounded-[28px] border border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-6 shadow-[var(--shadowSm)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--accent-alt)] bg-[rgba(201,151,62,0.08)] text-base font-semibold text-accent">
                      {idx + 1}
                    </span>
                    <div className="h-px flex-1 bg-[linear-gradient(90deg,rgba(243,207,122,0.28),rgba(243,207,122,0))]" />
                  </div>
                  <h3 className="mt-6 text-2xl font-[family:var(--font-source-serif)] font-semibold text-text">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-text-soft sm:text-base">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-8 flex flex-col gap-3 sm:flex-row" delayMs={120}>
            <TertiaryLink href={content.howItWorks.ctas[0]?.href ?? '#decision-pack'}>
              {content.howItWorks.ctas[0]?.label}
              <ArrowRight className={cn('h-4 w-4', isRtl && 'rtl-flip')} />
            </TertiaryLink>
            <Link
              href={content.howItWorks.ctas[1]?.href ?? '#security'}
              className={cn(
                'inline-flex min-h-[44px] items-center justify-center rounded-[var(--rSm)] border border-border bg-transparent px-5 py-2.5 font-semibold text-text transition-colors duration-200',
                'hover:border-highlight hover:text-highlight',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
              )}
            >
              {content.howItWorks.ctas[1]?.label}
            </Link>
          </Reveal>
        </Section>

        <Section id="playbooks">
          <Reveal>
            <h2 className="text-3xl font-[family:var(--font-source-serif)] font-semibold tracking-tight text-text sm:text-4xl">
              {content.capabilities.title}
            </h2>
          </Reveal>

          <Reveal className="mt-6" delayMs={70}>
            <div className="grid gap-4 lg:grid-cols-3">
              {spotlightCards.slice(0, 3).map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] text-accent">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="mt-4 text-lg font-[family:var(--font-source-serif)] font-semibold text-text">
                      {item.title}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-soft">{item.body}</p>
                  </div>
                );
              })}
            </div>
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

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.92fr),minmax(300px,0.74fr)] lg:items-start">
            <Reveal delayMs={90}>
              <div className="rounded-[32px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-7 shadow-[var(--shadowSm)]">
                <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
                  {capability?.label}
                </div>
                <h3 className="mt-3 max-w-[18ch] text-3xl font-[family:var(--font-source-serif)] font-semibold text-text">
                  {capability?.title}
                </h3>
                <ul className="mt-6 space-y-4 text-base leading-8 text-text-soft">
                  {(capability?.bullets ?? []).map((b) => (
                    <li key={b} className="flex gap-3">
                      <span className="mt-[2px] text-highlight">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delayMs={160}>
              <CapabilityPreviewCard />
            </Reveal>
          </div>
        </Section>

        <Section id={content.decisionPack.id}>
          <div className="grid gap-8 xl:grid-cols-[minmax(0,0.82fr),minmax(320px,0.96fr)] xl:items-start">
            <Reveal>
              <div className="max-w-[42rem]">
                <h2 className="text-3xl font-[family:var(--font-source-serif)] font-semibold tracking-tight text-text sm:text-4xl">
                  {content.decisionPack.title}
                </h2>
                <ul className="mt-5 space-y-3 text-base leading-8 text-text-soft sm:text-lg">
                  {content.decisionPack.bullets.map((b) => (
                    <li key={b} className="flex gap-3">
                      <span className="mt-[2px] text-highlight">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {content.decisionPack.exportButtons.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={cn(
                        'min-h-[44px] rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-sm font-semibold text-text',
                        'hover:border-highlight hover:text-highlight transition-colors duration-200',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                      )}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delayMs={100}>
              <DecisionPackMock />
            </Reveal>
          </div>

          <Reveal className="mt-6" delayMs={140}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {content.ui.decisionPackPreview.deliverables.map((label) => (
                <div
                  key={label}
                  className="rounded-[22px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5"
                >
                  <div className="text-[11px] tracking-[0.16em] uppercase text-text-soft">
                    {content.ui.decisionPackPreview.deliverablesLabel}
                  </div>
                  <div className="mt-3 text-lg font-[family:var(--font-source-serif)] font-semibold text-text">
                    {label}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-text-soft">
                    {content.ui.decisionPackPreview.deliverablesBody}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </Section>

        <Section id={content.security.id}>
          <Reveal>
            <div className="max-w-[44rem]">
              <h2 className="text-3xl font-[family:var(--font-source-serif)] font-semibold tracking-tight text-text sm:text-4xl">
                {content.security.title}
              </h2>
            </div>
          </Reveal>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <Reveal delayMs={90}>
              <Card
                brandLabel={content.brand.name}
                title={content.ui.security.buyersCareTitle}
                bullets={content.security.leftBullets}
              />
            </Reveal>
            <Reveal delayMs={160}>
              <Card
                brandLabel={content.brand.name}
                title={content.security.rightCard.title}
                bullets={content.security.rightCard.bullets}
              />
            </Reveal>
          </div>
        </Section>

        <Section id={content.pricing.id}>
          <Reveal>
            <div className="max-w-[38rem]">
              <h2 className="text-3xl font-[family:var(--font-source-serif)] font-semibold tracking-tight text-text sm:text-4xl">
                {content.pricing.title}
              </h2>
            </div>
          </Reveal>

          <Reveal className="mt-8" delayMs={90}>
            <PillTabs
              tabs={pricingTabs}
              activeId={pricingLane}
              onChange={(id) => {
                setPricingLane(id as 'professional' | 'enterprise');
                trackMarketingEvent('pricing_toggle_change', { pricing_lane: id });
              }}
            />
          </Reveal>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {pricingCards.map((p, index) => (
              <Reveal key={p.id} delayMs={index * 80}>
                <div
                  className={cn(
                    'flex h-full flex-col rounded-[34px] border p-7 shadow-[var(--shadowMd)]',
                    index === 0
                      ? 'border-[color:rgba(201,151,62,0.28)] bg-[linear-gradient(180deg,rgba(22,35,28,0.97),rgba(16,27,21,0.99))]'
                      : 'border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))]'
                  )}
                >
                  <div className="text-[11px] tracking-[0.18em] uppercase text-accent">
                    {pricingLane === 'professional'
                      ? content.pricing.toggleLabels[0]
                      : content.pricing.toggleLabels[1]}
                  </div>
                  <div className="mt-4 flex items-baseline justify-between gap-4">
                    <div className="text-2xl font-[family:var(--font-source-serif)] font-semibold text-text">
                      {p.name}
                    </div>
                    <div className="text-base text-text-soft">{p.price}</div>
                  </div>
                  <ul className="mt-5 space-y-3 text-sm leading-6 text-text-soft">
                    {p.bullets.map((b) => (
                      <li key={b} className="flex gap-2">
                        <span className="mt-[2px] text-highlight">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-6">
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
            ))}
          </div>

          <Reveal className="mt-6" delayMs={120}>
            <div className="rounded-[24px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-6">
              <div className="text-sm font-semibold text-text">{content.pricing.usageMeter.title}</div>
              <div className="mt-2 text-sm leading-7 text-text-soft">{content.pricing.usageMeter.body}</div>
            </div>
          </Reveal>
        </Section>

        <Section>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.72fr),minmax(320px,1fr)] lg:items-start">
            <Reveal>
              <h2 className="text-3xl font-[family:var(--font-source-serif)] font-semibold tracking-tight text-text sm:text-4xl">
                {content.faq.title}
              </h2>
              <p className="mt-4 max-w-[34rem] text-base leading-8 text-text-soft sm:text-lg">
                {content.faq.intro}
              </p>
            </Reveal>
            <Reveal delayMs={90}>
              <Accordion
                items={content.faq.items}
                onOpen={(id) => trackMarketingEvent('faq_open', { question_id: id })}
              />
              <div className="mt-6 rounded-[28px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-6">
                <div className="text-text-soft">{content.faq.contactRow.note}</div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={content.faq.contactRow.ctas[0]?.href ?? '/support'}
                    onClick={() => trackMarketingEvent('contact_click')}
                    className={cn(
                      'inline-flex min-h-[44px] items-center justify-center rounded-[var(--rSm)] border border-border bg-transparent px-5 py-2.5 font-semibold text-text transition-colors duration-200',
                      'hover:border-highlight hover:text-highlight',
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

        <Section className="pt-0">
          <Reveal>
            <div className="rounded-[38px] border border-[color:rgba(201,151,62,0.22)] bg-[radial-gradient(circle_at_top_right,rgba(201,151,62,0.14),transparent_26%),linear-gradient(135deg,rgba(27,43,36,0.97),rgba(16,26,21,0.99))] p-8 shadow-[var(--shadowSm)] sm:p-10 lg:p-14">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr),minmax(280px,0.7fr)] lg:items-center">
                <div>
                  <h2 className="text-3xl font-[family:var(--font-source-serif)] font-semibold tracking-tight text-text sm:text-4xl">
                    {content.finalCta.title}
                  </h2>
                  <p className="mt-4 max-w-[34rem] text-base leading-8 text-text-soft sm:text-lg">
                    {content.finalCta.subhead}
                  </p>
                  <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                    <PrimaryLinkButton
                      href={content.finalCta.ctas[0]?.href ?? content.nav.actions.primaryCta.href}
                      onClick={() =>
                        trackPrimaryCtaClick(
                          'final',
                          content.finalCta.ctas[0]?.href ?? content.nav.actions.primaryCta.href
                        )
                      }
                    >
                      {content.finalCta.ctas[0]?.label ?? content.nav.actions.primaryCta.label}
                    </PrimaryLinkButton>
                    <Link
                      href={content.finalCta.ctas[1]?.href ?? '/support'}
                      onClick={() => trackMarketingEvent('contact_click')}
                      className={cn(
                        'inline-flex min-h-[44px] items-center justify-center rounded-[var(--rSm)] border border-border bg-transparent px-5 py-2.5 font-semibold text-text transition-colors duration-200',
                        'hover:border-highlight hover:text-highlight',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2'
                      )}
                    >
                      {content.finalCta.ctas[1]?.label}
                    </Link>
                  </div>
                </div>
                <div className="rounded-[28px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-6">
                  <div className="text-[11px] tracking-[0.18em] uppercase text-text-soft">
                    {content.ui.finalCta.previewLabel}
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="h-10 rounded-[14px] bg-[rgba(255,255,255,0.08)]" />
                    <div className="h-10 rounded-[14px] bg-[rgba(255,255,255,0.08)]" />
                    <div className="h-10 rounded-[14px] border border-[color:var(--highlight)] bg-[rgba(243,207,122,0.16)]" />
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </Section>

        {/* Footer */}
        <footer className="border-t border-border bg-[rgba(0,0,0,0.08)]">
          <div className="max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-[72px] py-14">
            <div className="grid gap-10 lg:grid-cols-[2fr,10fr]">
              <div>
                <div className="text-3xl font-[family:var(--font-source-serif)] font-semibold text-text">
                  {content.brand.name}
                </div>
                <div className="mt-2 text-text-soft">{content.brand.tagline}</div>
              </div>
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                {content.footer.columns.map((col) => (
                  <div key={col.title}>
                    <div className="text-xs tracking-[0.14em] uppercase text-text-soft">{col.title}</div>
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
              <div>© {new Date().getFullYear()} Watd Information Technology Company</div>
              <div>{content.footer.legalNote}</div>
            </div>
          </div>
        </footer>
      </main>
      {demoVideoId ? (
        <MarketingModal
          isOpen={isDemoOpen}
          title={content.ui.modal.demoTitle}
          closeAriaLabel={content.ui.modal.close}
          onClose={() => setIsDemoOpen(false)}
        >
          <div className="grid gap-6 lg:grid-cols-[1.45fr,0.55fr]">
            <div className="overflow-hidden rounded-[24px] border border-border bg-black shadow-[var(--shadowSm)]">
              {isDemoOpen ? (
                <div className="aspect-video">
                  <iframe
                    src={demoEmbedUrl}
                    title={content.ui.modal.demoTitle}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              ) : null}
            </div>
            <div className="rounded-[24px] border border-border bg-[rgba(255,255,255,0.02)] p-5">
              <div className="text-xs tracking-[0.14em] uppercase text-text-soft">
                {content.ui.modal.demoShowsLabel}
              </div>
              <div className="mt-3 text-base leading-relaxed text-text-soft">
                {content.ui.modal.demoShowsBody}
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <PrimaryLinkButton
                  href={content.nav.actions.primaryCta.href}
                  onClick={() => trackMarketingEvent('cta_start_free_click', { location: 'demo_modal' })}
                >
                  {content.nav.actions.primaryCta.label}
                </PrimaryLinkButton>
                <SecondaryButton onClick={() => setIsDemoOpen(false)}>
                  {content.ui.modal.close}
                </SecondaryButton>
              </div>
            </div>
          </div>
        </MarketingModal>
      ) : null}
    </div>
  );
}
