'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Folder,
  FileText,
  ChevronRight,
  AlertCircle,
  Check,
  Cloud,
} from 'lucide-react';
import { Button, Card, Spinner } from '@/components/ui';
import { cn, formatFileSize, formatRelativeTime } from '@/lib/utils';
import {
  authenticateWithMicrosoft,
  listOneDriveFiles,
  getFolderPath,
  isPdfFile,
  isFolder,
  isOneDriveConfigured,
  getAccessToken,
  type OneDriveFile,
  type OneDriveFolder,
} from '@/lib/onedrive';
import { createClient } from '@/lib/supabase/client';

interface OneDrivePickerProps {
  workspaceId: string;
  folderId?: string | null;
  onClose: () => void;
  onImported: (documentId: string) => void;
}

export function OneDrivePicker({
  workspaceId,
  folderId: targetFolderId,
  onClose,
  onImported,
}: OneDrivePickerProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [files, setFiles] = useState<OneDriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [folderPath, setFolderPath] = useState<OneDriveFolder[]>([{ id: 'root', name: 'OneDrive' }]);
  const [selectedFile, setSelectedFile] = useState<OneDriveFile | null>(null);
  const [importing, setImporting] = useState(false);

  // Check if configured
  const isConfigured = isOneDriveConfigured();

  // Check for existing token on mount
  useEffect(() => {
    const existingToken = getAccessToken();
    if (existingToken) {
      setAccessToken(existingToken);
    }
    setLoading(false);
  }, []);

  // Start authentication (popup flow)
  const authenticate = useCallback(async () => {
    console.log('[OneDrivePicker] Starting auth...');
    setAuthenticating(true);
    setError(null);
    try {
      const token = await authenticateWithMicrosoft();
      console.log('[OneDrivePicker] Got token, length:', token?.length);
      if (token) {
        setAccessToken(token);
      } else {
        setError('No token received');
      }
    } catch (err) {
      console.error('[OneDrivePicker] Auth error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      console.log('[OneDrivePicker] Auth finished');
      setAuthenticating(false);
    }
  }, []);

  // Load files when access token or folder changes
  const loadFiles = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setError(null);
    try {
      const result = await listOneDriveFiles(accessToken, currentFolderId);
      setFiles(result.files);

      // Update breadcrumb path
      const path = await getFolderPath(accessToken, currentFolderId);
      setFolderPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [accessToken, currentFolderId]);

  useEffect(() => {
    if (accessToken) {
      loadFiles();
    }
  }, [accessToken, loadFiles]);

  // Navigate to folder
  const navigateToFolder = (folderId: string) => {
    setCurrentFolderId(folderId);
    setSelectedFile(null);
  };

  // Import selected file
  const handleImport = async () => {
    if (!selectedFile || !accessToken) return;

    setImporting(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: importError } = await supabase.functions.invoke('onedrive-import', {
        body: {
          item_id: selectedFile.id,
          file_name: selectedFile.name,
          file_size: selectedFile.size || 0,
          workspace_id: workspaceId,
          folder_id: targetFolderId || null,
          user_id: user.id,
          access_token: accessToken,
        },
      });

      if (importError) throw importError;
      if (!data?.success) throw new Error(data?.error || 'Import failed');

      onImported(data.document_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Not configured
  if (!isConfigured) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <Card className="relative w-full max-w-md z-10 animate-slide-up p-6 text-center">
          <Cloud className="w-12 h-12 text-text-soft mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text mb-2">OneDrive Not Configured</h2>
          <p className="text-sm text-text-soft mb-4">
            OneDrive integration requires configuration. Please contact support.
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
              <svg className="w-5 h-5" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.5 17.5H4.5C2 17.5 0 15.5 0 13C0 11 1.5 9.2 3.4 8.7C3.4 8.5 3.4 8.2 3.4 8C3.4 4.7 6 2 9.3 2C11.8 2 14 3.7 14.8 6C15.1 5.9 15.4 5.9 15.7 5.9C18.5 5.9 20.8 8.2 20.8 11C20.8 11.1 20.8 11.2 20.8 11.3C22.1 11.9 23 13.2 23 14.7C23 16.8 21.3 18.5 19.2 18.5H14.5" fill="none" stroke="#0078D4" strokeWidth="1.5"/>
                <path d="M11.5 11V21M8.5 18L11.5 21L14.5 18" fill="none" stroke="#0078D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-text">Import from OneDrive</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors">
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        {/* Breadcrumb */}
        {accessToken && (
          <div className="flex items-center gap-1 px-4 py-2 bg-surface-alt border-b border-border overflow-x-auto">
            {folderPath.map((folder, index) => (
              <div key={folder.id} className="flex items-center">
                {index > 0 && <ChevronRight className="w-4 h-4 text-text-soft mx-1" />}
                <button
                  onClick={() => navigateToFolder(folder.id)}
                  className={cn(
                    'text-sm whitespace-nowrap px-2 py-1 rounded transition-colors',
                    index === folderPath.length - 1
                      ? 'text-text font-medium'
                      : 'text-text-soft hover:text-text hover:bg-surface'
                  )}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {authenticating ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Spinner size="lg" />
              <p className="text-sm text-text-soft mt-4">Connecting to OneDrive...</p>
            </div>
          ) : !accessToken ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Cloud className="w-16 h-16 text-text-soft mb-4" />
              <h3 className="text-lg font-semibold text-text mb-2">Connect to OneDrive</h3>
              <p className="text-sm text-text-soft mb-4 text-center max-w-sm">
                Sign in with your Microsoft account to browse and import documents.
              </p>
              <Button onClick={authenticate} isLoading={authenticating}>
                Connect OneDrive
              </Button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full">
              <AlertCircle className="w-12 h-12 text-error mb-4" />
              <p className="text-sm text-error text-center">{error}</p>
              <Button variant="secondary" onClick={loadFiles} className="mt-4">
                Retry
              </Button>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Folder className="w-12 h-12 text-text-soft mb-4" />
              <p className="text-sm text-text-soft">This folder is empty</p>
            </div>
          ) : (
            <div className="space-y-1">
              {files.map((file) => {
                const isPdf = isPdfFile(file);
                const isFolderItem = isFolder(file);
                const isSelected = selectedFile?.id === file.id;

                return (
                  <button
                    key={file.id}
                    onClick={() => {
                      if (isFolderItem) {
                        navigateToFolder(file.id);
                      } else if (isPdf) {
                        setSelectedFile(isSelected ? null : file);
                      }
                    }}
                    disabled={!isFolderItem && !isPdf}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
                      isSelected
                        ? 'bg-accent/10 border-2 border-accent'
                        : 'hover:bg-surface-alt border-2 border-transparent',
                      !isFolderItem && !isPdf && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isFolderItem ? (
                      <Folder className="w-8 h-8 text-blue-500" />
                    ) : (
                      <FileText className={cn('w-8 h-8', isPdf ? 'text-red-500' : 'text-text-soft')} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{file.name}</p>
                      <p className="text-xs text-text-soft">
                        {isFolderItem
                          ? `${file.folder?.childCount || 0} items`
                          : `${file.size ? formatFileSize(file.size) : ''} ${file.lastModifiedDateTime ? '• ' + formatRelativeTime(file.lastModifiedDateTime) : ''}`}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                    {isFolderItem && <ChevronRight className="w-5 h-5 text-text-soft" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-text-soft">
            {selectedFile ? `Selected: ${selectedFile.name}` : 'Select a PDF file to import'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!selectedFile || importing}
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
