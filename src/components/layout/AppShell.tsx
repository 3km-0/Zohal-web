'use client';

import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className={cn('flex-1 flex flex-col overflow-hidden', className)}>
        {children}
      </main>
    </div>
  );
}

