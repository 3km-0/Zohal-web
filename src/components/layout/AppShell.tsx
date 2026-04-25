'use client';

import { useCallback, useMemo, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';
import { TourManager } from '@/components/tour';
import { AppShellProvider } from './AppShellContext';

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const openMobileSidebar = useCallback(() => setMobileSidebarOpen(true), []);
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  const appShellValue = useMemo(
    () => ({
      openMobileSidebar,
      closeMobileSidebar,
      mobileSidebarOpen,
    }),
    [closeMobileSidebar, mobileSidebarOpen, openMobileSidebar]
  );

  const handleErrorAction = (action: 'retry' | 'sign-in' | 'upgrade' | 'dismiss' | undefined) => {
    switch (action) {
      case 'sign-in':
        router.push('/auth/login');
        break;
      case 'upgrade':
        router.push('/subscription');
        break;
      // retry/dismiss handled by caller or toast auto-dismiss
    }
  };

  const isWorkspaceDetailShell = /^\/workspaces\/[^/]+/.test(pathname) && !pathname.startsWith('/workspaces/folders');

  return (
    <div className="relative h-[100dvh] min-h-[100dvh] bg-background overflow-hidden">
      <div className="grid-bg" aria-hidden="true" />
      <AppShellProvider value={appShellValue}>
        <div className="relative z-10 flex h-full min-w-0">
          <div
            className={cn(
              'fixed inset-0 z-30 bg-black/40 transition-opacity md:hidden',
              mobileSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
            onClick={closeMobileSidebar}
            aria-hidden="true"
          />
          {isWorkspaceDetailShell ? null : <Sidebar mobileOpen={mobileSidebarOpen} onClose={closeMobileSidebar} />}
          <main className={cn('flex min-w-0 flex-1 flex-col overflow-hidden', className)}>
            {children}
          </main>
          <TourManager />
          <Toast onAction={handleErrorAction} />
        </div>
      </AppShellProvider>
    </div>
  );
}
