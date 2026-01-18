/**
 * Google Drive OAuth and API Client for Web
 *
 * Uses Google Identity Services (GIS) for OAuth 2.0 authentication
 * and Google Drive API for file browsing and selection.
 */

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
].join(' ');

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  iconLink?: string;
  parents?: string[];
  webViewLink?: string;
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// Store the access token in memory
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;

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
 * Initialize Google Identity Services and request access token
 * Returns a promise that resolves with the access token
 */
export function authenticateWithGoogle(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      reject(new Error('Google Client ID not configured'));
      return;
    }

    // Check if we already have a valid token
    if (hasValidToken() && cachedAccessToken) {
      resolve(cachedAccessToken);
      return;
    }

    // Load the Google Identity Services library if not already loaded
    const script = document.getElementById('google-gsi-script');
    if (!script) {
      const gsiScript = document.createElement('script');
      gsiScript.id = 'google-gsi-script';
      gsiScript.src = 'https://accounts.google.com/gsi/client';
      gsiScript.async = true;
      gsiScript.defer = true;
      gsiScript.onload = () => initTokenClient(resolve, reject);
      gsiScript.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(gsiScript);
    } else {
      initTokenClient(resolve, reject);
    }
  });
}

function initTokenClient(
  resolve: (token: string) => void,
  reject: (error: Error) => void
) {
  // Wait for google.accounts to be available
  const checkGoogle = () => {
    if (typeof window !== 'undefined' && (window as unknown as { google?: { accounts?: { oauth2?: unknown } } }).google?.accounts?.oauth2) {
      const google = (window as unknown as { google: { accounts: { oauth2: { initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback: (error: { type: string }) => void;
      }) => { requestAccessToken: () => void } } } } }).google;
      
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: (response: TokenResponse) => {
          if (response.access_token) {
            cachedAccessToken = response.access_token;
            tokenExpiresAt = Date.now() + response.expires_in * 1000;
            resolve(response.access_token);
          } else {
            reject(new Error('No access token received'));
          }
        },
        error_callback: (error: { type: string }) => {
          reject(new Error(`Google OAuth error: ${error.type}`));
        },
      });

      tokenClient.requestAccessToken();
    } else {
      setTimeout(checkGoogle, 100);
    }
  };
  checkGoogle();
}

/**
 * Sign out and clear the cached token
 */
export function signOutFromGoogle(): void {
  if (cachedAccessToken && typeof window !== 'undefined') {
    const google = (window as unknown as { google?: { accounts?: { oauth2?: { revoke: (token: string, callback: () => void) => void } } } }).google;
    google?.accounts?.oauth2?.revoke(cachedAccessToken, () => {
      cachedAccessToken = null;
      tokenExpiresAt = null;
    });
  } else {
    cachedAccessToken = null;
    tokenExpiresAt = null;
  }
}

/**
 * List files in Google Drive
 */
export async function listDriveFiles(
  accessToken: string,
  folderId: string = 'root',
  pageToken?: string
): Promise<{
  files: GoogleDriveFile[];
  nextPageToken?: string;
}> {
  const query = `'${folderId}' in parents and trashed = false`;
  const fields = 'nextPageToken, files(id, name, mimeType, size, modifiedTime, iconLink, parents, webViewLink)';
  
  let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  
  if (pageToken) {
    url += `&pageToken=${encodeURIComponent(pageToken)}`;
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
  console.log('[Google Drive] Files in folder:', folderId, data.files?.map((f: GoogleDriveFile) => ({ name: f.name, mimeType: f.mimeType })));
  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Search for PDF files across all of Google Drive
 */
export async function searchDriveFiles(
  accessToken: string,
  searchQuery: string = ''
): Promise<GoogleDriveFile[]> {
  // Search for PDFs and folders matching the query
  let query = "trashed = false and (mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.folder')";
  if (searchQuery) {
    query += ` and name contains '${searchQuery.replace(/'/g, "\\'")}'`;
  }
  
  const fields = 'files(id, name, mimeType, size, modifiedTime, iconLink, parents, webViewLink)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=50&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Search failed');
  }

  const data = await response.json();
  console.log('[Google Drive] Search results:', data.files?.length, 'files');
  return data.files || [];
}

/**
 * Get file metadata by ID
 */
export async function getDriveFile(
  accessToken: string,
  fileId: string
): Promise<GoogleDriveFile> {
  const fields = 'id, name, mimeType, size, modifiedTime, iconLink, parents, webViewLink';
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${encodeURIComponent(fields)}`;

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
): Promise<GoogleDriveFolder[]> {
  const path: GoogleDriveFolder[] = [];
  let currentId = folderId;

  while (currentId && currentId !== 'root') {
    try {
      const file = await getDriveFile(accessToken, currentId);
      path.unshift({ id: file.id, name: file.name });
      currentId = file.parents?.[0] || '';
    } catch {
      break;
    }
  }

  // Add root at the beginning
  path.unshift({ id: 'root', name: 'My Drive' });

  return path;
}

/**
 * Check if a file is a PDF
 */
export function isPdfFile(file: GoogleDriveFile): boolean {
  return file.mimeType === 'application/pdf';
}

/**
 * Check if a file is a folder
 */
export function isFolder(file: GoogleDriveFile): boolean {
  return file.mimeType === 'application/vnd.google-apps.folder';
}

/**
 * Check if Google Drive integration is configured
 */
export function isGoogleDriveConfigured(): boolean {
  return !!GOOGLE_CLIENT_ID;
}
