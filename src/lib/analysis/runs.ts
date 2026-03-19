import type { Database } from '@/types/supabase';
import type {
  AnalysisRunDocsetMode,
  AnalysisRunMemberRole,
  AnalysisRunPrecedencePolicy,
  AnalysisRunScope,
  AnalysisRunStatus,
  AnalysisRunSummary,
  RememberedRelatedDocuments,
} from '@/types/analysis-runs';

type ExtractionRunRow = Database['public']['Tables']['extraction_runs']['Row'];
type ActionRow = Database['public']['Tables']['actions']['Row'];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePrecedencePolicy(value: string | null | undefined): AnalysisRunPrecedencePolicy {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'primary_first') return 'primary_first';
  if (normalized === 'latest_wins') return 'latest_wins';
  return 'manual';
}

function statusFromValue(value: string | null | undefined): AnalysisRunStatus | null {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return null;
  if (['succeeded', 'success', 'completed', 'complete'].includes(normalized)) return 'succeeded';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
  if (['running', 'processing', 'started', 'in_progress', 'in-progress'].includes(normalized)) return 'running';
  if (['queued', 'pending', 'created'].includes(normalized)) return 'queued';
  return null;
}

export function normalizeAnalysisRunStatus(
  runStatus: string | null | undefined,
  actionStatus?: string | null
): AnalysisRunStatus {
  return statusFromValue(actionStatus) ?? statusFromValue(runStatus) ?? 'queued';
}

function parseScope(inputConfig: unknown): AnalysisRunScope {
  const config = asRecord(inputConfig);
  const bundle = asRecord(config.bundle);
  if (asString(config.pack_id) || asString(config.packId) || asString(bundle.pack_id) || asString(bundle.bundle_id)) {
    return 'bundle';
  }

  const documentIds = config.document_ids;
  if (Array.isArray(documentIds) && documentIds.length > 1) {
    return 'bundle';
  }
  const bundleDocIds = bundle.document_ids;
  if (Array.isArray(bundleDocIds) && bundleDocIds.length > 1) {
    return 'bundle';
  }
  const scopeDocIds = config.scope_document_ids;
  if (Array.isArray(scopeDocIds) && scopeDocIds.length > 1) {
    return 'bundle';
  }

  return 'single';
}

function parseDocsetMode(inputConfig: unknown): AnalysisRunDocsetMode | null {
  const config = asRecord(inputConfig);
  const bundle = asRecord(config.bundle);
  const raw =
    asString(config.docset_mode) ||
    asString(config.docsetMode) ||
    asString(bundle.docset_mode) ||
    asString(bundle.docsetMode);
  if (raw === 'saved' || raw === 'ephemeral') return raw;

  const hasSavedPack =
    asString(config.pack_id) ||
    asString(config.packId) ||
    asString(bundle.pack_id) ||
    asString(bundle.bundle_id);
  if (hasSavedPack) return 'saved';

  return parseScope(config) === 'bundle' ? 'ephemeral' : null;
}

function parsePrimaryDocumentId(inputConfig: unknown): string | null {
  const config = asRecord(inputConfig);
  const bundle = asRecord(config.bundle);
  return (
    asString(config.primary_document_id) ||
    asString(config.primaryDocumentId) ||
    asString(bundle.primary_document_id) ||
    asString(bundle.primaryDocumentId) ||
    null
  );
}

function parsePrecedencePolicy(inputConfig: unknown): AnalysisRunPrecedencePolicy {
  const config = asRecord(inputConfig);
  const bundle = asRecord(config.bundle);
  return normalizePrecedencePolicy(
    asString(config.precedence_policy) ||
      asString(config.precedencePolicy) ||
      asString(bundle.precedence_policy) ||
      asString(bundle.precedencePolicy)
  );
}

function parseDocumentIds(inputConfig: unknown): string[] {
  const config = asRecord(inputConfig);
  const bundle = asRecord(config.bundle);
  const candidates = [config.document_ids, bundle.document_ids, config.scope_document_ids];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const ids = Array.from(
      new Set(
        candidate
          .map((value) => asString(value))
          .filter((value): value is string => !!value)
      )
    );
    if (ids.length > 0) return ids;
  }

  return [];
}

