/**
 * Microsoft OneDrive OAuth and API Client for Web
 *
 * Uses MSAL.js for OAuth 2.0 authentication
 * and Microsoft Graph API for file browsing and selection.
 */

import type { PublicClientApplication as MSALClient } from '@azure/msal-browser';

// Microsoft OAuth configuration
const MICROSOFT_CLIENT_ID = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID || '';
const MICROSOFT_SCOPES = [
  'Files.Read',
  'Files.Read.All',
  'User.Read',
];

export interface OneDriveFile {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl?: string;
  file?: {
    mimeType: string;
  };
  folder?: {
    childCount: number;
  };
  parentReference?: {
    id: string;
    path: string;
  };
}

export interface OneDriveFolder {
  id: string;
  name: string;
}

// Store the access token in memory
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;
let msalInstance: MSALClient | null = null;

/**
 * Check if we have a valid access token
 */
export function hasValidToken(): boolean {
  if (!cachedAccessToken || !tokenExpiresAt) return false;
  // Token is valid if it expires more than 5 minutes from now
  return Date.now() < tokenExpiresAt - 5 * 60 * 1000;
}

/**
 * Get the current access token if valid
 */
export function getAccessToken(): string | null {
  if (hasValidToken()) {
    return cachedAccessToken;
  }
  return null;
}

/**
 * Get or create MSAL instance
 */
async function getMsalInstance(): Promise<MSALClient> {
  if (msalInstance) return msalInstance;

  const { PublicClientApplication } = await import('@azure/msal-browser');

  const msalConfig = {
    auth: {
      clientId: MICROSOFT_CLIENT_ID,
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    },
    cache: {
      cacheLocation: 'sessionStorage' as const,
      storeAuthStateInCookie: false,
    },
  };

  msalInstance = new PublicClientApplication(msalConfig);
  await msalInstance.initialize();

  // Handle redirect response
  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response) {
      cachedAccessToken = response.accessToken;
      tokenExpiresAt = response.expiresOn?.getTime() || Date.now() + 3600000;
      console.log('[OneDrive] Token acquired from redirect');
    }
  } catch (err) {
    console.error('[OneDrive] Redirect handling error:', err);
  }

  return msalInstance;
}

/**
 * Initialize MSAL and handle any pending redirect
 * Call this on app load to complete the auth flow
 */
export async function initOneDriveAuth(): Promise<string | null> {
  if (!MICROSOFT_CLIENT_ID) return null;
  
  const instance = await getMsalInstance();
  
  // Check if we have a cached token
  if (hasValidToken() && cachedAccessToken) {
    return cachedAccessToken;
  }

  // Try silent token acquisition
  const accounts = instance.getAllAccounts();
  if (accounts.length > 0) {
    try {
      const silentResult = await instance.acquireTokenSilent({
        scopes: MICROSOFT_SCOPES,
        account: accounts[0],
      });
      cachedAccessToken = silentResult.accessToken;
      tokenExpiresAt = silentResult.expiresOn?.getTime() || Date.now() + 3600000;
      return silentResult.accessToken;
    } catch {
      // Silent failed, need interactive
    }
  }

  return null;
}

/**
 * Start the authentication flow using redirect
 */
export async function authenticateWithMicrosoft(): Promise<void> {
  if (!MICROSOFT_CLIENT_ID) {
    throw new Error('Microsoft Client ID not configured');
  }

  // Check if we already have a valid token
  if (hasValidToken() && cachedAccessToken) {
    return;
  }

  const instance = await getMsalInstance();

  // Try silent first
  const accounts = instance.getAllAccounts();
  if (accounts.length > 0) {
    try {
      const silentResult = await instance.acquireTokenSilent({
        scopes: MICROSOFT_SCOPES,
        account: accounts[0],
      });
      cachedAccessToken = silentResult.accessToken;
      tokenExpiresAt = silentResult.expiresOn?.getTime() || Date.now() + 3600000;
      return;
    } catch {
      // Silent failed, need redirect
    }
  }

  // Store state to resume after redirect
  sessionStorage.setItem('onedrive_pending', 'true');

  // Redirect to Microsoft login
  await instance.acquireTokenRedirect({
    scopes: MICROSOFT_SCOPES,
  });
}

/**
 * Check if there's a pending OneDrive auth flow
 */
export function hasPendingAuth(): boolean {
  return sessionStorage.getItem('onedrive_pending') === 'true';
}

/**
 * Clear pending auth state
 */
export function clearPendingAuth(): void {
  sessionStorage.removeItem('onedrive_pending');
}

/**
 * Sign out and clear the cached token
 */
export function signOutFromMicrosoft(): void {
  cachedAccessToken = null;
  tokenExpiresAt = null;
  // Note: Full sign out would require MSAL instance, but for simplicity
  // we just clear the cached token
}

/**
 * List files in OneDrive
 */
export async function listOneDriveFiles(
  accessToken: string,
  folderId: string = 'root',
  skipToken?: string
): Promise<{
  files: OneDriveFile[];
  nextLink?: string;
}> {
  let url: string;
  
  if (folderId === 'root') {
    url = 'https://graph.microsoft.com/v1.0/me/drive/root/children?$top=50&$orderby=name';
  } else {
    url = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?$top=50&$orderby=name`;
  }

  if (skipToken) {
    url = skipToken; // Use the full nextLink URL
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to list files');
  }

  const data = await response.json();
  return {
    files: data.value || [],
    nextLink: data['@odata.nextLink'],
  };
}

/**
 * Get file metadata by ID
 */
export async function getOneDriveFile(
  accessToken: string,
  fileId: string
): Promise<OneDriveFile> {
  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to get file');
  }

  return response.json();
}

/**
 * Get the folder path (breadcrumbs)
 */
export async function getFolderPath(
  accessToken: string,
  folderId: string
): Promise<OneDriveFolder[]> {
  const path: OneDriveFolder[] = [];
  let currentId = folderId;

  while (currentId && currentId !== 'root') {
    try {
      const file = await getOneDriveFile(accessToken, currentId);
      path.unshift({ id: file.id, name: file.name });
      currentId = file.parentReference?.id || '';
    } catch {
      break;
    }
  }

  // Add root at the beginning
  path.unshift({ id: 'root', name: 'OneDrive' });

  return path;
}

/**
 * Check if a file is a PDF
 */
export function isPdfFile(file: OneDriveFile): boolean {
  return file.file?.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Check if a file is a folder
 */
export function isFolder(file: OneDriveFile): boolean {
  return !!file.folder;
}

/**
 * Check if OneDrive integration is configured
 */
export function isOneDriveConfigured(): boolean {
  return !!MICROSOFT_CLIENT_ID;
}
