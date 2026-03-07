'use client';

import { createContext, useContext } from 'react';

type AppShellContextValue = {
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  mobileSidebarOpen: boolean;
};

const noop = () => {};

const AppShellContext = createContext<AppShellContextValue>({
  openMobileSidebar: noop,
  closeMobileSidebar: noop,
  mobileSidebarOpen: false,
});

export function AppShellProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: AppShellContextValue;
}) {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  return useContext(AppShellContext);
}