function parseMemberRoles(inputConfig: unknown, documentIds: string[], primaryDocumentId: string | null): AnalysisRunMemberRole[] {
  const config = asRecord(inputConfig);
  const bundle = asRecord(config.bundle);
  const rawRoles = Array.isArray(config.member_roles)
    ? config.member_roles
    : Array.isArray(bundle.member_roles)
      ? bundle.member_roles
      : [];

  const parsed: AnalysisRunMemberRole[] = rawRoles
    .map((value, idx) => {
      const record = value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
      const documentId = asString(record.document_id) || asString(record.documentId);
      if (!documentId) return null;
      const role = asString(record.role) || 'other';
      const sortOrderRaw = record.sort_order ?? record.sortOrder;
      const sortOrder = typeof sortOrderRaw === 'number' && Number.isFinite(sortOrderRaw) ? sortOrderRaw : idx;
      return {
        documentId,
        role,
        sortOrder,
      };
    })
    .filter((value): value is AnalysisRunMemberRole => !!value);

  if (parsed.length > 0) {
    return parsed
      .filter((role) => documentIds.includes(role.documentId))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((role, idx) => ({ ...role, sortOrder: idx }));
  }

  return documentIds.map((documentId, idx) => ({
    documentId,
    role: primaryDocumentId && documentId === primaryDocumentId ? 'primary' : 'other',
    sortOrder: idx,
  }));
}

function parseRememberedRelatedDocuments(runId: string, inputConfig: unknown): RememberedRelatedDocuments | null {
  const scope = parseScope(inputConfig);
  const documentIds = parseDocumentIds(inputConfig);
  const primaryDocumentId = parsePrimaryDocumentId(inputConfig);
  const memberRoles = parseMemberRoles(inputConfig, documentIds, primaryDocumentId);

  if (scope !== 'bundle' || documentIds.length === 0) return null;

  return {
    sourceRunId: runId,
    scope,
    documentIds,
    memberRoles,
    primaryDocumentId,
    precedencePolicy: parsePrecedencePolicy(inputConfig),
  };
}

export function toAnalysisRunSummary(run: ExtractionRunRow, action?: ActionRow | null): AnalysisRunSummary {
  const config = asRecord(run.input_config);
  const outputSummary = asRecord(run.output_summary);
  const playbook = asRecord(config.playbook);
  const bundle = asRecord(config.bundle);

  const actionId =
    asString(config.action_id) ||
    asString(config.actionId) ||
    asString(outputSummary.action_id) ||
    asString((action?.id as unknown) ?? null);

  const playbookLabel =
    asString(playbook.label) ||
    asString(playbook.name) ||
    asString(config.playbook_label) ||
    asString(config.playbook_name) ||
    null;

  const templateId =
    asString(config.template_id) ||
    asString(config.templateId) ||
    asString(config.playbook_id) ||
    asString(config.playbookId) ||
    null;

  const packId =
    asString(config.pack_id) ||
    asString(config.packId) ||
    asString(bundle.pack_id) ||
    asString(bundle.bundle_id) ||
    null;
  const docsetMode = parseDocsetMode(config);
  const savedDocsetName =
    asString(bundle.saved_docset_name) ||
    asString(config.saved_docset_name) ||
    null;

  const versionId =
    asString(outputSummary.version_id) ||
    asString(outputSummary.current_version_id) ||
    asString(outputSummary.verification_version_id) ||
    null;

  const verificationObjectId =
    asString(outputSummary.verification_object_id) ||
    asString(outputSummary.verificationObjectId) ||
    null;
  const rememberedRelatedDocuments = parseRememberedRelatedDocuments(run.id, run.input_config);

  return {
    runId: run.id,
    actionId,
    status: normalizeAnalysisRunStatus(run.status, action?.status ?? null),
    createdAt: run.created_at,
    updatedAt: action?.updated_at ?? run.updated_at,
    templateId,
    playbookLabel,
    scope: parseScope(run.input_config),
    packId,
    docsetMode,
    savedDocsetName,
    versionId,
    verificationObjectId,
    rememberedRelatedDocuments,
  };
}

export function selectDefaultAnalysisRun(runs: AnalysisRunSummary[]): AnalysisRunSummary | null {
  if (runs.length === 0) return null;

  const withVersion = runs.find((run) => !!run.versionId);
  return withVersion ?? runs[0];
}

export function selectRememberedRelatedDocuments(
  runs: AnalysisRunSummary[],
  primaryDocumentId: string
): RememberedRelatedDocuments | null {
  const latestSuccessfulRun = runs.find((run) => run.status === 'succeeded');
  if (!latestSuccessfulRun) return null;

  const remembered = latestSuccessfulRun.rememberedRelatedDocuments;
  if (!remembered || remembered.documentIds.length < 2) return null;
  if (!remembered.documentIds.includes(primaryDocumentId)) return null;

  return remembered;
}
