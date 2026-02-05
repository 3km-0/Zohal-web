'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, Upload, FileText, AlertCircle, Cloud } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Button, Card, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn, formatFileSize } from '@/lib/utils';
import { GoogleDrivePicker } from './GoogleDrivePicker';
import { OneDrivePicker } from './OneDrivePicker';
import { ZohalLibraryPicker } from './ZohalLibraryPicker';
import { PrivacySettingsPanel } from './PrivacySettingsPanel';
import { isGoogleDriveConfigured } from '@/lib/google-drive';
import { isOneDriveConfigured } from '@/lib/onedrive';
import { mapHttpError } from '@/lib/errors';
import {
  SensitiveDataSanitizer,
  extractTextFromPdf,
  getDefaultPrivacyConfig,
  type PrivacyModeConfig,
} from '@/lib/sanitizer';

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
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALLOWED_TYPES = [
  'application/pdf',
  DOCX_MIME,
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
];

const isImageType = (type: string) => type.startsWith('image/');
const isSupportedRasterImage = (file: File) =>
  file.type === 'image/jpeg' || file.type === 'image/png';
const isDocxFile = (file: File) =>
  file.type === DOCX_MIME || file.name.toLowerCase().endsWith('.docx');

const getFileExtension = (name: string) => {
  const parts = name.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
};

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
  const toast = useToast();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [privacyChoice, setPrivacyChoice] = useState<'standard' | 'private'>('standard');
  const [privacyConfig, setPrivacyConfig] = useState<PrivacyModeConfig>(getDefaultPrivacyConfig());
  const [showGoogleDrive, setShowGoogleDrive] = useState(false);
  const [showOneDrive, setShowOneDrive] = useState(false);
  const [showZohalLibrary, setShowZohalLibrary] = useState(false);

  // Check if cloud imports are available
  const hasGoogleDrive = isGoogleDriveConfigured();
  const hasOneDrive = isOneDriveConfigured();

  // Is private/ephemeral mode selected?
  const isPrivateMode = privacyChoice === 'private';

  // Warn before leaving if ephemeral PDF is in memory
  useEffect(() => {
    if (!isPrivateMode || files.length === 0) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t('privateLeaveWarning');
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPrivateMode, files.length]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const validFiles: FileWithPreview[] = [];

    Array.from(newFiles).forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type) && !isDocxFile(file)) {
        return;
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
  }, [t]);

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

  // Ephemeral (private session) upload - PDF stays in browser, only sanitized text goes to cloud
  const uploadEphemeralDocument = async (pdfFile: File, idsToMark: string[]): Promise<string> => {
    setFiles((prev) =>
      prev.map((f) =>
        idsToMark.includes(f.id) ? { ...f, status: 'uploading' as const } : f
      )
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 1. Extract text client-side using pdf.js
    console.log('[Ephemeral] Extracting text from PDF...');
    const pages = await extractTextFromPdf(pdfFile);
    console.log('[Ephemeral] Extracted', pages.length, 'pages');

    // 2. Sanitize text client-side
    console.log('[Ephemeral] Sanitizing text...');
    const sanitizer = new SensitiveDataSanitizer(privacyConfig);
    const { pages: sanitizedPages, report } = sanitizer.sanitizePages(pages);
    console.log('[Ephemeral] Sanitization report:', report);

    // 3. Create document record with privacy_mode = true, storage_path = 'local'
    const documentId = crypto.randomUUID();
    const { error: insertError } = await supabase.from('documents').insert({
      id: documentId,
      workspace_id: workspaceId,
      folder_id: folderId || null,
      user_id: user.id,
      title: pdfFile.name.replace(/\.pdf$/i, ''),
      original_filename: pdfFile.name,
      storage_path: 'local', // Indicates PDF not in cloud
      storage_bucket: 'local',
      file_size_bytes: pdfFile.size,
      document_type: 'other',
      processing_status: 'completed',
      privacy_mode: true,
      source_metadata: {
        origin: 'web_ephemeral',
        sanitization_report: report,
      },
    });

    if (insertError) throw insertError;
    console.log('[Ephemeral] Document record created:', documentId);

    // 4. Send sanitized chunks to cloud
    const sanitizedPagesForChunking = sanitizedPages.map((p) => ({
      page_number: p.pageNumber,
      text: p.sanitizedText,
    }));

    const { error: chunkError, response: chunkResponse } = await supabase.functions.invoke('chunk-document', {
      body: {
        document_id: documentId,
        workspace_id: workspaceId,
        user_id: user.id,
        pages: sanitizedPagesForChunking,
      },
    });

    if (chunkError) {
      const json = chunkResponse ? await chunkResponse.json().catch(() => null) : null;
      const uiErr = mapHttpError(chunkResponse?.status ?? 500, json, 'chunk-document');
      toast.show(uiErr);
    }

    // 5. Create embeddings
    supabase.functions
      .invoke('embed-and-store', {
        body: { document_id: documentId, workspace_id: workspaceId },
      })
      .catch((err) => console.warn('[Ephemeral] embed-and-store failed:', err));

    // 6. Classify document
    supabase.functions
      .invoke('classify-document', {
        body: { document_id: documentId },
      })
      .catch((err) => console.warn('[Ephemeral] classify-document failed:', err));

    setFiles((prev) =>
      prev.map((f) =>
        idsToMark.includes(f.id) ? { ...f, status: 'success' as const } : f
      )
    );

    return documentId;
  };

  // Standard cloud upload
  const uploadStandardDocument = async (
    pdfFile: File,
    originalName: string,
    idsToMark: string[],
    sourceMetadata?: Record<string, unknown>
  ): Promise<string> => {
    setFiles((prev) =>
      prev.map((f) =>
        idsToMark.includes(f.id) ? { ...f, status: 'uploading' as const } : f
      )
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const documentId = crypto.randomUUID();

    const { data: uploadUrlData, error: urlError, response: urlResponse } = await supabase.functions.invoke(
      'document-upload-url',
      {
        body: {
          document_id: documentId,
          content_type: pdfFile.type,
          file_size: pdfFile.size,
        },
      }
    );

    if (urlError) {
      const json = urlResponse ? await urlResponse.json().catch(() => null) : null;
      const uiErr = mapHttpError(urlResponse?.status ?? 500, json, 'document-upload-url');
      toast.show(uiErr);
      throw new Error(uiErr.message);
    }
    if (!uploadUrlData?.upload_url) throw new Error('Failed to get upload URL');

    const { upload_url: uploadUrl, storage_path: storagePath } = uploadUrlData;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: pdfFile,
      headers: { 'Content-Type': pdfFile.type },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

    const { error: insertError } = await supabase.from('documents').insert({
      id: documentId,
      workspace_id: workspaceId,
      folder_id: folderId || null,
      user_id: user.id,
      title: originalName.replace(/\.pdf$/i, ''),
      original_filename: originalName,
      storage_path: storagePath,
      storage_bucket: 'gcs',
      file_size_bytes: pdfFile.size,
      document_type: 'other',
      processing_status: 'pending',
      source_metadata: sourceMetadata,
    });

    if (insertError) throw insertError;

    try {
      const { data: textData, error: textErr, response: textResponse } = await supabase.functions.invoke('extract-pdf-text-layer', {
        body: { document_id: documentId },
      });
      if (textErr) {
        const json = textResponse ? await textResponse.json().catch(() => null) : null;
        const uiErr = mapHttpError(textResponse?.status ?? 500, json, 'extract-pdf-text-layer');
        toast.show(uiErr);
        throw new Error(uiErr.message);
      }

      if (textData?.pages && textData.pages.length > 0) {
        const { error: chunkErr, response: chunkResp } = await supabase.functions.invoke('chunk-document', {
          body: {
            document_id: documentId,
            workspace_id: workspaceId,
            user_id: user.id,
            pages: textData.pages,
          },
        });
        if (chunkErr) {
          const json = chunkResp ? await chunkResp.json().catch(() => null) : null;
          const uiErr = mapHttpError(chunkResp?.status ?? 500, json, 'chunk-document');
          toast.show(uiErr);
          throw new Error(uiErr.message);
        }

        supabase.functions
          .invoke('embed-and-store', {
            body: { document_id: documentId, workspace_id: workspaceId },
          })
          .catch(console.warn);
      }

      await supabase.functions.invoke('classify-document', {
        body: { document_id: documentId },
      });
    } catch (err) {
      console.error('[Upload] Processing failed:', err);
      supabase.functions
        .invoke('enqueue-document-ingestion', { body: { document_id: documentId } })
        .catch(console.warn);
    }

    setFiles((prev) =>
      prev.map((f) =>
        idsToMark.includes(f.id) ? { ...f, status: 'success' as const } : f
      )
    );

    return documentId;
  };

  const uploadDocxDocument = async (docxFile: File, idsToMark: string[]): Promise<string> => {
    setFiles((prev) =>
      prev.map((f) =>
        idsToMark.includes(f.id) ? { ...f, status: 'uploading' as const } : f
      )
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const documentId = crypto.randomUUID();
    const extension = getFileExtension(docxFile.name) || 'docx';
    const contentType = docxFile.type || DOCX_MIME;

    const { data: uploadUrlData, error: urlError, response: urlResponse } = await supabase.functions.invoke(
      'document-source-upload-url',
      {
        body: {
          document_id: documentId,
          workspace_id: workspaceId,
          content_type: contentType,
          file_size: docxFile.size,
          source_extension: extension,
        },
      }
    );

    if (urlError) {
      const json = urlResponse ? await urlResponse.json().catch(() => null) : null;
      const uiErr = mapHttpError(urlResponse?.status ?? 500, json, 'document-source-upload-url');
      toast.show(uiErr);
      throw new Error(uiErr.message);
    }
    if (!uploadUrlData?.upload_url) throw new Error('Failed to get upload URL');

    const {
      upload_url: uploadUrl,
      source_storage_path: sourceStoragePath,
      pdf_storage_path: pdfStoragePath,
    } = uploadUrlData;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: docxFile,
      headers: { 'Content-Type': contentType },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

    const { error: insertError } = await supabase.from('documents').insert({
      id: documentId,
      workspace_id: workspaceId,
      folder_id: folderId || null,
      user_id: user.id,
      title: docxFile.name.replace(/\.[^.]+$/i, ''),
      original_filename: docxFile.name,
      storage_path: pdfStoragePath,
      storage_bucket: 'gcs',
      file_size_bytes: docxFile.size,
      document_type: 'other',
      processing_status: 'processing',
      source_metadata: {
        original_mime: contentType,
        original_extension: extension,
        source_storage_path: sourceStoragePath,
        source_storage_bucket: 'documents',
        conversion_method: 'cloudconvert_docx_to_pdf_v1',
        conversion_status: 'processing',
      },
    });

    if (insertError) throw insertError;

    try {
      await supabase.functions.invoke('convert-to-pdf', {
        body: { document_id: documentId, source_storage_path: sourceStoragePath },
      });
    } catch (err) {
      console.warn('[Upload] convert-to-pdf failed (non-fatal):', err);
    }

    setFiles((prev) =>
      prev.map((f) =>
        idsToMark.includes(f.id) ? { ...f, status: 'success' as const } : f
      )
    );

    return documentId;
  };

  const uploadFiles = async () => {
    setUploading(true);

    const pendingFiles = files.filter((f) => f.status === 'pending');
    const pendingImageItems = pendingFiles.filter((f) => isImageType(f.file.type));
    const pendingPdfItems = pendingFiles.filter((f) => f.file.type === 'application/pdf');
    const pendingDocxItems = pendingFiles.filter((f) => isDocxFile(f.file));

    let firstUploadedDocId: string | undefined;

    // Handle images -> PDF conversion
    if (pendingImageItems.length > 0) {
      const ids = pendingImageItems.map((x) => x.id);
      try {
        const imageTypes = new Set(pendingImageItems.map((x) => x.file.type).filter(Boolean));
        const originalMime = imageTypes.size === 1 ? Array.from(imageTypes)[0] : 'image/*';
        const originalExtension =
          imageTypes.size === 1 ? getFileExtension(pendingImageItems[0].file.name) : 'image';
        const pdfFile = await buildPdfFromImages(
          pendingImageItems.map((x) => x.file),
          pendingImageItems.length === 1
            ? pendingImageItems[0].file.name.replace(/\.(png|jpe?g)$/i, '')
            : 'Scanned Document'
        );

        const docId = isPrivateMode
          ? await uploadEphemeralDocument(pdfFile, ids)
          : await uploadStandardDocument(pdfFile, pdfFile.name, ids, {
              original_mime: originalMime,
              original_extension: originalExtension || 'image',
              conversion_method: 'image_to_pdf_pdf-lib_v1',
              conversion_status: 'completed',
            });

        if (!firstUploadedDocId) firstUploadedDocId = docId;
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            ids.includes(f.id)
              ? { ...f, status: 'error' as const, error: error instanceof Error ? error.message : t('uploadFailed') }
              : f
          )
        );
      }
    }

    // Handle DOCX (standard mode only)
    if (pendingDocxItems.length > 0) {
      const ids = pendingDocxItems.map((x) => x.id);
      if (isPrivateMode) {
        setFiles((prev) =>
          prev.map((f) =>
            ids.includes(f.id)
              ? { ...f, status: 'error' as const, error: t('docxPrivateUnsupported') }
              : f
          )
        );
      } else {
        for (const fileItem of pendingDocxItems) {
          try {
            const docId = await uploadDocxDocument(fileItem.file, [fileItem.id]);
            if (!firstUploadedDocId) firstUploadedDocId = docId;
          } catch (error) {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileItem.id
                  ? { ...f, status: 'error' as const, error: error instanceof Error ? error.message : t('uploadFailed') }
                  : f
              )
            );
          }
        }
      }
    }

    // Handle PDFs
    for (const fileItem of pendingPdfItems) {
      try {
        const docId = isPrivateMode
          ? await uploadEphemeralDocument(fileItem.file, [fileItem.id])
          : await uploadStandardDocument(fileItem.file, fileItem.file.name, [fileItem.id], {
              original_mime: fileItem.file.type || 'application/pdf',
              original_extension: getFileExtension(fileItem.file.name) || 'pdf',
              conversion_method: 'none',
              conversion_status: 'completed',
            });

        if (!firstUploadedDocId) firstUploadedDocId = docId;
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? { ...f, status: 'error' as const, error: error instanceof Error ? error.message : t('uploadFailed') }
              : f
          )
        );
      }
    }

    setUploading(false);

    if (firstUploadedDocId) {
      setTimeout(() => onUploaded(firstUploadedDocId), 500);
    }
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <Card className="relative w-full max-w-lg z-10 animate-slide-up max-h-[90vh] overflow-auto" padding="none">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-text">{t('title')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors">
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Privacy Choice */}
          <div className="rounded-scholar border border-border bg-surface-alt/60 p-3 text-sm text-text">
            <div className="flex items-start gap-2">
              <span className="mt-0.5">🔒</span>
              <div className="flex-1">
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

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="privacy"
                      checked={privacyChoice === 'private'}
                      onChange={() => setPrivacyChoice('private')}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium text-text">Private Session</span>
                      <span className="block">
                        PDF stays in browser only. Sanitized text sent to AI. Lost on page close.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy Settings Panel */}
          {isPrivateMode && (
            <PrivacySettingsPanel
              config={privacyConfig}
              onChange={setPrivacyConfig}
              disabled={uploading}
            />
          )}

          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              'border-2 border-dashed rounded-scholar-lg p-8 text-center transition-colors',
              isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
            )}
          >
            <Upload className={cn('w-10 h-10 mx-auto mb-3', isDragging ? 'text-accent' : 'text-text-soft')} />
            <p className="text-text font-medium mb-1">{isDragging ? t('dropFiles') : t('dragDrop')}</p>
            <p className="text-sm text-text-soft mb-4">{tCommon('or')}</p>
            <label>
              <input
                type="file"
                accept=".pdf,.docx,image/*"
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

          {/* Cloud Import Options - only for standard mode */}
          {!isPrivateMode && (
            <div className="flex gap-3">
              {hasGoogleDrive && (
                <button
                  onClick={() => setShowGoogleDrive(true)}
                  className="flex-1 flex items-center justify-center gap-2 p-3 border border-border rounded-scholar hover:bg-surface-alt transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.4 13.75z" fill="#ea4335"/>
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                  </svg>
                  <span className="text-sm font-medium text-text">{t('googleDrive')}</span>
                </button>
              )}
              {hasOneDrive && (
                <button
                  onClick={() => setShowOneDrive(true)}
                  className="flex-1 flex items-center justify-center gap-2 p-3 border border-border rounded-scholar hover:bg-surface-alt transition-colors"
                >
                  <Cloud className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-medium text-text">{t('oneDrive')}</span>
                </button>
              )}
              <button
                onClick={() => setShowZohalLibrary(true)}
                className="flex-1 flex items-center justify-center gap-2 p-3 border border-border rounded-scholar hover:bg-surface-alt transition-colors"
              >
                <Cloud className="w-5 h-5 text-accent" />
                <span className="text-sm font-medium text-text">{t('zohalLibrary')}</span>
              </button>
            </div>
          )}

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
                    <p className="text-sm font-medium text-text truncate">{fileItem.file.name}</p>
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
              {isPrivateMode
                ? t('analyzePrivately')
                : t('uploadCount', { count: pendingCount > 0 ? pendingCount : '' })}
            </Button>
          </div>
        </div>
      </Card>

      {showGoogleDrive && (
        <GoogleDrivePicker
          workspaceId={workspaceId}
          folderId={folderId}
          onClose={() => setShowGoogleDrive(false)}
          onImported={(documentId) => {
            setShowGoogleDrive(false);
            onUploaded(documentId);
          }}
        />
      )}

      {showOneDrive && (
        <OneDrivePicker
          workspaceId={workspaceId}
          folderId={folderId}
          onClose={() => setShowOneDrive(false)}
          onImported={(documentId) => {
            setShowOneDrive(false);
            onUploaded(documentId);
          }}
        />
      )}

      {showZohalLibrary && (
        <ZohalLibraryPicker
          onClose={() => setShowZohalLibrary(false)}
          onSelectFile={(file) => {
            setShowZohalLibrary(false);
            addFiles([file]);
          }}
        />
      )}
    </div>
  );
}
