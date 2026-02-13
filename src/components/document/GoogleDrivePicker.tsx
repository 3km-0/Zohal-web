'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  AlertCircle,
  Check,
  Cloud,
  FileText,
} from 'lucide-react';
import { Button, Card, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn, formatFileSize } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { mapHttpError } from '@/lib/errors';

interface GoogleDrivePickerProps {
  workspaceId: string;
  folderId?: string | null;
  onClose: () => void;
  onImported: (documentId: string) => void;
}

type PickedDriveFile = {
  id: string;
  name: string;
  sizeBytes?: number;
  resourceKey?: string;
};

export function GoogleDrivePicker({
  workspaceId,
  folderId: targetFolderId,
  onClose,
  onImported,
}: GoogleDrivePickerProps) {
  const supabase = createClient();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<PickedDriveFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  const GOOGLE_PICKER_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';
  const isConfigured = !!GOOGLE_PICKER_API_KEY;
  const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  // Picker needs appId (Google Cloud project number) for drive.file to correctly grant access.
  // We can derive it from OAuth client id: "<projectNumber>-....apps.googleusercontent.com"
  const googleAppId = useMemo(() => {
    const m = GOOGLE_CLIENT_ID.match(/^(\d+)-/);
    return m?.[1] || '';
  }, [GOOGLE_CLIENT_ID]);

  const selectedSummary = useMemo(() => {
    if (selectedFiles.length === 0) return 'Select PDF files to import';
    if (selectedFiles.length === 1) return `Selected: ${selectedFiles[0]?.name ?? '1 file'}`;
    return `Selected: ${selectedFiles.length} files`;
  }, [selectedFiles]);

  const loadIntegrationToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) throw new Error('Not authenticated');

      const { data: integration, error: integrationErr } = await supabase
        .from('integration_accounts')
        .select('status, access_token, token_expires_at')
        .eq('user_id', user.id)
        .eq('provider', 'google_drive')
        .eq('status', 'active')
        .maybeSingle();

      if (integrationErr) throw integrationErr;
      setAccessToken(integration?.access_token || null);
    } catch (err) {
      setAccessToken(null);
      setError(err instanceof Error ? err.message : 'Failed to load Google connection');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadIntegrationToken();
  }, [loadIntegrationToken]);

  async function connectGoogle() {
    setConnecting(true);
    setError(null);
    try {
      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?integration=google_drive&popup=1`,
          scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events',
          queryParams: { access_type: 'offline', prompt: 'consent' },
          skipBrowserRedirect: true,
        },
      });
      if (oauthErr || !data?.url) throw oauthErr || new Error('Failed to start OAuth');

      // Open OAuth in a centered popup so the user never leaves the page
      const w = 500;
      const h = 620;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        data.url,
        'zohal-google-auth',
        `width=${w},height=${h},left=${left},top=${top},popup=yes`,
      );

      await new Promise<void>((resolve) => {
        const onMessage = (event: MessageEvent) => {
          if (event.data?.type === 'zohal:oauth-done') {
            window.removeEventListener('message', onMessage);
            clearInterval(checkClosed);
            resolve();
          }
        };
        window.addEventListener('message', onMessage);

        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', onMessage);
            resolve();
          }
        }, 500);
      });

      await loadIntegrationToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Google');
    } finally {
      setConnecting(false);
    }
  }

  function ensureGooglePickerLoaded(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!isConfigured) {
        reject(new Error('Google Picker is not configured (missing API key)'));
        return;
      }

      const w = window as unknown as {
        gapi?: { load: (name: string, options: { callback: () => void }) => void };
        google?: { picker?: unknown };
      };

      // gapi already loaded
      if (w.gapi?.load && w.google?.picker) {
        w.gapi.load('picker', { callback: () => resolve() });
        return;
      }

      const existing = document.getElementById('google-picker-script') as HTMLScriptElement | null;
      if (existing) {
        // Script tag exists; poll for gapi availability
        const start = Date.now();
        const interval = setInterval(() => {
          const ready =
            (window as any).gapi?.load && (window as any).google?.picker;
          if (ready) {
            clearInterval(interval);
            (window as any).gapi.load('picker', { callback: () => resolve() });
          } else if (Date.now() - start > 10_000) {
            clearInterval(interval);
            reject(new Error('Timed out loading Google Picker'));
          }
        }, 100);
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-picker-script';
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        const gapi = (window as any).gapi;
        if (!gapi?.load) {
          reject(new Error('Google Picker failed to initialize'));
          return;
        }
        gapi.load('picker', { callback: () => resolve() });
      };
      script.onerror = () => reject(new Error('Failed to load Google Picker script'));
      document.head.appendChild(script);
    });
  }

  async function openPicker() {
    setError(null);
    if (!accessToken) {
      setError('Google is not connected. Connect Google to import files.');
      return;
    }
    if (!googleAppId) {
      setError('Google Drive is not configured (missing app id).');
      return;
    }
    try {
      await ensureGooglePickerLoaded();

      const g = (window as any).google;
      if (!g?.picker) throw new Error('Google Picker unavailable');

      const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
        .setMimeTypes('application/pdf')
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);

      const picker = new g.picker.PickerBuilder()
        .setDeveloperKey(GOOGLE_PICKER_API_KEY)
        .setOAuthToken(accessToken)
        .setAppId(googleAppId)
        .setOrigin(window.location.origin)
        .addView(view)
        .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
        .setTitle('Select PDF files')
        .setCallback((data: any) => {
          if (data?.action === g.picker.Action.PICKED) {
            const docs = Array.isArray(data?.docs) ? data.docs : [];
            const picked: PickedDriveFile[] = docs
              .map((d: any) => ({
                id: String(d?.id || ''),
                name: String(d?.name || 'Untitled.pdf'),
                sizeBytes: typeof d?.sizeBytes === 'number' ? d.sizeBytes : undefined,
                resourceKey: d?.resourceKey ? String(d.resourceKey) : undefined,
              }))
              .filter((f: PickedDriveFile) => Boolean(f.id));
            setSelectedFiles(picked);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open picker');
    }
  }

  // Import selected file
  const handleImport = async () => {
    if (!accessToken || selectedFiles.length === 0) return;

    setImporting(true);
    setError(null);
    setImportProgress({ current: 0, total: selectedFiles.length });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let lastImportedId: string | null = null;
      for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i]!;
        setImportProgress({ current: i + 1, total: selectedFiles.length });

        const { data, error: importError, response } = await supabase.functions.invoke('gdrive-import', {
          body: {
            file_id: f.id,
            file_name: f.name,
            file_size: f.sizeBytes || 0,
            resource_key: f.resourceKey || null,
            workspace_id: workspaceId,
            folder_id: targetFolderId || null,
            user_id: user.id,
            access_token: accessToken,
          },
        });

        if (importError) {
          const json = response ? await response.json().catch(() => null) : null;
          const status = response?.status ?? (importError as any)?.status ?? 500;
          const uiErr = mapHttpError(status, json, 'gdrive-import');
          toast.show(uiErr);
          throw new Error(uiErr.message);
        }
        if (!data?.success) throw new Error(data?.error || 'Import failed');

        lastImportedId = data.document_id;
      }

      if (lastImportedId) onImported(lastImportedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  // Not configured
  if (!isConfigured) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <Card className="relative w-full max-w-md z-10 animate-slide-up p-6 text-center">
          <Cloud className="w-12 h-12 text-text-soft mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text mb-2">Google Drive Not Configured</h2>
          <p className="text-sm text-text-soft mb-4">
            Google Drive import requires configuration. Please contact support.
          </p>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <Card className="relative w-full max-w-2xl h-[600px] z-10 animate-slide-up flex flex-col" padding="none">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.4 13.75z" fill="#ea4335"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-text">Import from Google Drive</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors">
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!accessToken ? (
              <Button onClick={connectGoogle} isLoading={connecting}>
                Connect Google
              </Button>
            ) : (
              <Button onClick={openPicker} disabled={connecting || importing}>
                Choose PDFs…
              </Button>
            )}
            {selectedFiles.length > 0 && (
              <Button variant="secondary" onClick={() => setSelectedFiles([])} disabled={importing}>
                Clear selection
              </Button>
            )}
          </div>
          {importing && importProgress.total > 0 ? (
            <div className="text-xs text-text-soft">
              Importing {importProgress.current}/{importProgress.total}
            </div>
          ) : null}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Spinner size="lg" />
              <p className="text-sm text-text-soft mt-4">Loading Google connection…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full">
              <AlertCircle className="w-12 h-12 text-error mb-4" />
              <p className="text-sm text-error text-center">{error}</p>
              <div className="flex gap-2 mt-4">
                <Button variant="secondary" onClick={() => void loadIntegrationToken()}>
                  Retry
                </Button>
                {!accessToken ? (
                  <Button onClick={connectGoogle} isLoading={connecting}>
                    Connect Google
                  </Button>
                ) : null}
              </div>
            </div>
          ) : !accessToken ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Cloud className="w-16 h-16 text-text-soft mb-4" />
              <h3 className="text-lg font-semibold text-text mb-2">Connect Google</h3>
              <p className="text-sm text-text-soft mb-4 text-center max-w-sm">
                Connect your Google account to select PDFs from Drive.
              </p>
              <Button onClick={connectGoogle} isLoading={connecting}>
                Connect Google
              </Button>
            </div>
          ) : selectedFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <FileText className="w-12 h-12 text-text-soft mb-4" />
              <p className="text-sm text-text-soft text-center max-w-sm">
                Click <span className="font-medium text-text">Choose PDFs…</span> to select files from Google Drive.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedFiles.map((f) => (
                <div
                  key={f.id}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-surface'
                  )}
                >
                  <FileText className="w-8 h-8 text-red-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{f.name}</p>
                    <p className="text-xs text-text-soft">
                      {typeof f.sizeBytes === 'number' ? formatFileSize(f.sizeBytes) : '—'}
                    </p>
                  </div>
                  <div className="w-6 h-6 bg-accent/10 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-accent" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-text-soft">
            {selectedSummary}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!accessToken || selectedFiles.length === 0 || importing}
              isLoading={importing}
            >
              Import
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
