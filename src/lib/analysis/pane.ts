import type { AIConfidence, EvidenceGradeSnapshot } from '@/types/evidence-grade';

export interface FindingToolAction {
  type: 'calendar' | 'edit' | 'task';
  label: string;
}

export interface FindingCardModel {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  severity?: string;
  confidence?: AIConfidence;
  needsAttention?: boolean;
  attentionLabel?: string;
  spotCheckSuggested?: boolean;
  evidence?: { page_number?: number; snippet?: string; document_id?: string };
  sourceHref?: string | null;
  sourcePage?: number;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  groupKey?: string;
  toolAction?: FindingToolAction;
}

export interface SummaryMetric {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export interface SummarySectionModel {
  id: string;
  title: string;
  items: Array<{
    id: string;
    label: string;
    value: string;
    href?: string | null;
  }>;
}

export type SummaryRendererKind = 'contract' | 'generic' | 'renewal' | 'invoice';
export type ModuleRendererKind =
  | 'generic'
  | 'renewal_actions'
  | 'amendment_conflicts'
  | 'compliance_deviations'
  | 'invoice_exceptions';

export interface AnalysisModuleDescriptor {
  id: string;
  title: string;
  kind: 'core' | 'custom';
  renderer: ModuleRendererKind;
  hasOutput: boolean;
  enabled: boolean;
  order: number;
}

export interface AnalysisTabDescriptor {
  id: string;
  kind: 'summary' | 'module' | 'records' | 'verdicts' | 'exceptions';
  moduleId?: string;
  count: number | null;
  attentionCount: number;
}

export type ModuleRendererRegistry = Record<string, ModuleRendererKind>;

const CONTRACT_OVERVIEW_TEMPLATE_IDS = new Set([
  'contract_analysis',
  'lease_pack',
  'vendor_contracts_pack',
  'amendment_conflict_review',
  'obligations_tracker',
  'playbook_compliance_review',
]);

const SUMMARY_RENDERERS: Record<string, SummaryRendererKind> = {
  renewal_pack: 'renewal',
  vendor_invoice_exceptions: 'invoice',
};

const MODULE_RENDERERS: ModuleRendererRegistry = {
  'renewal_pack:renewal_actions': 'renewal_actions',
  'amendment_conflict_review:amendment_conflicts': 'amendment_conflicts',
  'playbook_compliance_review:compliance_deviations': 'compliance_deviations',
  'vendor_invoice_exceptions:invoice_exceptions': 'invoice_exceptions',
  renewal_actions: 'renewal_actions',
  amendment_conflicts: 'amendment_conflicts',
  compliance_deviations: 'compliance_deviations',
  invoice_exceptions: 'invoice_exceptions',
};

const CORE_MODULE_ORDER = ['variables', 'clauses', 'obligations', 'deadlines', 'risks'] as const;
const CORE_MODULE_SET = new Set<string>(CORE_MODULE_ORDER);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function titleCaseFromId(value: string): string {
  return value
    .split(/[_:\-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeEvidence(value: unknown): FindingCardModel['evidence'] | undefined {
  const source = Array.isArray(value) ? value[0] : value;
  const raw = asObject(source);
  const pageNumber = typeof raw.page_number === 'number' ? raw.page_number : undefined;
  const snippet = asString(raw.source_quote) || asString(raw.snippet) || undefined;
  const documentId = asString(raw.document_id) || undefined;
  if (!pageNumber && !snippet && !documentId) return undefined;
  return {
    page_number: pageNumber,
    snippet,
    document_id: documentId,
  };
}

function flattenResultItems(result: unknown): Array<{ id: string; raw: unknown }> {
  if (Array.isArray(result)) {
    return result.map((raw, index) => ({ id: String(index), raw }));
  }

  const objectResult = asObject(result);
  const arrayEntries = Object.entries(objectResult).filter(([, value]) => Array.isArray(value));
  if (arrayEntries.length === 1) {
    return (arrayEntries[0][1] as unknown[]).map((raw, index) => ({
      id: `${arrayEntries[0][0]}:${index}`,
      raw,
    }));
  }

  if (arrayEntries.length > 1) {
    return arrayEntries.flatMap(([key, value]) =>
      (value as unknown[]).map((raw, index) => ({ id: `${key}:${index}`, raw }))
    );
  }

  if (Object.keys(objectResult).length > 0) {
    return [{ id: '0', raw: objectResult }];
  }

  return [];
}

function toMetadata(record: Record<string, unknown>, omit: Set<string>) {
  const metadata: Record<string, string | number | boolean | null | undefined> = {};
  for (const [key, value] of Object.entries(record)) {
    if (omit.has(key)) continue;
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      metadata[titleCaseFromId(key)] = value;
    }
  }
  return Object.keys(metadata).length ? metadata : undefined;
}

export function getSnapshotTemplateId(snapshot: EvidenceGradeSnapshot | null | undefined): string {
  const pack = asObject(snapshot?.pack);
  return asString(pack.template_id) || asString(snapshot?.template) || 'contract_analysis';
}

export function isContractOverviewTemplate(templateId: string | null | undefined): boolean {
  if (!templateId) return false;
  return CONTRACT_OVERVIEW_TEMPLATE_IDS.has(templateId);
}

export function selectSummaryRenderer(templateId: string | null | undefined): SummaryRendererKind {
  if (templateId && SUMMARY_RENDERERS[templateId]) return SUMMARY_RENDERERS[templateId];
  return isContractOverviewTemplate(templateId) ? 'contract' : 'generic';
}

export function selectModuleRenderer(templateId: string | null | undefined, moduleId: string): ModuleRendererKind {
  const templateKey = templateId ? `${templateId}:${moduleId}` : '';
  if (templateKey && MODULE_RENDERERS[templateKey]) return MODULE_RENDERERS[templateKey];
  return MODULE_RENDERERS[moduleId] || 'generic';
}

export function deriveModuleDescriptors(snapshot: EvidenceGradeSnapshot | null | undefined): AnalysisModuleDescriptor[] {
  const pack = asObject(snapshot?.pack);
  const playbook = asObject(pack.playbook);
  const modulesMap = asObject(pack.modules);
  const modulesV2 = Array.isArray(playbook.modules_v2) ? playbook.modules_v2 : [];
  const modulesEnabled = Array.isArray(playbook.modules_enabled)
    ? playbook.modules_enabled
    : Array.isArray(playbook.modules)
      ? playbook.modules
      : [];

  const descriptors = new Map<string, AnalysisModuleDescriptor>();

  modulesV2.forEach((rawModule, index) => {
    const moduleSpec = asObject(rawModule);
    const id = asString(moduleSpec.id);
    if (!id || CORE_MODULE_SET.has(id)) return;
    descriptors.set(id, {
      id,
      title: asString(moduleSpec.title) || titleCaseFromId(id),
      kind: 'custom',
      renderer: selectModuleRenderer(getSnapshotTemplateId(snapshot), id),
      hasOutput: Object.prototype.hasOwnProperty.call(modulesMap, id),
      enabled: moduleSpec.enabled !== false,
      order: index,
    });
  });

  modulesEnabled.forEach((rawId, index) => {
    const id = asString(rawId);
    if (!id || CORE_MODULE_SET.has(id)) return;
    const existing = descriptors.get(id);
    descriptors.set(id, {
      id,
      title: existing?.title || asString(asObject(modulesMap[id]).title) || titleCaseFromId(id),
      kind: 'custom',
      renderer: selectModuleRenderer(getSnapshotTemplateId(snapshot), id),
      hasOutput: Object.prototype.hasOwnProperty.call(modulesMap, id),
      enabled: true,
      order: existing?.order ?? 100 + index,
    });
  });

  Object.entries(modulesMap).forEach(([id, rawValue], index) => {
    if (CORE_MODULE_SET.has(id)) return;
    const existing = descriptors.get(id);
    const moduleOutput = asObject(rawValue);
    descriptors.set(id, {
      id,
      title: existing?.title || asString(moduleOutput.title) || titleCaseFromId(id),
      kind: 'custom',
      renderer: selectModuleRenderer(getSnapshotTemplateId(snapshot), id),
      hasOutput: true,
      enabled: existing?.enabled ?? true,
      order: existing?.order ?? 200 + index,
    });
  });

  return Array.from(descriptors.values())
    .filter((descriptor) => descriptor.enabled)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function deriveTabDescriptors(args: {
  summaryCount?: number | null;
  enabledCoreModules: Set<string>;
  moduleDescriptors: AnalysisModuleDescriptor[];
  counts: Partial<Record<string, number>>;
  attentionCounts: Partial<Record<string, number>>;
  hasRecords: boolean;
  recordCount: number;
  hasVerdicts: boolean;
  verdictCount: number;
  verdictAttentionCount: number;
  hasExceptions: boolean;
  exceptionCount: number;
  exceptionAttentionCount: number;
}): AnalysisTabDescriptor[] {
  const {
    summaryCount = null,
    enabledCoreModules,
    moduleDescriptors,
    counts,
    attentionCounts,
    hasRecords,
    recordCount,
    hasVerdicts,
    verdictCount,
    verdictAttentionCount,
    hasExceptions,
    exceptionCount,
    exceptionAttentionCount,
  } = args;

  const tabs: AnalysisTabDescriptor[] = [{ id: 'overview', kind: 'summary', count: summaryCount, attentionCount: 0 }];

  for (const moduleId of CORE_MODULE_ORDER) {
    if (!enabledCoreModules.has(moduleId)) continue;
    tabs.push({
      id: moduleId,
      kind: 'module',
      moduleId,
      count: counts[moduleId] ?? 0,
      attentionCount: attentionCounts[moduleId] ?? 0,
    });
  }

  for (const descriptor of moduleDescriptors) {
    tabs.push({
      id: `module:${descriptor.id}`,
      kind: 'module',
      moduleId: descriptor.id,
      count: counts[descriptor.id] ?? (descriptor.hasOutput ? null : 0),
      attentionCount: attentionCounts[descriptor.id] ?? 0,
    });
  }

  if (hasRecords) {
    tabs.push({ id: 'records', kind: 'records', count: recordCount, attentionCount: attentionCounts.records ?? 0 });
  }
  if (hasVerdicts) {
    tabs.push({ id: 'verdicts', kind: 'verdicts', count: verdictCount, attentionCount: verdictAttentionCount });
  }
  if (hasExceptions) {
    tabs.push({ id: 'exceptions', kind: 'exceptions', count: exceptionCount, attentionCount: exceptionAttentionCount });
  }

  return tabs;
}

export function moduleResultToFindingCards(args: {
  moduleId: string;
  moduleTitle: string;
  result: unknown;
  evidence?: unknown;
  moduleConfidence?: AIConfidence | null;
}): FindingCardModel[] {
  const { moduleId, moduleTitle, result, evidence, moduleConfidence } = args;
  return flattenResultItems(result).map(({ id, raw }, index) => {
    const record = asObject(raw);
    const fallbackTitle = `${moduleTitle} ${index + 1}`;
    const title =
      asString(record.title) ||
      asString(record.name) ||
      asString(record.label) ||
      asString(record.summary) ||
      asString(record.message) ||
      fallbackTitle;
    const body =
      asString(record.description) ||
      asString(record.details) ||
      asString(record.explanation) ||
      asString(record.rationale) ||
      (typeof raw === 'string' ? raw : undefined);
    const severity = asString(record.severity) || asString(record.risk_level) || asString(record.status) || undefined;
    const confidenceRaw = asString(record.confidence) || asString(record.ai_confidence) || moduleConfidence || undefined;
    const confidence = confidenceRaw === 'high' || confidenceRaw === 'low' || confidenceRaw === 'medium'
      ? confidenceRaw
      : undefined;
    const groupKey =
      asString(record.kind) ||
      asString(record.type) ||
      asString(record.category) ||
      severity ||
      undefined;
    const itemEvidence = normalizeEvidence(record.evidence) || normalizeEvidence(Array.isArray(evidence) ? evidence[index] || evidence[0] : evidence);
    const subtitle =
      asString(record.subtitle) ||
      asString(record.status) ||
      (asString(record.due_date) ? `Due ${asString(record.due_date)}` : null) ||
      undefined;
    const metadata = toMetadata(record, new Set([
      'title',
      'name',
      'label',
      'summary',
      'message',
      'description',
      'details',
      'explanation',
      'rationale',
      'severity',
      'risk_level',
      'status',
      'confidence',
      'ai_confidence',
      'subtitle',
      'evidence',
    ]));

    return {
      id: `${moduleId}::${id}`,
      title,
      subtitle,
      body,
      severity,
      confidence,
      evidence: itemEvidence,
      metadata,
      groupKey,
      needsAttention: severity === 'high' || severity === 'critical' || asString(record.status) === 'blocked',
    };
  });
}

export function recordsToFindingCards(records: Array<Record<string, unknown>>): FindingCardModel[] {
  return records.map((record, index) => {
    const title =
      asString(record.title) ||
      asString(record.summary) ||
      asString(record.record_type) ||
      `Record ${index + 1}`;
    const body =
      asString(record.summary) ||
      asString(record.rationale) ||
      asString(record.description) ||
      undefined;
    const severity = asString(record.severity) || asString(record.status) || undefined;
    const metadata = toMetadata(asObject(record.fields), new Set());
    return {
      id: asString(record.id) || `record:${index}`,
      title,
      body,
      severity,
      evidence: normalizeEvidence(record.evidence),
      metadata,
      groupKey: asString(record.record_type) || undefined,
      needsAttention: asString(record.status) === 'open' || severity === 'warning' || severity === 'blocker',
      attentionLabel: asString(record.status) === 'open' ? 'Open' : undefined,
    };
  });
}
