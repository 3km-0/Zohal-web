import type { Metadata } from 'next';
import { Source_Serif_4, Inter, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Zohal - AI STEM Notebook',
  description:
    'The AI STEM notebook for students and engineers. Read PDFs, write by hand, and get intelligent explanations in the margin.',
  keywords: ['AI', 'STEM', 'notebook', 'PDF', 'education', 'math', 'science'],
  authors: [{ name: 'Zohal' }],
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'Zohal - AI STEM Notebook',
    description:
      'The AI STEM notebook for students and engineers. Read PDFs, write by hand, and get intelligent explanations in the margin.',
    url: 'https://zohal.ai',
    siteName: 'Zohal',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zohal - AI STEM Notebook',
    description:
      'The AI STEM notebook for students and engineers. Read PDFs, write by hand, and get intelligent explanations in the margin.',
  },
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
      className={`${sourceSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

