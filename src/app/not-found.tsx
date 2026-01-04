import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="relative z-10 min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          {/* 404 Illustration */}
          <div className="mb-8">
            <div className="w-32 h-32 mx-auto bg-surface border border-border rounded-scholar-xl flex items-center justify-center shadow-scholar">
              <span className="text-6xl">📄</span>
            </div>
            <div className="mt-4 text-8xl font-bold text-accent/20">404</div>
          </div>

          {/* Content */}
          <h1 className="text-3xl font-bold text-text mb-3">Page Not Found</h1>
          <p className="text-text-soft mb-8 leading-relaxed">
            Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved. 
            Let&apos;s get you back on track.
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white font-semibold rounded-scholar transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5"
            >
              Go Home
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-surface border border-border text-text font-semibold rounded-scholar transition-all duration-200 hover:border-accent hover:text-accent"
            >
              Get Help
            </Link>
          </div>

          {/* Quick Links */}
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-text-soft mb-4">Or try one of these:</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link
                href="/auth/login"
                className="px-4 py-2 bg-surface-alt border border-border rounded-scholar text-sm text-text-soft hover:text-accent hover:border-accent transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/auth/signup"
                className="px-4 py-2 bg-surface-alt border border-border rounded-scholar text-sm text-text-soft hover:text-accent hover:border-accent transition-colors"
              >
                Sign Up
              </Link>
              <Link
                href="/privacy"
                className="px-4 py-2 bg-surface-alt border border-border rounded-scholar text-sm text-text-soft hover:text-accent hover:border-accent transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="px-4 py-2 bg-surface-alt border border-border rounded-scholar text-sm text-text-soft hover:text-accent hover:border-accent transition-colors"
              >
                Terms
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

