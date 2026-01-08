'use client';

import { Sidebar } from './Sidebar';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  const router = useRouter();

  const handleErrorAction = (action: 'retry' | 'sign-in' | 'upgrade' | 'dismiss' | undefined) => {
    switch (action) {
      case 'sign-in':
        router.push('/auth');
        break;
      case 'upgrade':
        router.push('/subscription');
        break;
      // retry/dismiss handled by caller or toast auto-dismiss
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className={cn('flex-1 flex flex-col overflow-hidden', className)}>
        {children}
      </main>
      <Toast onAction={handleErrorAction} />
    </div>
  );
}

