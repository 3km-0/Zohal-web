import { describe, expect, it } from 'vitest';
import { normalizeAnalysisRunStatus, selectDefaultAnalysisRun, toAnalysisRunSummary } from '@/lib/analysis/runs';

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
    expect(summary.docsetMode).toBe('saved');
    expect(summary.savedDocsetName).toBeNull();
    expect(summary.templateId).toBe('template-1');
    expect(summary.versionId).toBe('version-1');
    expect(summary.verificationObjectId).toBe('vo-1');
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
        docsetMode: null,
        savedDocsetName: null,
        versionId: null,
        verificationObjectId: null,
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
        docsetMode: null,
        savedDocsetName: null,
        versionId: 'v2',
        verificationObjectId: 'vo',
      },
    ]);

    expect(selected?.runId).toBe('r2');
  });
});
