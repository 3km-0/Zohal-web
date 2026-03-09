import type { DocumentType } from '@/types/database';
import { playbookMatchesName, sortSystemPlaybooks, type TemplateLibraryPlaybookLike } from '@/lib/template-library';

type PlaybookLike = TemplateLibraryPlaybookLike & {
  id: string;
  current_version_id?: string | null;
};

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
  if (
    documentType !== 'contract' &&
    documentType !== 'legal_filing' &&
    documentType !== 'policy' &&
    documentType !== 'invoice' &&
    documentType !== 'onboarding_doc'
  ) {
    return [];
  }

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

  if (documentType === 'invoice') {
    return ['Vendor Invoice Exceptions', 'General Contract Analysis'];
  }
  if (documentType === 'onboarding_doc' || containsAny(searchableText, onboardingKeywords)) {
    return ['Vendor Onboarding Review', 'General Contract Analysis'];
  }
  if (documentType === 'policy' || containsAny(searchableText, complianceKeywords)) {
    return ['Playbook / Compliance Review', 'Policy & Regulatory Compliance Review', 'General Contract Analysis'];
  }
  if (containsAny(searchableText, amendmentKeywords)) {
    return ['Amendment Conflict Review', 'General Contract Analysis'];
  }
  if (containsAny(searchableText, renewalKeywords)) {
    return ['Renewal Radar', 'Renewal Pack', 'Default (Renewal Pack)', 'General Contract Analysis'];
  }
  if (containsAny(searchableText, obligationKeywords)) {
    return ['Obligations Tracker', 'General Contract Analysis'];
  }
  if (containsAny(searchableText, leaseKeywords)) {
    return ['Commercial Lease Review', 'Lease Review', 'General Contract Analysis'];
  }
  if (containsAny(searchableText, employmentKeywords)) {
    return ['Employment Document Review', 'General Contract Analysis'];
  }
  if (containsAny(searchableText, insuranceKeywords)) {
    return ['Insurance Claims & Policy Review', 'General Contract Analysis'];
  }
  if (containsAny(searchableText, vendorKeywords)) {
    return ['General Contract Analysis', 'Vendor / SaaS Contract Review'];
  }
  if (documentType === 'legal_filing' || containsAny(searchableText, ksaKeywords)) {
    return ['KSA Contract Checklist (Contract-Only)', 'General Contract Analysis'];
  }

  return ['General Contract Analysis', 'Renewal Radar', 'Renewal Pack', 'Default (Renewal Pack)'];
}

export function selectRecommendedPlaybook<T extends PlaybookLike>(playbooks: T[], metadata: DocumentMetadata): T | null {
  const systemPlaybooks = sortSystemPlaybooks(playbooks.filter((playbook) => playbook.is_system_preset));
  const preferredNames = recommendedSystemPlaybookNames(metadata);

  for (const name of preferredNames) {
    const match = systemPlaybooks.find((playbook) => playbookMatchesName(playbook, name));
    if (match) return match;
  }

  return systemPlaybooks[0] ?? playbooks[0] ?? null;
}

export function supportsStructuredAnalysis(documentType?: DocumentType | string | null): boolean {
  return (
    documentType === 'contract' ||
    documentType === 'policy' ||
    documentType === 'legal_filing' ||
    documentType === 'financial_report' ||
    documentType === 'invoice' ||
    documentType === 'meeting_notes' ||
    documentType === 'onboarding_doc'
  );
}
