'use client';

import { AppHeader } from '@/components/layout/AppHeader';
import { Badge, Card } from '@/components/ui';
import { Building2, ChartPie, Hammer, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function PortfolioPage() {
  const t = useTranslations('portfolioPage');

  const metrics = [
    { key: 'assets', icon: Building2 },
    { key: 'equity', icon: TrendingUp },
    { key: 'renovation', icon: Hammer },
  ] as const;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-zohal border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-zohal bg-accent/10 text-accent">
                <ChartPie className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text">{t('overviewTitle')}</h2>
                <p className="text-sm text-text-soft">{t('overviewSubtitle')}</p>
              </div>
            </div>
            <Badge variant="accent">{t('teamBadge')}</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {metrics.map(({ key, icon: Icon }) => (
              <Card key={key} padding="lg">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-zohal bg-surface-alt text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm text-text-soft">{t(`metrics.${key}.label`)}</p>
                <p className="mt-2 text-2xl font-bold text-text">{t(`metrics.${key}.value`)}</p>
                <p className="mt-2 text-sm text-text-soft">{t(`metrics.${key}.hint`)}</p>
              </Card>
            ))}
          </div>

          <Card padding="lg">
            <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
              <div>
                <h3 className="text-base font-semibold text-text">{t('timelineTitle')}</h3>
                <p className="mt-2 text-sm text-text-soft">{t('timelineSubtitle')}</p>
              </div>
              <div className="rounded-zohal border border-dashed border-border bg-surface-alt p-8 text-center">
                <p className="text-sm font-medium text-text">{t('placeholderTitle')}</p>
                <p className="mx-auto mt-2 max-w-lg text-sm text-text-soft">{t('placeholderBody')}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
