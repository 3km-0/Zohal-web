'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Folder,
  FileText,
  ChevronRight,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Check,
  Cloud,
  Search,
} from 'lucide-react';
import { Button, Card, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn, formatFileSize, formatRelativeTime } from '@/lib/utils';
import {
  authenticateWithGoogle,
  listDriveFiles,
  searchDriveFiles,
  getFolderPath,
  isPdfFile,
  isFolder,
  isGoogleDriveConfigured,
  getAccessToken,
  type GoogleDriveFile,
  type GoogleDriveFolder,
} from '@/lib/google-drive';
import { createClient } from '@/lib/supabase/client';
import { mapHttpError } from '@/lib/errors';

interface GoogleDrivePickerProps {
  workspaceId: string;
  folderId?: string | null;
  onClose: () => void;
  onImported: (documentId: string) => void;
}

export function GoogleDrivePicker({
  workspaceId,
  folderId: targetFolderId,
  onClose,
  onImported,
}: GoogleDrivePickerProps) {
  const supabase = createClient();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [folderPath, setFolderPath] = useState<GoogleDriveFolder[]>([{ id: 'root', name: 'My Drive' }]);
  const [selectedFile, setSelectedFile] = useState<GoogleDriveFile | null>(null);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GoogleDriveFile[] | null>(null);

  // Check if configured
  const isConfigured = isGoogleDriveConfigured();

  // Authenticate on mount if not already authenticated
  const authenticate = useCallback(async () => {
    setAuthenticating(true);
    setError(null);
    try {
      const token = await authenticateWithGoogle();
      setAccessToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthenticating(false);
    }
  }, []);

  // Load files when access token or folder changes
  const loadFiles = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setError(null);
    try {
      const result = await listDriveFiles(accessToken, currentFolderId);
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
    // Check for existing token first
    const existingToken = getAccessToken();
    if (existingToken) {
      setAccessToken(existingToken);
    } else if (isConfigured) {
      authenticate();
    } else {
      setLoading(false);
    }
  }, [authenticate, isConfigured]);

  useEffect(() => {
    if (accessToken) {
      loadFiles();
    }
  }, [accessToken, loadFiles]);

  // Navigate to folder
  const navigateToFolder = (folderId: string) => {
    setCurrentFolderId(folderId);
    setSelectedFile(null);
    setSearchResults(null);
    setSearchQuery('');
  };

  // Search for files
  const handleSearch = useCallback(async () => {
    if (!accessToken) return;
    
    setIsSearching(true);
    setError(null);
    try {
      const results = await searchDriveFiles(accessToken, searchQuery);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [accessToken, searchQuery]);

  // Clear search
  const clearSearch = () => {
    setSearchResults(null);
    setSearchQuery('');
  };

  // Import selected file
  const handleImport = async () => {
    if (!selectedFile || !accessToken) return;

    setImporting(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: importError, response } = await supabase.functions.invoke('gdrive-import', {
        body: {
          file_id: selectedFile.id,
          file_name: selectedFile.name,
          file_size: selectedFile.size || 0,
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
          <h2 className="text-lg font-semibold text-text mb-2">Google Drive Not Configured</h2>
          <p className="text-sm text-text-soft mb-4">
            Google Drive integration requires configuration. Please contact support.
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

        {/* Search Bar */}
        {accessToken && (
          <div className="px-4 py-2 border-b border-border">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-soft" />
                <input
                  type="text"
                  placeholder="Search for PDFs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-9 pr-3 py-2 bg-surface-alt border border-border rounded-lg text-sm text-text placeholder:text-text-soft focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching} size="sm">
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </Button>
              {searchResults && (
                <Button variant="secondary" onClick={clearSearch} size="sm">
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Breadcrumb */}
        {accessToken && !searchResults && (
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

        {/* Search Results Header */}
        {searchResults && (
          <div className="px-4 py-2 bg-accent/5 border-b border-border">
            <p className="text-sm text-text">
              Found <strong>{searchResults.length}</strong> PDF files
            </p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {authenticating ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Spinner size="lg" />
              <p className="text-sm text-text-soft mt-4">Connecting to Google Drive...</p>
            </div>
          ) : !accessToken ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Cloud className="w-16 h-16 text-text-soft mb-4" />
              <h3 className="text-lg font-semibold text-text mb-2">Connect to Google Drive</h3>
              <p className="text-sm text-text-soft mb-4 text-center max-w-sm">
                Sign in with your Google account to browse and import documents.
              </p>
              <Button onClick={authenticate} isLoading={authenticating}>
                Connect Google Drive
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
          ) : (searchResults || files).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Folder className="w-12 h-12 text-text-soft mb-4" />
              <p className="text-sm text-text-soft">
                {searchResults ? 'No PDFs found. Try a different search.' : 'This folder is empty'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {(searchResults || files).map((file) => {
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
                          ? 'Folder'
                          : `${file.size ? formatFileSize(file.size) : ''} ${file.modifiedTime ? '• ' + formatRelativeTime(file.modifiedTime) : ''}`}
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
