import type { Metadata, Viewport } from 'next';
import {
  Instrument_Serif,
  JetBrains_Mono,
  Plus_Jakarta_Sans,
} from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { MsalProvider } from '@/components/providers/MsalProvider';
import { ThemeInitializer } from '@/components/providers/ThemeInitializer';
import { absoluteUrl } from '@/lib/seo';
import './globals.css';

const sourceSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-source-serif',
  display: 'swap',
});

const inter = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl('/')),
  title: {
    default: 'Zohal',
    template: '%s | Zohal',
  },
  description:
    'Zohal helps teams review contracts, invoices, and document sets with verified findings, surfaced conflicts, and page-level evidence.',
  applicationName: 'Zohal',
  keywords: [
    'document analysis',
    'document verification',
    'contract analysis',
    'evidence-based review',
    'Arabic English document review',
    'invoice verification',
  ],
  authors: [{ name: 'Zohal' }],
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
  alternates: {
    canonical: absoluteUrl('/home'),
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Zohal',
    description:
      'Verified document analysis with page-level evidence for teams that need work that stands up to review.',
    url: absoluteUrl('/home'),
    siteName: 'Zohal',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: absoluteUrl('/icon.png'),
        width: 512,
        height: 512,
        alt: 'Zohal',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zohal',
    description:
      'Verified document analysis with page-level evidence for teams that need work that stands up to review.',
    images: [absoluteUrl('/icon.png')],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html
      lang={locale}
      dir={dir}
      data-theme="dark"
      className={`${sourceSerif.variable} ${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} ${plusJakartaSans.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <MsalProvider>
            <ThemeInitializer />
            {children}
          </MsalProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
