'use client';

import { useState, useCallback } from 'react';
import { X, Upload, FileText, AlertCircle } from 'lucide-react';
import { Button, Card, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { cn, formatFileSize } from '@/lib/utils';

interface DocumentUploadModalProps {
  workspaceId: string;
  folderId?: string | null;
  onClose: () => void;
  onUploaded: () => void;
}

interface FileWithPreview {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  progress?: number;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_TYPES = ['application/pdf'];

export function DocumentUploadModal({
  workspaceId,
  folderId,
  onClose,
  onUploaded,
}: DocumentUploadModalProps) {
  const supabase = createClient();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const validFiles: FileWithPreview[] = [];

    Array.from(newFiles).forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return; // Skip non-PDF files
      }

      if (file.size > MAX_FILE_SIZE) {
        validFiles.push({
          file,
          id: Math.random().toString(36).substr(2, 9),
          status: 'error',
          error: 'File too large (max 100MB)',
        });
        return;
      }

      validFiles.push({
        file,
        id: Math.random().toString(36).substr(2, 9),
        status: 'pending',
      });
    });

    setFiles((prev) => [...prev, ...validFiles]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadFiles = async () => {
    setUploading(true);

    const pendingFiles = files.filter((f) => f.status === 'pending');

    for (const fileItem of pendingFiles) {
      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id ? { ...f, status: 'uploading' as const } : f
        )
      );

      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) throw new Error('Not authenticated');

        // Create unique storage path
        const timestamp = Date.now();
        const safeName = fileItem.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${user.id}/${workspaceId}/${timestamp}_${safeName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, fileItem.file, {
            contentType: fileItem.file.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Create document record
        const documentId = crypto.randomUUID();
        const { error: insertError } = await supabase.from('documents').insert({
          id: documentId,
          workspace_id: workspaceId,
          folder_id: folderId || null,
          user_id: user.id,
          title: fileItem.file.name.replace(/\.pdf$/i, ''),
          original_filename: fileItem.file.name,
          storage_path: storagePath,
          file_size_bytes: fileItem.file.size,
          mime_type: fileItem.file.type,
          processing_status: 'pending',
        });

        if (insertError) throw insertError;

        // Trigger background processing (classification, chunking, embedding)
        // Fire and forget - don't block upload completion
        supabase.functions.invoke('classify-document', {
          body: { document_id: documentId, filename: fileItem.file.name }
        }).catch(err => console.warn('Classification failed:', err));

        // Update status to success
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id ? { ...f, status: 'success' as const } : f
          )
        );
      } catch (error) {
        // Update status to error
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? {
                  ...f,
                  status: 'error' as const,
                  error: error instanceof Error ? error.message : 'Upload failed',
                }
              : f
          )
        );
      }
    }

    setUploading(false);

    // Check if all uploads succeeded
    const allSucceeded = files.every(
      (f) => f.status === 'success' || f.status === 'error'
    );
    if (allSucceeded && files.some((f) => f.status === 'success')) {
      setTimeout(() => {
        onUploaded();
      }, 500);
    }
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const hasErrors = files.some((f) => f.status === 'error');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <Card className="relative w-full max-w-lg z-10 animate-slide-up" padding="none">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Upload Documents</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              'border-2 border-dashed rounded-scholar-lg p-8 text-center transition-colors',
              isDragging
                ? 'border-accent bg-accent/5'
                : 'border-border hover:border-accent/50'
            )}
          >
            <Upload
              className={cn(
                'w-10 h-10 mx-auto mb-3',
                isDragging ? 'text-accent' : 'text-text-soft'
              )}
            />
            <p className="text-text font-medium mb-1">
              {isDragging ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-sm text-text-soft mb-4">or</p>
            <label>
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => e.target.files && addFiles(e.target.files)}
                className="hidden"
              />
              <span className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-accent text-white font-semibold rounded-scholar cursor-pointer hover:opacity-90 transition-opacity">
                Browse Files
              </span>
            </label>
            <p className="text-xs text-text-soft mt-4">PDF files only, max 100MB</p>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-auto">
              {files.map((fileItem) => (
                <div
                  key={fileItem.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-scholar border',
                    fileItem.status === 'error'
                      ? 'border-error/30 bg-error/5'
                      : fileItem.status === 'success'
                      ? 'border-success/30 bg-success/5'
                      : 'border-border bg-surface-alt'
                  )}
                >
                  {fileItem.status === 'uploading' ? (
                    <Spinner size="sm" />
                  ) : fileItem.status === 'error' ? (
                    <AlertCircle className="w-5 h-5 text-error" />
                  ) : fileItem.status === 'success' ? (
                    <div className="w-5 h-5 rounded-full bg-success flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  ) : (
                    <FileText className="w-5 h-5 text-text-soft" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">
                      {fileItem.file.name}
                    </p>
                    <p className="text-xs text-text-soft">
                      {fileItem.error || formatFileSize(fileItem.file.size)}
                    </p>
                  </div>

                  {fileItem.status === 'pending' && (
                    <button
                      onClick={() => removeFile(fileItem.id)}
                      className="p-1 rounded hover:bg-surface transition-colors"
                    >
                      <X className="w-4 h-4 text-text-soft" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={uploadFiles}
              disabled={pendingCount === 0 || uploading}
              isLoading={uploading}
            >
              Upload {pendingCount > 0 && `(${pendingCount})`}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

