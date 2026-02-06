import type { Document, Workspace } from '@/types/database';

const QUESTION_PATTERNS: RegExp[] = [
  /^(what|who|where|when|why|how|which|can|could|would|should|is|are|do|does|did|will|was|were)/i,
  /\?$/,
  /^(explain|describe|tell me|show me)/i,
];

export function isQuestionQuery(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return QUESTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function getWorkspaceFilterChips(workspaces: Workspace[], maxCount = 5): Workspace[] {
  return workspaces.slice(0, Math.max(0, maxCount));
}

export function shouldShowDocumentInCurrentFolder(
  document: Pick<Document, 'deleted_at' | 'storage_path' | 'folder_id'>,
  currentFolderId: string | null
): boolean {
  const inCurrentFolder = currentFolderId
    ? document.folder_id === currentFolderId
    : !document.folder_id;

  return document.deleted_at == null && document.storage_path !== 'local' && inCurrentFolder;
}

export function isWorkspaceReadOnly(accessRole?: string | null): boolean {
  const role = accessRole?.toLowerCase().trim();
  if (!role) return false;
  return role !== 'owner' && role !== 'editor';
}

export function canManageWorkspace(accessRole?: string | null): boolean {
  const role = accessRole?.toLowerCase().trim();
  if (!role) return true;
  return role === 'owner';
}
