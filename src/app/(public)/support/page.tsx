import type { Metadata } from 'next';
import { SupportPageClient } from '@/components/support/SupportPageClient';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Contact Zohal support for billing, onboarding, workflow setup, trials, and product issues.',
  alternates: {
    canonical: absoluteUrl('/support'),
  },
};

export default function SupportPage() {
  return <SupportPageClient />;
}
