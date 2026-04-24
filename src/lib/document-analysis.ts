import type { DocumentType } from '@/types/database';
import {
  isHiddenSystemPlaybook,
  playbookMatchesName,
  sortSystemPlaybooks,
} from '@/lib/template-library';
import type { TemplateLibraryPlaybookLike, TemplateRecord } from '@/types/templates';

type PlaybookLike = TemplateLibraryPlaybookLike & Pick<TemplateRecord, 'id' | 'current_version_id'>;

const ACQUISITION_WORKSPACE_TEMPLATE_NAME = 'Acquisition Workspace';

type DocumentMetadata = {
  documentType?: string | null;
  title?: string | null;
  originalFilename?: string | null;
};

export function getAnalysisLabelKey(documentType?: string | null) {
  switch (documentType) {
    case 'contract':
      return 'contract';
    case 'legal_filing':
      return 'legalFiling';
    case 'financial_report':
      return 'financialReport';
    case 'invoice':
      return 'invoice';
    case 'meeting_notes':
      return 'meetingNotes';
    case 'textbook':
      return 'textbook';
    case 'lecture_notes':
      return 'lectureNotes';
    case 'problem_set':
      return 'problemSet';
    case 'paper':
      return 'paper';
    case 'personal_notes':
      return 'personalNotes';
    case 'budget':
      return 'budget';
    case 'research':
      return 'research';
    case 'sop':
      return 'sop';
    case 'onboarding_doc':
      return 'onboarding';
    default:
      return 'document';
  }
}

export function recommendedSystemPlaybookNames(metadata: DocumentMetadata): string[] {
  void metadata;
  return [ACQUISITION_WORKSPACE_TEMPLATE_NAME];
}

export function selectRecommendedPlaybook<T extends PlaybookLike>(playbooks: T[], metadata: DocumentMetadata): T | null {
  void metadata;
  const systemPlaybooks = sortSystemPlaybooks(
    playbooks.filter((playbook) => playbook.is_system_preset && !isHiddenSystemPlaybook(playbook))
  );
  const preferredNames = recommendedSystemPlaybookNames(metadata);

  for (const name of preferredNames) {
    const match = systemPlaybooks.find((playbook) => playbookMatchesName(playbook, name));
    if (match) return match;
  }

  return systemPlaybooks[0] ?? playbooks.find((playbook) => !playbook.is_system_preset) ?? playbooks[0] ?? null;
}

function playbookTemplateId(playbook: PlaybookLike | null | undefined): string | null {
  const spec = playbook?.current_version?.spec_json as Record<string, unknown> | undefined;
  if (!spec) return null;
  const top = spec.template_id;
  if (typeof top === 'string' && top.trim()) return top.trim().toLowerCase();
  const identity = spec.identity;
  if (identity && typeof identity === 'object' && !Array.isArray(identity)) {
    const id = (identity as Record<string, unknown>).template_id;
    if (typeof id === 'string' && id.trim()) return id.trim().toLowerCase();
  }
  return null;
}

export function resolveRecommendedPlaybook<T extends PlaybookLike>(
  playbooks: T[],
  metadata: DocumentMetadata & { recommendedTemplateIds?: string[] | null }
): T | null {
  void metadata.recommendedTemplateIds;
  const visibleSystemPlaybooks = sortSystemPlaybooks(
    playbooks.filter((playbook) => playbook.is_system_preset && !isHiddenSystemPlaybook(playbook))
  );
  const acquisitionWorkspacePlaybook = visibleSystemPlaybooks.find((playbook) =>
    playbookTemplateId(playbook) === 'acquisition_workspace'
  );
  if (acquisitionWorkspacePlaybook) return acquisitionWorkspacePlaybook;

  return selectRecommendedPlaybook(playbooks, metadata);
}

export function supportsStructuredAnalysis(documentType?: DocumentType | string | null): boolean {
  return (
    documentType === 'contract' ||
    documentType === 'policy' ||
    documentType === 'legal_filing' ||
    documentType === 'financial_report' ||
    documentType === 'invoice' ||
    documentType === 'meeting_notes' ||
    documentType === 'onboarding_doc' ||
    documentType === 'paper' ||
    documentType === 'research' ||
    documentType === 'textbook' ||
    documentType === 'lecture_notes' ||
    documentType === 'problem_set'
  );
}
