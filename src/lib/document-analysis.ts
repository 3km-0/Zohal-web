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
  const leaseKeywords = ['lease', 'tenant', 'landlord', 'rent', 'rental', 'property', 'real estate', 'tenancy', 'premises', 'sublease'];
  const vendorKeywords = ['vendor', 'supplier', 'procurement', 'software', 'saas', 'cloud', 'subscription', 'license', 'licensing', 'service agreement', 'services agreement', 'master service', 'msa', 'sow', 'statement of work', 'dpa', 'sla', 'implementation'];
  const renewalKeywords = ['renewal', 'renew', 'auto renew', 'auto-renew', 'expiration', 'expiry', 'notice period', 'non-renewal', 'extension'];
  const amendmentKeywords = ['amendment', 'amended', 'addendum', 'addenda', 'side letter', 'side-letter', 'amended and restated', 'supplement'];
  const obligationKeywords = ['obligation', 'obligations', 'deliverable', 'deliverables', 'milestone', 'service level', 'reporting', 'covenant', 'deadline', 'notice'];
  const complianceKeywords = ['policy', 'policies', 'regulation', 'regulatory', 'compliance', 'controls', 'framework', 'guideline', 'standard', 'procedure'];
  const employmentKeywords = ['employment', 'employee', 'employer', 'offer letter', 'probation', 'termination', 'salary', 'compensation', 'leave'];
  const insuranceKeywords = ['insurance', 'claim', 'claims', 'coverage', 'endorsement', 'deductible', 'insurer', 'policy number'];
  const onboardingKeywords = ['vendor onboarding', 'supplier onboarding', 'trade license', 'registration', 'vat certificate', 'iban', 'bank details', 'compliance certificate'];
  const ksaKeywords = ['ksa', 'saudi', 'saudi arabia', 'riyadh', 'jeddah', 'sar', 'المملكة', 'السعودية', 'وزارة', 'هيئة'];
  const broadContract = ['Contract Compliance Workspace'];
  const renewalFocused = ['Renewal Radar', 'Contract Compliance Workspace'];

  if (documentType === 'financial_report') {
    return ['Investor Reporting Dashboard'];
  }
  if (documentType === 'paper' || documentType === 'research') {
    return ['Research Synthesis Site'];
  }
  if (documentType === 'textbook' || documentType === 'lecture_notes' || documentType === 'problem_set') {
    return ['Course Learning Portal'];
  }
  if (documentType === 'invoice') {
    return ['Vendor Invoice Exceptions', ...broadContract];
  }
  if (documentType === 'onboarding_doc' || containsAny(searchableText, onboardingKeywords)) {
    return ['Vendor Onboarding Review', ...broadContract];
  }
  if (documentType === 'policy' || containsAny(searchableText, complianceKeywords)) {
    return ['Policy & Regulatory Portal', ...broadContract];
  }
  if (containsAny(searchableText, amendmentKeywords)) {
    return ['Amendment Conflict Review', ...broadContract];
  }
  if (containsAny(searchableText, renewalKeywords)) {
    return renewalFocused;
  }
  if (containsAny(searchableText, obligationKeywords)) {
    return broadContract;
  }
  if (containsAny(searchableText, leaseKeywords)) {
    return ['Commercial Lease Review', ...broadContract];
  }
  if (containsAny(searchableText, employmentKeywords)) {
    return broadContract;
  }
  if (containsAny(searchableText, insuranceKeywords)) {
    return broadContract;
  }
  if (containsAny(searchableText, vendorKeywords)) {
    return [...broadContract, 'Vendor / SaaS Contract Review'];
  }
  if (documentType === 'legal_filing' || containsAny(searchableText, ksaKeywords)) {
    return ['KSA Contract Checklist (Contract-Only)', ...broadContract];
  }

  if (documentType === 'contract' || documentType === 'legal_filing' || documentType === 'policy') {
    return [...broadContract, 'Renewal Radar'];
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
        const group = getTemplateGroup(playbook);
        return {
          playbook,
          score: group === 'specializations' ? 200 : 100,
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
