import type { DocumentType } from '@/types/database';

type PlaybookLike = {
  id: string;
  name: string;
  is_system_preset?: boolean;
};

type DocumentMetadata = {
  documentType?: string | null;
  title?: string | null;
  originalFilename?: string | null;
};

const PLAYBOOK_ALIASES = {
  general: ['General Contract Analysis'],
  renewal: ['Renewal Pack', 'Default (Renewal Pack)'],
  vendor: ['Vendor / SaaS Contract Review'],
  ksa: ['KSA Contract Checklist (Contract-Only)'],
  lease: ['Lease Review'],
  compliance: ['Policy & Regulatory Compliance Review'],
} as const;

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
  if (documentType !== 'contract' && documentType !== 'legal_filing' && documentType !== 'policy') {
    return [];
  }

  const searchableText = normalizedDocumentText(metadata);
  const leaseKeywords = ['lease', 'tenant', 'landlord', 'rent', 'rental', 'property', 'real estate', 'tenancy', 'premises', 'sublease'];
  const vendorKeywords = ['vendor', 'supplier', 'procurement', 'software', 'saas', 'cloud', 'subscription', 'license', 'licensing', 'service agreement', 'services agreement', 'master service', 'msa', 'sow', 'statement of work', 'dpa', 'sla', 'implementation'];
  const renewalKeywords = ['renewal', 'renew', 'auto renew', 'auto-renew', 'expiration', 'expiry', 'notice period', 'non-renewal', 'extension'];
  const complianceKeywords = ['policy', 'policies', 'regulation', 'regulatory', 'compliance', 'controls', 'framework', 'guideline', 'standard', 'procedure'];
  const ksaKeywords = ['ksa', 'saudi', 'saudi arabia', 'riyadh', 'jeddah', 'sar', 'المملكة', 'السعودية', 'وزارة', 'هيئة'];

  if (documentType === 'policy' || containsAny(searchableText, complianceKeywords)) {
    return [...PLAYBOOK_ALIASES.compliance, ...PLAYBOOK_ALIASES.general];
  }
  if (containsAny(searchableText, leaseKeywords)) {
    return [...PLAYBOOK_ALIASES.lease, ...PLAYBOOK_ALIASES.general];
  }
  if (containsAny(searchableText, vendorKeywords)) {
    return [...PLAYBOOK_ALIASES.vendor, ...PLAYBOOK_ALIASES.general];
  }
  if (containsAny(searchableText, renewalKeywords)) {
    return [...PLAYBOOK_ALIASES.renewal, ...PLAYBOOK_ALIASES.general];
  }
  if (documentType === 'legal_filing' || containsAny(searchableText, ksaKeywords)) {
    return [...PLAYBOOK_ALIASES.ksa, ...PLAYBOOK_ALIASES.general];
  }

  return [...PLAYBOOK_ALIASES.general, ...PLAYBOOK_ALIASES.renewal];
}

export function selectRecommendedPlaybook<T extends PlaybookLike>(playbooks: T[], metadata: DocumentMetadata): T | null {
  const systemPlaybooks = playbooks.filter((playbook) => playbook.is_system_preset);
  const preferredNames = recommendedSystemPlaybookNames(metadata);

  for (const name of preferredNames) {
    const match = systemPlaybooks.find((playbook) => playbook.name === name);
    if (match) return match;
  }

  return systemPlaybooks[0] ?? playbooks[0] ?? null;
}

export function supportsStructuredAnalysis(documentType?: DocumentType | string | null): boolean {
  return (
    documentType === 'contract' ||
    documentType === 'legal_filing' ||
    documentType === 'financial_report' ||
    documentType === 'invoice' ||
    documentType === 'meeting_notes'
  );
}
