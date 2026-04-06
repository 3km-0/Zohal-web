import type { DocumentType } from '@/types/database';
import {
  getTemplateGroup,
  getTemplateRecommendedDocumentTypes,
  playbookMatchesName,
  sortSystemPlaybooks,
} from '@/lib/template-library';
import type { TemplateLibraryPlaybookLike, TemplateRecord } from '@/types/templates';

type PlaybookLike = TemplateLibraryPlaybookLike & Pick<TemplateRecord, 'id' | 'current_version_id'>;

type DocumentMetadata = {
  documentType?: string | null;
  title?: string | null;
  originalFilename?: string | null;
};

function normalizedDocumentText(metadata: DocumentMetadata): string {
  return [metadata.title, metadata.originalFilename]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function containsAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

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
  const { documentType } = metadata;
  if (!documentType) return [];

  const searchableText = normalizedDocumentText(metadata);
  const complianceKeywords = ['policy', 'policies', 'regulation', 'regulatory', 'compliance', 'controls', 'framework', 'guideline', 'standard', 'procedure'];
  const onboardingKeywords = ['vendor onboarding', 'supplier onboarding', 'trade license', 'registration', 'vat certificate', 'iban', 'bank details', 'compliance certificate'];
  const logisticsKeywords = ['shipment', 'carrier', 'bill of lading', 'warehouse', 'delivery', 'container', 'tracking', 'supplier', 'procurement', 'vendor'];
  const healthcareKeywords = ['patient', 'lab result', 'discharge', 'medication', 'diagnosis', 'encounter', 'care plan'];
  const complianceTemplate = ['Policy & Regulatory Interface'];

  if (documentType === 'financial_report') {
    return ['Investor Reporting Dashboard'];
  }
  if (documentType === 'paper' || documentType === 'research') {
    return ['Research Synthesis Interface'];
  }
  if (documentType === 'textbook' || documentType === 'lecture_notes' || documentType === 'problem_set') {
    return ['Course Learning Interface'];
  }
  if (documentType === 'contract' || documentType === 'legal_filing' || documentType === 'policy') {
    return complianceTemplate;
  }
  if (documentType === 'invoice' || documentType === 'onboarding_doc') {
    return ['Logistics Operations Interface'];
  }
  if (containsAny(searchableText, complianceKeywords)) {
    return complianceTemplate;
  }
  if (containsAny(searchableText, logisticsKeywords) || containsAny(searchableText, onboardingKeywords)) {
    return ['Logistics Operations Interface'];
  }
  if (containsAny(searchableText, healthcareKeywords)) {
    return ['Healthcare Record Interface'];
  }

  return [];
}

export function selectRecommendedPlaybook<T extends PlaybookLike>(playbooks: T[], metadata: DocumentMetadata): T | null {
  const systemPlaybooks = sortSystemPlaybooks(playbooks.filter((playbook) => playbook.is_system_preset));
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

  return systemPlaybooks[0] ?? playbooks[0] ?? null;
}

function playbookTemplateId(playbook: PlaybookLike | null | undefined): string | null {
  const raw = playbook?.current_version?.spec_json?.template_id;
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  return normalized || null;
}

export function resolveRecommendedPlaybook<T extends PlaybookLike>(
  playbooks: T[],
  metadata: DocumentMetadata & { recommendedTemplateIds?: string[] | null }
): T | null {
  const normalizedRecommendedIds = (metadata.recommendedTemplateIds || [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  for (const recommendedId of normalizedRecommendedIds) {
    const classifierPlaybook =
      playbooks.find((playbook) => playbookTemplateId(playbook) === recommendedId) || null;
    if (classifierPlaybook) return classifierPlaybook;
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
