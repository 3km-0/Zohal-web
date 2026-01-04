import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Simple header */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <Link
          href="/"
          className="text-2xl font-bold text-accent tracking-tight hover:opacity-80 transition-opacity"
        >
          Zohal
        </Link>
      </header>

      {/* Auth content */}
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        {children}
      </main>
    </div>
  );
}

