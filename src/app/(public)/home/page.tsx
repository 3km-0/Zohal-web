import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Homepage } from '@/components/marketing/homepage/Homepage';
import { absoluteUrl } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketingHome');
  const title = t('metadata.title');
  const description = t('metadata.description');

  return {
    title,
    description,
    alternates: {
      canonical: absoluteUrl('/home'),
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: absoluteUrl('/home'),
      images: [absoluteUrl('/icon.png')],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [absoluteUrl('/icon.png')],
    },
  };
}

export default async function HomePage() {
  const t = await getTranslations('marketingHome');
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': absoluteUrl('/home#organization'),
        name: 'Zohal',
        url: absoluteUrl('/home'),
        logo: absoluteUrl('/icon.png'),
      },
      {
        '@type': 'WebSite',
        '@id': absoluteUrl('/home#website'),
        name: 'Zohal',
        url: absoluteUrl('/home'),
        description: t('metadata.description'),
        publisher: {
          '@id': absoluteUrl('/home#organization'),
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': absoluteUrl('/home#application'),
        name: 'Zohal',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: t('metadata.description'),
        offers: [
          {
            '@type': 'Offer',
            price: '299',
            priceCurrency: 'SAR',
            name: 'Zohal Core',
            url: absoluteUrl('/subscription'),
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <Homepage />
    </>
  );
}
