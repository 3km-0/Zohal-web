'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { X, Upload, FileText, AlertCircle } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Button, Card, Spinner } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { cn, formatFileSize } from '@/lib/utils';

interface DocumentUploadModalProps {
  workspaceId: string;
  folderId?: string | null;
  onClose: () => void;
  onUploaded: (documentId?: string) => void;
}

interface FileWithPreview {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  progress?: number;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
];

const isImageType = (type: string) => type.startsWith('image/');
const isSupportedRasterImage = (file: File) =>
  file.type === 'image/jpeg' || file.type === 'image/png';

async function buildPdfFromImages(imageFiles: File[], outputBaseName: string): Promise<File> {
  const pdf = await PDFDocument.create();

  for (const f of imageFiles) {
    if (!isSupportedRasterImage(f)) {
      throw new Error(
        `Unsupported image type for web upload: ${f.type || 'unknown'}. Please use JPG or PNG.`
      );
    }

    const bytes = new Uint8Array(await f.arrayBuffer());
    const img =
      f.type === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const { width, height } = img.scale(1);
    const page = pdf.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }

  const pdfBytes = await pdf.save();
  // pdf-lib returns Uint8Array whose .buffer is typed as ArrayBufferLike in some TS/libdom configs.
  // Cast to ArrayBuffer and slice a copy so File constructor accepts it as a BlobPart.
  const buf = pdfBytes.buffer as ArrayBuffer;
  const arrayBuffer = buf.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength);
  return new File([arrayBuffer], `${outputBaseName}.pdf`, { type: 'application/pdf' });
}

