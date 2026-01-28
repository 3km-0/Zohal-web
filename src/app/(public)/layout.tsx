'use client';

import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { usePathname } from 'next/navigation';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // `/home` owns its full chrome (nav + footer) per marketing spec.
  if (pathname === '/home') {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <main className="relative z-10 min-h-screen">{children}</main>
      <Footer />
    </>
  );
}

