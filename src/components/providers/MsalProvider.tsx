'use client';

import { useEffect } from 'react';
import { initMsal, isOneDriveConfigured } from '@/lib/onedrive';

/**
 * Initializes MSAL on app load to handle popup/redirect responses.
 * This ensures that when Microsoft redirects back to our app (in a popup),
 * MSAL is ready to handle the response and close the popup.
 */
export function MsalProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (isOneDriveConfigured()) {
      initMsal().catch(console.error);
    }
  }, []);

  return <>{children}</>;
}
