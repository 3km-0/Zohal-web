'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  X,
  Link2,
  Copy,
  Check,
  Share2,
  FileText,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Document } from '@/types/database';

interface ShareDocumentModalProps {
  document: Document;
  workspaceId: string;
  onClose: () => void;
}

export function ShareDocumentModal({
  document,
  workspaceId,
  onClose,
}: ShareDocumentModalProps) {
  const t = useTranslations('document');
  const tCommon = useTranslations('common');
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Generate a signed URL for the document
  const generateShareLink = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check if this is a privacy mode document
      if (document.privacy_mode) {
        setError('Privacy mode documents cannot be shared. The PDF is stored locally only.');
        setLoading(false);
        return;
      }

      // Get a signed URL for the document (valid for 1 hour)
      const { data, error: signedUrlError } = await supabase.storage
        .from(document.storage_bucket)
        .createSignedUrl(document.storage_path, 3600); // 1 hour expiry

      if (signedUrlError) {
        throw signedUrlError;
      }

      if (data?.signedUrl) {
        setShareUrl(data.signedUrl);
      }
    } catch (err) {
      console.error('Failed to generate share link:', err);
      setError('Failed to generate share link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Copy link to clipboard
  const copyToClipboard = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setError('Failed to copy link to clipboard');
    }
  };

  // Use native share API if available
  const nativeShare = async () => {
    if (!shareUrl) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title,
          text: `Check out this document: ${document.title}`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or share failed - not an error
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      // Fallback to copy
      copyToClipboard();
    }
  };

  // Check if Web Share API is available
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <Card className="relative w-full max-w-md z-10 animate-slide-up" padding="none">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg">
              <Share2 className="w-5 h-5 text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-text">Share Document</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5 text-text-soft" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Document Info */}
          <div className="flex items-center gap-3 p-3 bg-surface-alt rounded-xl">
            <div className="p-2 bg-surface rounded-lg">
              <FileText className="w-5 h-5 text-text-soft" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-text truncate">{document.title}</p>
              <p className="text-sm text-text-soft">
                {document.page_count ? `${document.page_count} pages` : 'PDF Document'}
              </p>
            </div>
          </div>

          {/* Privacy Mode Warning */}
          {document.privacy_mode && (
            <div className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/20 rounded-xl">
              <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-warning">Privacy Mode Enabled</p>
                <p className="text-sm text-text-soft mt-1">
                  This document was uploaded in privacy mode. The PDF is stored locally
                  and cannot be shared via link.
                </p>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-sm text-error">
              {error}
            </div>
          )}

          {/* Share URL Display */}
          {shareUrl && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-surface-alt rounded-xl border border-border">
                <Link2 className="w-4 h-4 text-text-soft flex-shrink-0" />
                <p className="text-sm text-text truncate flex-1">{shareUrl}</p>
              </div>
              <p className="text-xs text-text-soft text-center">
                This link expires in 1 hour
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {!shareUrl ? (
              <Button
                className="w-full"
                onClick={generateShareLink}
                isLoading={loading}
                disabled={document.privacy_mode}
              >
                <Link2 className="w-4 h-4" />
                Generate Share Link
              </Button>
            ) : (
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Link
                    </>
                  )}
                </Button>
                {canNativeShare && (
                  <Button className="flex-1" onClick={nativeShare}>
                    <Share2 className="w-4 h-4" />
                    Share
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-0">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            {tCommon('close')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
