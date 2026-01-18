'use client';

import { useEffect } from 'react';

/**
 * Minimal page for handling MSAL popup redirect.
 * This page should load quickly and let MSAL close the popup.
 */
export default function MicrosoftPopupCallback() {
  useEffect(() => {
    // MSAL will handle the response via the MsalProvider in layout
    // This page just needs to exist and load quickly
    console.log('[MSAL Popup] Callback page loaded, MSAL will handle response');
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-soft">Completing sign-in...</p>
      </div>
    </div>
  );
}
