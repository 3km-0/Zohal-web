import { describe, expect, it } from 'vitest';
import {
  canManageWorkspace,
  getWorkspaceFilterChips,
  isQuestionQuery,
  isWorkspaceReadOnly,
  shouldShowDocumentInCurrentFolder,
} from './workspace-logic';

describe('workspace-logic', () => {
  it('detects question queries', () => {
    expect(isQuestionQuery('What is the renewal date')).toBe(true);
    expect(isQuestionQuery('explain this clause')).toBe(true);
    expect(isQuestionQuery('renewal deadline?')).toBe(true);
    expect(isQuestionQuery('renewal deadline and obligations')).toBe(false);
  });

  it('limits workspace chips safely', () => {
    const chips = getWorkspaceFilterChips(
      Array.from({ length: 7 }).map((_, idx) => ({ id: String(idx) } as any)),
      5
    );
    expect(chips).toHaveLength(5);
  });

  it('applies document visibility filtering for current folder', () => {
    const rootDoc = {
      deleted_at: null,
      storage_path: 'documents/abc.pdf',
      folder_id: null,
    };
    const localOnlyDoc = {
      deleted_at: null,
      storage_path: 'local',
      folder_id: null,
    };
    const wrongFolderDoc = {
      deleted_at: null,
      storage_path: 'documents/abc.pdf',
      folder_id: 'folder-2',
    };

    expect(shouldShowDocumentInCurrentFolder(rootDoc as any, null)).toBe(true);
    expect(shouldShowDocumentInCurrentFolder(localOnlyDoc as any, null)).toBe(false);
    expect(shouldShowDocumentInCurrentFolder(wrongFolderDoc as any, 'folder-1')).toBe(false);
  });

  it('maps workspace access permissions', () => {
    expect(isWorkspaceReadOnly('viewer')).toBe(true);
    expect(isWorkspaceReadOnly('editor')).toBe(false);
    expect(canManageWorkspace('owner')).toBe(true);
    expect(canManageWorkspace('editor')).toBe(false);
    expect(canManageWorkspace(undefined)).toBe(true);
  });
});
