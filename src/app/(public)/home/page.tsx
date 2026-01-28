import type { Metadata } from 'next';
import homepageContent from '@/content/homepage.scholar-neutral.json';
import { Homepage } from '@/components/marketing/homepage/Homepage';

export const metadata: Metadata = {
  title: 'Zohal — Document Workflow IDE for Regulated Work',
  description:
    'Turn messy PDFs into verified variables and decision packs you can confidently forward. Built for regulated workflows: evidence, review, and enterprise boundaries.',
  openGraph: {
    title: 'Zohal — Document Workflow IDE for Regulated Work',
    description:
      'Turn messy PDFs into verified variables and decision packs you can confidently forward. Built for regulated workflows: evidence, review, and enterprise boundaries.',
    type: 'website',
    images: ['/icon.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zohal — Document Workflow IDE for Regulated Work',
    description:
      'Turn messy PDFs into verified variables and decision packs you can confidently forward. Built for regulated workflows: evidence, review, and enterprise boundaries.',
  },
};

export default function HomePage() {
  return <Homepage content={homepageContent} />;
}

