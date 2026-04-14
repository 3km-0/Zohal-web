import type { DocumentType } from '@/types/database';
import {
  isHiddenSystemPlaybook,
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
  const realEstateKeywords = [
    'lease',
    'lease amendment',
    'rent roll',
    'tenant',
    'landlord',
    'payment ledger',
    'receivables ledger',
    'arrears',
    'vacancy',
    'lease renewal',
    'tenant renewal',
    'noi ',
    'net operating income',
    'premises',
  ];
  const retailKeywords = ['restaurant', 'pos ', 'food cost', 'menu', 'retail margin'];
  const privateMarketsKeywords = [
    'capital call',
    'capital contribution notice',
    'distribution notice',
    'side letter',
    'drawdown notice',
    'subscription agreement',
    'unfunded commitment',
    'manager letter',
    'limited partner notice',
  ];
  const fundKeywords = ['lp letter', 'capital account', 'dpi', 'tvpi', 'fund report', 'commitment pacing'];
  const boardKeywords = ['board pack', 'management pack', 'management accounts', 'lender report', 'budget vs actual', 'variance'];
  const shipmentKeywords = ['bill of lading', 'packing list', 'arrival notice', 'freight forwarder', 'container', 'shipment'];
  const customsKeywords = ['customs declaration', 'certificate of origin', 'hs code', 'tariff', 'duty', 'broker'];
  const constructionKeywords = ['delivery note', 'site receipt', 'site delivery', 'subcontractor', 'project schedule', 'material shortage'];
  const healthcareKeywords = ['lab report', 'blood test', 'patient', 'biomarker', 'clinician note', 'visit summary'];
  const educationKeywords = ['syllabus', 'lecture notes', 'study guide', 'question bank', 'flashcard', 'spaced repetition'];
  const quantKeywords = ['backtest', 'sharpe', 'factor model', 'value at risk', 'cointegration', 'monte carlo'];
  const researchKeywords = ['literature review', 'systematic review', 'meta-analysis', 'preprint', 'citation graph', 'research synthesis'];
  const hospitalityKeywords = ['night audit', 'folio', 'revpar', 'pms export', 'room charge', 'shift handover'];

  if (containsAny(searchableText, boardKeywords)) {
    return ['Board Pack Radar'];
  }
  if (containsAny(searchableText, realEstateKeywords)) {
    return ['Real Estate Portfolio Tracker'];
  }
  if (containsAny(searchableText, retailKeywords)) {
    return ['Retail / F&B Owner Margin Intelligence Workspace'];
  }
  if (containsAny(searchableText, customsKeywords)) {
    return ['Customs & Trade Compliance Workspace'];
  }
  if (containsAny(searchableText, constructionKeywords)) {
    return ['Construction Materials & Site Delivery Workspace'];
  }
  if (containsAny(searchableText, shipmentKeywords)) {
    return ['Import / Export Shipment Control Tower'];
  }
  if (containsAny(searchableText, hospitalityKeywords)) {
    return ['Hospitality Night Audit Workspace'];
  }
  if (containsAny(searchableText, healthcareKeywords)) {
    return ['Lab Reports -> Patient Biomarker Dashboard'];
  }
  if (containsAny(searchableText, quantKeywords)) {
    return ['Quant Research Workspace'];
  }
  if (containsAny(searchableText, researchKeywords) || documentType === 'paper' || documentType === 'research') {
    return ['Literature Review & Research Synthesis Workspace'];
  }
  if (
    containsAny(searchableText, educationKeywords) ||
    documentType === 'textbook' ||
    documentType === 'lecture_notes' ||
    documentType === 'problem_set'
  ) {
    return ['Adaptive Quiz & Spaced Repetition Learning Workspace'];
  }
  if (containsAny(searchableText, privateMarketsKeywords)) {
    return ['Private Markets Obligations & Liquidity Workspace'];
  }
  if (containsAny(searchableText, fundKeywords)) {
    return ['Saudi Family Office Portfolio Monitor'];
  }
  if (documentType === 'financial_report') {
    return ['Public Company Intelligence Workspace'];
  }
  if (documentType === 'contract' || documentType === 'legal_filing' || documentType === 'policy') {
    return ['PE Diligence Data Room Workspace'];
  }
  if (documentType === 'invoice' || documentType === 'onboarding_doc') {
    return ['WhatsApp Receipts to SMB Cash Flow Workspace'];
  }

  return [];
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
  private_markets_allocator_workspace: 'private_markets_obligations_liquidity_workspace',
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
