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
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const tCommon = useTranslations('common');
  const t = useTranslations('nav');
  const tSidebar = useTranslations('sidebar');
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

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
        'flex flex-col h-screen bg-surface/80 backdrop-blur-md border-r border-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <Link href="/workspaces" className="flex items-center gap-2">
            <Image
              src="/icon.png"
              alt="Zohal"
              width={32}
              height={32}
              className="w-8 h-8 rounded-scholar-sm"
            />
            <span className="text-xl font-bold text-accent">{tCommon('appName')}</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'p-1.5 rounded-scholar-sm hover:bg-surface-alt transition-colors',
            collapsed && 'mx-auto'
          )}
          aria-label={collapsed ? tSidebar('expandSidebar') : tSidebar('collapseSidebar')}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5 text-text-soft rtl-flip" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-text-soft rtl-flip" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(item.href)}
            collapsed={collapsed}
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
          />
        ))}
        <button
          onClick={() => signOut()}
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
}

function NavItem({ href, label, icon: Icon, active, collapsed }: NavItemProps) {
  return (
    <Link
      href={href}
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
