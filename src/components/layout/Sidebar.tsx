'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  House,
  FolderOpen,
  Search,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Crown,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';

interface SidebarProps {
  className?: string;
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ className, mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const tCommon = useTranslations('common');
  const t = useTranslations('nav');
  const tSidebar = useTranslations('sidebar');
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    onClose?.();
  }, [pathname, onClose]);

  // NOTE: Tasks removed from sidebar as we now use Apple Reminders integration on iOS.
  // Web users can still access /tasks page if needed, but it's hidden from main nav.
  const navItems = [
    { href: '/workspaces', label: t('workspaces'), icon: FolderOpen },
    { href: '/search', label: t('search'), icon: Search },
  ];

  const bottomItems = [
    { href: '/home', label: t('home'), icon: House },
    { href: '/subscription', label: tSidebar('subscription'), icon: Crown },
    { href: '/settings', label: t('settings'), icon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === '/workspaces') {
      return pathname === '/workspaces' || pathname.startsWith('/workspaces/');
    }
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex h-screen w-[18rem] max-w-[85vw] flex-col border-r border-border bg-surface/95 backdrop-blur-md transition-transform duration-300 md:static md:z-auto md:max-w-none md:bg-surface/80',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        collapsed ? 'md:w-16' : 'md:w-64',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <Link href="/workspaces" className="flex min-w-0 items-center gap-2">
          <Image
            src="/icon.png"
            alt="Zohal"
            width={32}
            height={32}
            className="h-8 w-8 rounded-scholar-sm"
          />
          <span className={cn('truncate text-xl font-bold text-accent', collapsed && 'md:hidden')}>
            {tCommon('appName')}
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="rounded-scholar-sm p-1.5 hover:bg-surface-alt transition-colors md:hidden"
            aria-label={tSidebar('closeMenu')}
          >
            <X className="h-5 w-5 text-text-soft" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'hidden rounded-scholar-sm p-1.5 hover:bg-surface-alt transition-colors md:inline-flex',
              collapsed && 'md:mx-auto'
            )}
            aria-label={collapsed ? tSidebar('expandSidebar') : tSidebar('collapseSidebar')}
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5 text-text-soft rtl-flip" />
            ) : (
              <ChevronLeft className="h-5 w-5 text-text-soft rtl-flip" />
            )}
          </button>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(item.href)}
            collapsed={collapsed}
            onNavigate={onClose}
          />
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="p-3 border-t border-border space-y-1">
        {bottomItems.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(item.href)}
            collapsed={collapsed}
            onNavigate={onClose}
          />
        ))}
        <button
          onClick={() => {
            onClose?.();
            signOut();
          }}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-scholar transition-colors',
            'text-text-soft hover:text-error hover:bg-error/10',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="font-medium">{tSidebar('logOut')}</span>}
        </button>
      </div>
    </aside>
  );
}

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}

function NavItem({ href, label, icon: Icon, active, collapsed, onNavigate }: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-scholar transition-colors',
        active
          ? 'bg-accent/10 text-accent border border-accent/20'
          : 'text-text-soft hover:text-text hover:bg-surface-alt',
        collapsed && 'justify-center'
      )}
      title={collapsed ? label : undefined}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span className="font-medium">{label}</span>}
    </Link>
  );
}