export function DocumentUploadModal({
  workspaceId,
  folderId,
  onClose,
  onUploaded,
}: DocumentUploadModalProps) {
  const supabase = createClient();
  const t = useTranslations('documentUpload');
  const tCommon = useTranslations('common');
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [privacyChoice, setPrivacyChoice] = useState<'standard' | 'private'>('standard');

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
          error: t('fileTooLarge'),
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

    // Web MVP: true "Private (local-only)" isn't viable in the browser (storage limits + no trusted local index).
    // Keep the option visible but disabled in UI; guard here defensively too.
    if (privacyChoice === 'private') {
      setFiles((prev) =>
        prev.map((f) =>
          f.status === 'pending'
            ? { ...f, status: 'error' as const, error: t('privateNotSupported') }
            : f
        )
      );
      setUploading(false);
      return;
    }

    const pendingFiles = files.filter((f) => f.status === 'pending');
    const pendingImageItems = pendingFiles.filter((f) => isImageType(f.file.type));
    const pendingPdfItems = pendingFiles.filter((f) => f.file.type === 'application/pdf');

    // Track the first successfully uploaded document ID for auto-navigation
    let firstUploadedDocId: string | undefined;

    const uploadSinglePdf = async (pdfFile: File, originalName: string, idsToMark: string[]): Promise<string> => {
      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) =>
          idsToMark.includes(f.id) ? { ...f, status: 'uploading' as const } : f
        )
      );

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      // Generate document ID
      const documentId = crypto.randomUUID();

      // Get signed upload URL from GCS gateway
      const { data: uploadUrlData, error: urlError } = await supabase.functions.invoke(
        'document-upload-url',
        {
          body: {
            document_id: documentId,
            content_type: pdfFile.type,
            file_size: pdfFile.size,
          },
        }
      );

      if (urlError) throw urlError;
      if (!uploadUrlData?.upload_url) throw new Error('Failed to get upload URL');

      const { upload_url: uploadUrl, storage_path: storagePath } = uploadUrlData;

      // Upload directly to GCS using signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: pdfFile,
        headers: {
          'Content-Type': pdfFile.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      // Create document record
      const { error: insertError } = await supabase.from('documents').insert({
        id: documentId,
        workspace_id: workspaceId,
        folder_id: folderId || null,
        user_id: user.id,
        title: originalName.replace(/\.pdf$/i, ''),
        original_filename: originalName,
        storage_path: storagePath,
        storage_bucket: 'gcs', // Mark as GCS storage
        file_size_bytes: pdfFile.size,
        document_type: 'other', // Required column with default - will be classified after ingestion
        processing_status: 'pending',
      });

      if (insertError) throw insertError;

      // Process document synchronously: extract text -> create chunks -> classify
      // This ensures document is ready for contract analysis immediately
      try {
        // 1. Extract text from PDF
        const { data: textData } = await supabase.functions.invoke('extract-pdf-text-layer', {
          body: { document_id: documentId },
        });

        // 2. Create chunks if we got pages
        if (textData?.pages && textData.pages.length > 0) {
          await supabase.functions.invoke('chunk-document', {
            body: {
              document_id: documentId,
              workspace_id: workspaceId,
              user_id: user.id,
              pages: textData.pages,
            },
          });

          // 3. Create embeddings
          supabase.functions
            .invoke('embed-and-store', {
              body: { document_id: documentId, workspace_id: workspaceId },
            })
            .catch((err) => console.warn('embed-and-store failed:', err));
        }

        // 4. Classify document (wait for this so document type is set before navigation)
        await supabase.functions.invoke('classify-document', {
          body: { document_id: documentId },
        });
      } catch (err) {
        console.warn('Document processing failed, falling back to queue:', err);
        // Fallback: enqueue for background processing
        supabase.functions
          .invoke('enqueue-document-ingestion', {
            body: { document_id: documentId },
          })
          .catch((e) => console.warn('enqueue-document-ingestion failed:', e));
      }

      // Update status to success
      setFiles((prev) =>
        prev.map((f) =>
          idsToMark.includes(f.id) ? { ...f, status: 'success' as const } : f
        )
      );

      return documentId;
    };

    // 1) Upload pending images as ONE multi-page PDF (MVP)
    if (pendingImageItems.length > 0) {
      const ids = pendingImageItems.map((x) => x.id);
      try {
        const pdfFile = await buildPdfFromImages(
          pendingImageItems.map((x) => x.file),
          pendingImageItems.length === 1
            ? pendingImageItems[0].file.name.replace(/\.(png|jpe?g)$/i, '')
            : 'Scanned Document'
        );
        const docId = await uploadSinglePdf(pdfFile, pdfFile.name, ids);
        if (!firstUploadedDocId) firstUploadedDocId = docId;
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            ids.includes(f.id)
              ? {
                  ...f,
                  status: 'error' as const,
                  error: error instanceof Error ? error.message : t('uploadFailed'),
                }
              : f
          )
        );
      }
    }

    // 2) Upload PDFs individually (existing behavior)
    for (const fileItem of pendingPdfItems) {
      try {
        const docId = await uploadSinglePdf(fileItem.file, fileItem.file.name, [fileItem.id]);
        if (!firstUploadedDocId) firstUploadedDocId = docId;
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? {
                  ...f,
                  status: 'error' as const,
                  error: error instanceof Error ? error.message : t('uploadFailed'),
                }
              : f
          )
        );
      }
    }

    setUploading(false);

    // Auto-navigate to the first successfully uploaded document
    if (firstUploadedDocId) {
      setTimeout(() => {
        onUploaded(firstUploadedDocId);
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
          <h2 className="text-lg font-semibold text-text">{t('title')}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="rounded-scholar border border-border bg-surface-alt/60 p-3 text-sm text-text">
            <div className="flex items-start gap-2">
              <span className="mt-0.5">🔒</span>
              <div>
                <div className="font-semibold">Privacy</div>
                <div className="mt-2 space-y-2 text-text-soft">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="privacy"
                      checked={privacyChoice === 'standard'}
                      onChange={() => setPrivacyChoice('standard')}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium text-text">Standard (Cloud copy)</span>
                      <span className="block">Upload and process normally.</span>
                    </span>
                  </label>

                  <label className="flex items-start gap-2 opacity-60 cursor-not-allowed">
                    <input type="radio" name="privacy" disabled className="mt-1" />
                    <span>
                      <span className="font-medium text-text">Private (Local-only)</span>
                      <span className="block">Available on iOS. Web doesn’t support true local-only yet.</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

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
              {isDragging ? t('dropFiles') : t('dragDrop')}
            </p>
            <p className="text-sm text-text-soft mb-4">{tCommon('or')}</p>
            <label>
              <input
                type="file"
                accept=".pdf,image/*"
                multiple
                onChange={(e) => e.target.files && addFiles(e.target.files)}
                className="hidden"
              />
              <span className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-accent text-white font-semibold rounded-scholar cursor-pointer hover:opacity-90 transition-opacity">
                {t('browseFiles')}
              </span>
            </label>
            <p className="text-xs text-text-soft mt-4">{t('maxSize')}</p>
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
              {tCommon('cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={uploadFiles}
              disabled={pendingCount === 0 || uploading}
              isLoading={uploading}
            >
              {t('uploadCount', { count: pendingCount > 0 ? pendingCount : '' })}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

