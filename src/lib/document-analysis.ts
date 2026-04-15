import type { DocumentType } from '@/types/database';
import {
  isHiddenSystemPlaybook,
  getTemplateRecommendedDocumentTypes,
  playbookMatchesName,
  sortSystemPlaybooks,
} from '@/lib/template-library';
import type { TemplateLibraryPlaybookLike, TemplateRecord } from '@/types/templates';

type PlaybookLike = TemplateLibraryPlaybookLike & Pick<TemplateRecord, 'id' | 'current_version_id'>;

const ASSET_RADAR_TEMPLATE_NAME = 'Real Estate Portfolio Tracker';

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
  return [ASSET_RADAR_TEMPLATE_NAME];
}

export function selectRecommendedPlaybook<T extends PlaybookLike>(playbooks: T[], metadata: DocumentMetadata): T | null {
  const systemPlaybooks = sortSystemPlaybooks(
    playbooks.filter((playbook) => playbook.is_system_preset && !isHiddenSystemPlaybook(playbook))
  );
  const normalizedDocumentType = String(metadata.documentType || '').trim().toLowerCase();
  if (normalizedDocumentType) {
    const metadataRecommended = [...systemPlaybooks]
      .map((playbook) => {
        const recommendedTypes = getTemplateRecommendedDocumentTypes(playbook);
        if (!recommendedTypes.includes(normalizedDocumentType)) return { playbook, score: -1 };
        return {
          playbook,
          score: 100,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    if (metadataRecommended[0]) return metadataRecommended[0].playbook;
  }
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

const LEGACY_RECOMMENDED_TEMPLATE_ID: Record<string, string> = {
  research_synthesis_site: 'research_synthesis_interface',
  course_learning_portal: 'course_learning_interface',
  healthcare_record_surface: 'healthcare_record_interface',
  logistics_operations_portal: 'logistics_operations_interface',
  portfolio_monitoring_workspace: 'family_office_portfolio_monitor',
  credit_covenant_monitoring: 'startup_cfo_workspace',
};

export function resolveRecommendedPlaybook<T extends PlaybookLike>(
  playbooks: T[],
  metadata: DocumentMetadata & { recommendedTemplateIds?: string[] | null }
): T | null {
  const visibleSystemPlaybooks = sortSystemPlaybooks(
    playbooks.filter((playbook) => playbook.is_system_preset && !isHiddenSystemPlaybook(playbook))
  );
  const normalizedRecommendedIds = (metadata.recommendedTemplateIds || [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  for (const recommendedId of normalizedRecommendedIds) {
    const candidates = Array.from(
      new Set([recommendedId, LEGACY_RECOMMENDED_TEMPLATE_ID[recommendedId]].filter(Boolean) as string[]),
    );
    for (const id of candidates) {
      const classifierPlaybook =
        visibleSystemPlaybooks.find((playbook) => playbookTemplateId(playbook) === id) || null;
      if (classifierPlaybook) return classifierPlaybook;
    }
  }

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
