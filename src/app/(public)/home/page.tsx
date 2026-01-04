import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { IconBox } from '@/components/ui';

export async function generateMetadata() {
  const t = await getTranslations('landing.hero');
  return {
    title: `${t('title')} - AI STEM Notebook`,
    description: t('subtitle'),
  };
}

// Feature card component
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-scholar p-6 text-center">
      <div className="w-14 h-14 bg-surface-alt border border-border rounded-scholar-lg flex items-center justify-center text-2xl mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-text mb-2">{title}</h3>
      <p className="text-text-soft">{description}</p>
    </div>
  );
}

// Link card component
function LinkCard({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-5 bg-surface border border-border rounded-scholar transition-all duration-200 hover:-translate-y-0.5 hover:border-accent"
    >
      <div className="w-11 h-11 bg-surface-alt rounded-scholar-lg flex items-center justify-center text-xl">
        {icon}
      </div>
      <span className="font-semibold text-text">{label}</span>
    </Link>
  );
}

export default function HomePage() {
  const t = useTranslations('landing');
  const nav = useTranslations('nav');

  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-12">
      {/* Hero Section */}
      <section className="text-center py-20">
        <IconBox size="xl" variant="muted" className="mx-auto mb-8 shadow-scholar">
          📚
        </IconBox>

        <h1 className="text-4xl md:text-5xl font-bold text-text tracking-tight mb-5">
          {t('hero.title')}
        </h1>

        <p className="text-xl text-text-soft max-w-xl mx-auto mb-10 leading-relaxed">
          {t('hero.subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="https://apps.apple.com/app/id6756722186"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-accent text-white font-semibold rounded-scholar transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5"
          >
            {t('hero.downloadApp')}
          </a>
          <Link
            href="/support"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-surface border border-border text-text font-semibold rounded-scholar transition-all duration-200 hover:border-accent hover:text-accent"
          >
            {t('hero.getSupport')}
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12">
        <h2 className="text-2xl font-semibold text-text text-center mb-10">
          {t('features.title')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FeatureCard
            icon="📄"
            title={t('features.pdfReader.title')}
            description={t('features.pdfReader.description')}
          />
          <FeatureCard
            icon="✏️"
            title={t('features.handwrittenNotes.title')}
            description={t('features.handwrittenNotes.description')}
          />
          <FeatureCard
            icon="🤖"
            title={t('features.aiExplanations.title')}
            description={t('features.aiExplanations.description')}
          />
          <FeatureCard
            icon="📊"
            title={t('features.stemTools.title')}
            description={t('features.stemTools.description')}
          />
        </div>
      </section>

      {/* Links Section */}
      <section className="py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LinkCard href="/terms" icon="📜" label="Terms of Use (EULA)" />
          <LinkCard href="/privacy" icon="🔒" label="Privacy Policy" />
          <LinkCard href="/support" icon="💬" label="Support & FAQ" />
          <LinkCard href="mailto:support@zohal.app" icon="📧" label="Contact Us" />
        </div>
      </section>
    </div>
  );
}

