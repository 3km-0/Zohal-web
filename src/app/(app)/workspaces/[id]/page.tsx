'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Upload,
  FileText,
  MoreVertical,
  Trash2,
  Download,
  Eye,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button, Card, EmptyState, Spinner, Badge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import type { Workspace, Document, DocumentType, ProcessingStatus } from '@/types/database';
import { cn, formatRelativeTime, formatFileSize } from '@/lib/utils';
import { DocumentUploadModal } from '@/components/document/DocumentUploadModal';

// Document type icons
const documentIcons: Record<DocumentType, string> = {
  textbook: '📖',
  lecture_notes: '📝',
  problem_set: '📊',
  paper: '📄',
  personal_notes: '✏️',
  contract: '📜',
  financial_report: '💰',
  meeting_notes: '🗓️',
  invoice: '🧾',
  legal_filing: '⚖️',
  research: '🔬',
  other: '📁',
};

// Processing status colors
const statusColors: Record<ProcessingStatus, string> = {
  pending: 'bg-gray-500/10 text-gray-500',
  uploading: 'bg-blue-500/10 text-blue-500',
  processing: 'bg-amber-500/10 text-amber-500',
  chunked: 'bg-cyan-500/10 text-cyan-500',
  embedding: 'bg-purple-500/10 text-purple-500',
  completed: 'bg-success/10 text-success',
  failed: 'bg-error/10 text-error',
};

export default function WorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const t = useTranslations('documents');
  const supabase = createClient();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch workspace
    const { data: workspaceData } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (workspaceData) {
      setWorkspace(workspaceData);
    }

    // Fetch documents
    const { data: documentsData } = await supabase
      .from('documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (documentsData) {
      setDocuments(documentsData);
    }

    setLoading(false);
  }, [supabase, workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Are you sure you want to delete "${doc.title}"?`)) return;

    // Soft delete
    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', doc.id);

    if (!error) {
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    }
  };

  if (!workspace && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<FileText className="w-8 h-8" />}
          title="Workspace not found"
          description="The workspace you're looking for doesn't exist or has been deleted."
          action={{
            label: 'Go to Workspaces',
            onClick: () => router.push('/workspaces'),
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader
        title={workspace?.name || 'Loading...'}
        subtitle={workspace?.description || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/workspaces">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            <Button onClick={() => setShowUploadModal(true)}>
              <Upload className="w-4 h-4" />
              {t('upload')}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title={t('empty')}
            description={t('emptyDescription')}
            action={{
              label: t('upload'),
              onClick: () => setShowUploadModal(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                workspaceId={workspaceId}
                onDelete={() => handleDelete(doc)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <DocumentUploadModal
          workspaceId={workspaceId}
          onClose={() => setShowUploadModal(false)}
          onUploaded={() => {
            setShowUploadModal(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

interface DocumentCardProps {
  document: Document;
  workspaceId: string;
  onDelete: () => void;
}

function DocumentCard({ document: doc, workspaceId, onDelete }: DocumentCardProps) {
  const t = useTranslations('documents.types');
  const [showMenu, setShowMenu] = useState(false);

  const isProcessing = ['pending', 'uploading', 'processing', 'chunked', 'embedding'].includes(
    doc.processing_status
  );

  return (
    <Card
      className="relative group hover:-translate-y-0.5 hover:shadow-scholar transition-all duration-200"
      padding="none"
    >
      <Link
        href={`/workspaces/${workspaceId}/documents/${doc.id}`}
        className="block p-5"
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-12 h-12 bg-surface-alt border border-border rounded-scholar-lg flex items-center justify-center text-2xl flex-shrink-0">
            {documentIcons[doc.document_type || 'other']}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text truncate">{doc.title}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {doc.document_type && (
                <Badge size="sm">{t(doc.document_type)}</Badge>
              )}
              <Badge
                size="sm"
                variant={doc.processing_status === 'completed' ? 'success' : 'default'}
                className={cn(statusColors[doc.processing_status])}
              >
                {isProcessing && (
                  <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse mr-1" />
                )}
                {doc.processing_status}
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <p className="text-xs text-text-soft">
            {doc.page_count ? `${doc.page_count} pages • ` : ''}
            {doc.file_size_bytes ? formatFileSize(doc.file_size_bytes) : ''}
          </p>
          <p className="text-xs text-text-soft">
            {formatRelativeTime(doc.updated_at)}
          </p>
        </div>
      </Link>

      {/* Menu Button */}
      <div className="absolute top-3 right-3">
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowMenu(!showMenu);
          }}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-surface-alt transition-all"
        >
          <MoreVertical className="w-4 h-4 text-text-soft" />
        </button>

        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 mt-1 w-40 bg-surface border border-border rounded-scholar shadow-scholar-lg z-50 overflow-hidden animate-fade-in">
              <Link
                href={`/workspaces/${workspaceId}/documents/${doc.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
                onClick={() => setShowMenu(false)}
              >
                <Eye className="w-4 h-4" />
                View
              </Link>
              <hr className="border-border" />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowMenu(false);
                  onDelete();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

