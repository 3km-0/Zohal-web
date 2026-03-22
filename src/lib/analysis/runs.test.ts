import { describe, expect, it } from 'vitest';
import {
  mergeVerificationObjectFallbackRun,
  normalizeAnalysisRunStatus,
  selectDefaultAnalysisRun,
  selectRememberedRelatedDocuments,
  toAnalysisRunSummary,
} from '@/lib/analysis/runs';

describe('analysis run utilities', () => {
  it('normalizes statuses with action status priority', () => {
    expect(normalizeAnalysisRunStatus('pending')).toBe('queued');
    expect(normalizeAnalysisRunStatus('running')).toBe('running');
    expect(normalizeAnalysisRunStatus('success')).toBe('succeeded');
    expect(normalizeAnalysisRunStatus('failed')).toBe('failed');
    expect(normalizeAnalysisRunStatus('queued', 'succeeded')).toBe('succeeded');
  });

  it('maps run rows into analysis summaries', () => {
    const summary = toAnalysisRunSummary(
      {
        id: 'run-1',
        status: 'completed',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:10:00Z',
        input_config: {
          action_id: 'action-1',
          playbook: { name: 'KSA checklist' },
          pack_id: 'pack-1',
          template_id: 'template-1',
        },
        output_summary: {
          version_id: 'version-1',
          verification_object_id: 'vo-1',
        },
        extraction_type: 'contract_analysis',
        document_id: 'doc-1',
        workspace_id: 'ws-1',
        user_id: 'u-1',
        completed_at: null,
        error: null,
        model: 'model',
        prompt_version: '1',
        started_at: null,
      },
      {
        id: 'action-1',
        status: 'succeeded',
        updated_at: '2026-01-01T00:11:00Z',
        action_type: 'analyze',
        cost_cents: null,
        created_at: '2026-01-01T00:00:00Z',
        input_json: null,
        input_text: null,
        latency_ms: null,
        model_used: null,
        org_id: null,
        output_json: null,
        output_text: null,
        plugin_family: null,
        related_entity_ids: null,
        related_task_ids: null,
        target_document_ids: null,
        target_selection_ids: null,
        triggered_by_user_id: null,
        workspace_id: 'ws-1',
      }
    );

    expect(summary.runId).toBe('run-1');
    expect(summary.actionId).toBe('action-1');
    expect(summary.status).toBe('succeeded');
    expect(summary.scope).toBe('bundle');
    expect(summary.corpusId).toBeNull();
    expect(summary.corpusKind).toBeNull();
    expect(summary.docsetMode).toBe('saved');
    expect(summary.savedDocsetName).toBeNull();
    expect(summary.templateId).toBe('template-1');
    expect(summary.versionId).toBe('version-1');
    expect(summary.verificationObjectId).toBe('vo-1');
    expect(summary.rememberedRelatedDocuments).toBeNull();
  });

  it('derives ephemeral docset mode from input config', () => {
    const summary = toAnalysisRunSummary(
      {
        id: 'run-2',
        status: 'running',
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:01:00Z',
        input_config: {
          document_ids: ['doc-1', 'doc-2'],
          bundle: {
            docset_mode: 'ephemeral',
            saved_docset_name: 'Q1 Vendor Docs',
          },
        },
        output_summary: {},
        extraction_type: 'contract_analysis',
        document_id: 'doc-1',
        workspace_id: 'ws-1',
        user_id: 'u-1',
        completed_at: null,
        error: null,
        model: 'model',
        prompt_version: '1',
        started_at: null,
      } as any
    );

    expect(summary.scope).toBe('bundle');
    expect(summary.docsetMode).toBe('ephemeral');
    expect(summary.savedDocsetName).toBe('Q1 Vendor Docs');
  });

  it('parses remembered related documents from explicit multi-document input', () => {
    const summary = toAnalysisRunSummary(
      {
        id: 'run-3',
        status: 'completed',
        created_at: '2026-01-03T00:00:00Z',
        updated_at: '2026-01-03T00:01:00Z',
        input_config: {
          document_ids: ['doc-1', 'doc-2'],
          primary_document_id: 'doc-1',
          precedence_policy: 'latest_wins',
          member_roles: [
            { document_id: 'doc-1', role: 'primary', sort_order: 0 },
            { document_id: 'doc-2', role: 'amendment', sort_order: 1 },
          ],
        },
        output_summary: {},
        extraction_type: 'contract_analysis',
        document_id: 'doc-1',
        workspace_id: 'ws-1',
        user_id: 'u-1',
        completed_at: null,
        error: null,
        model: 'model',
        prompt_version: '1',
        started_at: null,
      } as any
    );

    expect(summary.rememberedRelatedDocuments).toEqual({
      sourceRunId: 'run-3',
      scope: 'bundle',
      documentIds: ['doc-1', 'doc-2'],
      memberRoles: [
        { documentId: 'doc-1', role: 'primary', sortOrder: 0 },
        { documentId: 'doc-2', role: 'amendment', sortOrder: 1 },
      ],
      primaryDocumentId: 'doc-1',
      precedencePolicy: 'latest_wins',
    });
  });

  it('uses the latest successful run to pick remembered related documents', () => {
    const remembered = selectRememberedRelatedDocuments(
      [
        {
          runId: 'r-new',
          actionId: null,
          status: 'succeeded',
          createdAt: '2026-01-02T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
          templateId: null,
          playbookLabel: null,
          scope: 'single',
          packId: null,
          corpusId: null,
          corpusKind: null,
          docsetMode: null,
          savedDocsetName: null,
          versionId: 'v-new',
          verificationObjectId: 'vo-new',
          corpusResolution: null,
          rememberedRelatedDocuments: null,
        },
        {
          runId: 'r-old',
          actionId: null,
          status: 'succeeded',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          templateId: null,
          playbookLabel: null,
          scope: 'bundle',
          packId: null,
          corpusId: null,
          corpusKind: null,
          docsetMode: 'ephemeral',
          savedDocsetName: null,
          versionId: 'v-old',
          verificationObjectId: 'vo-old',
          corpusResolution: null,
          rememberedRelatedDocuments: {
            sourceRunId: 'r-old',
            scope: 'bundle',
            documentIds: ['doc-1', 'doc-2'],
            memberRoles: [
              { documentId: 'doc-1', role: 'primary', sortOrder: 0 },
              { documentId: 'doc-2', role: 'other', sortOrder: 1 },
            ],
            primaryDocumentId: 'doc-1',
            precedencePolicy: 'manual',
          },
        },
      ],
      'doc-1'
    );

    expect(remembered).toBeNull();
  });

  it('returns the latest successful multi-document remembered set when it is current', () => {
    const remembered = selectRememberedRelatedDocuments(
      [
        {
          runId: 'r-latest',
          actionId: null,
          status: 'succeeded',
          createdAt: '2026-01-03T00:00:00Z',
          updatedAt: '2026-01-03T00:00:00Z',
          templateId: null,
          playbookLabel: null,
          scope: 'bundle',
          packId: null,
          corpusId: null,
          corpusKind: null,
          docsetMode: 'ephemeral',
          savedDocsetName: null,
          versionId: 'v-latest',
          verificationObjectId: 'vo-latest',
          corpusResolution: null,
          rememberedRelatedDocuments: {
            sourceRunId: 'r-latest',
            scope: 'bundle',
            documentIds: ['doc-1', 'doc-2', 'doc-3'],
            memberRoles: [
              { documentId: 'doc-1', role: 'primary', sortOrder: 0 },
              { documentId: 'doc-2', role: 'other', sortOrder: 1 },
              { documentId: 'doc-3', role: 'other', sortOrder: 2 },
            ],
            primaryDocumentId: 'doc-1',
            precedencePolicy: 'manual',
          },
        },
      ],
      'doc-1'
    );

    expect(remembered?.documentIds).toEqual(['doc-1', 'doc-2', 'doc-3']);
  });

  it('selects newest run with a version by default', () => {
    const selected = selectDefaultAnalysisRun([
      {
        runId: 'r1',
        actionId: null,
        status: 'running',
        createdAt: '2026-01-01T00:01:00Z',
        updatedAt: '2026-01-01T00:01:00Z',
        templateId: null,
        playbookLabel: null,
        scope: 'single',
        packId: null,
        corpusId: null,
        corpusKind: null,
        docsetMode: null,
        savedDocsetName: null,
        versionId: null,
        verificationObjectId: null,
        corpusResolution: null,
        rememberedRelatedDocuments: null,
      },
      {
        runId: 'r2',
        actionId: null,
        status: 'succeeded',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        templateId: null,
        playbookLabel: null,
        scope: 'single',
        packId: null,
        corpusId: null,
        corpusKind: null,
        docsetMode: null,
        savedDocsetName: null,
        versionId: 'v2',
        verificationObjectId: 'vo',
        corpusResolution: null,
        rememberedRelatedDocuments: null,
      },
    ]);

    expect(selected?.runId).toBe('r2');
  });

  it('adds a fallback current analysis when verification object exists without a run manifest', () => {
    const runs = mergeVerificationObjectFallbackRun(
      [],
      {
        id: 'vo-1',
        title: 'Contract analysis',
        state: 'provisional',
        created_at: '2026-01-05T00:00:00Z',
        updated_at: '2026-01-05T00:10:00Z',
        current_version_id: 'version-1',
      } as any
    );

    expect(runs).toHaveLength(1);
    expect(runs[0]?.runId).toBe('vo:vo-1:version-1');
    expect(runs[0]?.versionId).toBe('version-1');
    expect(runs[0]?.verificationObjectId).toBe('vo-1');
    expect(runs[0]?.status).toBe('succeeded');
  });

  it('does not duplicate a run when the current verification object is already covered', () => {
    const runs = mergeVerificationObjectFallbackRun(
      [
        {
          runId: 'r1',
          actionId: null,
          status: 'succeeded',
          createdAt: '2026-01-05T00:00:00Z',
          updatedAt: '2026-01-05T00:10:00Z',
          templateId: null,
          playbookLabel: null,
          scope: 'single',
          packId: null,
          corpusId: null,
          corpusKind: null,
          docsetMode: null,
          savedDocsetName: null,
          versionId: 'version-1',
          verificationObjectId: 'vo-1',
          corpusResolution: null,
          rememberedRelatedDocuments: null,
        },
      ],
      {
        id: 'vo-1',
        title: 'Contract analysis',
        state: 'provisional',
        created_at: '2026-01-05T00:00:00Z',
        updated_at: '2026-01-05T00:10:00Z',
        current_version_id: 'version-1',
      } as any
    );

    expect(runs).toHaveLength(1);
    expect(runs[0]?.runId).toBe('r1');
  });
});
