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
      data-theme="slate-light"
      className="website-shell relative min-h-screen bg-[radial-gradient(circle_at_top,rgba(13,148,136,0.05),transparent_32%),linear-gradient(180deg,#ffffff,#fafaf9)] text-[color:var(--text)]"
    >
      <Header />
      <main className="relative z-10 min-h-screen">{children}</main>
      <Footer />
    </div>
  );
}
