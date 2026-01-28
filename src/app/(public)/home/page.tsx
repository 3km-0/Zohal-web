import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Homepage } from '@/components/marketing/homepage/Homepage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketingHome');
  const title = t('metadata.title');
  const description = t('metadata.description');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: ['/icon.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function HomePage() {
  return <Homepage />;
}

