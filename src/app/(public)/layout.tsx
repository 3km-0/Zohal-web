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
    <div
      data-theme="scholar-dark"
      className="relative min-h-screen bg-[color:var(--bg)] text-[color:var(--text)]"
    >
      <div className="grid-bg" />
      <Header />
      <main className="relative z-10 min-h-screen">{children}</main>
      <Footer />
    </div>
  );
}

