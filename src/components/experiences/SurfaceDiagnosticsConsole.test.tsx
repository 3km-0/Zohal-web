import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurfaceDiagnosticsConsole } from './SurfaceDiagnosticsConsole';
import type { SurfaceDiagnostics } from '@/lib/surface-diagnostics';

const messages = {
  experiencesPage: {
    surfaceConsole: {
      title: 'Living Interface operator console',
      description: 'Description',
      loading: 'Loading Living Interface diagnostics…',
      summaryTitle: 'Living Interface summary',
      failureClass: 'Failure class',
      activeRevision: 'Active revision',
      qualityScore: 'Living Interface quality',
      qualitySummary: '{rendered}/{required} required routes rendered',
      traceTitle: 'Publish trace',
      traceDescription: 'Trace description',
      liveProbeTitle: 'Live probe',
      liveProbeDescription: 'Probe description',
      httpStatus: 'HTTP status',
      evidenceMarkers: 'Evidence markers',
      liveProbeFlags: 'Fallback shell: {fallback} • Unresolved dynamic links: {unresolved}',
      candidateTitle: 'Candidate diagnostics',
      candidateDescription: 'Candidate description',
      validationSummary: '{fails} fails, {warnings} warnings, quality {quality}',
      customizationSummary: 'Customization strategy: {strategy} • Result: {result}',
      recoveryMode: 'Recovery mode',
      previousRevision: 'Previous revision',
      attemptedRevision: 'Attempted revision',
      fallbackReason: 'Fallback reason',
      preservedLive: 'The previous Living Interface stayed active because the recomposition attempt did not fully replace it.',
      recompositionScorecard: 'Recomposition scorecard',
      recompositionSignals: '{count} novelty signals: {signals}',
      recompositionRatios: 'Shared lines {lines} • Shared tokens {tokens}',
      generationFailures: 'Generation failures',
      stageNames: {
        compile: 'Compile',
        stage: 'Stage',
        validate: 'Validate',
        deploy: 'Deploy',
        promote: 'Promote',
        live_probe: 'Live probe',
      },
    },
    actions: {
      refreshSurface: 'Refresh diagnostics',
      openSurface: 'Open Living Interface',
    },
    status: {
      none: 'None yet',
    },
  },
  common: {
    yes: 'Yes',
    no: 'No',
  },
} as const;

function lookup(path: string) {
  return path.split('.').reduce<any>((acc, key) => (acc ? acc[key] : undefined), messages);
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string | number>) => {
    let template = lookup(`${namespace}.${key}`) ?? key;
    if (typeof template !== 'string') return key;
    for (const [name, value] of Object.entries(values || {})) {
      template = template.replaceAll(`{${name}}`, String(value));
    }
    return template;
  },
}));

vi.mock('@/components/ui', () => ({
  Button: ({ children, isLoading, ...props }: any) => (
    <button data-loading={isLoading ? 'true' : 'false'} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
  Spinner: () => <div data-testid="spinner" />,
}));

function diagnostics(overrides: Partial<SurfaceDiagnostics> = {}): SurfaceDiagnostics {
  return {
    summary: {
      title: 'Board Surface',
      source_kind: 'contract_document',
      publication_lane: 'trusted_runtime',
      active_runtime: 'generated_dispatch',
      active_revision_id: 'rev_demo',
      recovery_mode: 'normal',
      live_url: 'https://live.zohal.ai/e/ct_demo',
    },
    candidate: {
      candidate_id: 'cand_demo',
      revision_id: 'rev_demo',
      run_id: 'run_demo',
      status: 'validated',
      authoring_strategy: 'model_authored',
      generation_failures: [],
      generation_quality: {
        score: 84,
      },
      validation_summary: {
        fail_count: 0,
        warning_count: 1,
        generation_quality_score: 84,
      },
      validation_report: {
        status: 'pass',
      },
      failure: null,
    },
    path_binding: {
      host: 'live.zohal.ai',
      path_family: 'e',
      path_key: 'ct_demo',
      public_url: 'https://live.zohal.ai/e/ct_demo',
    },
    deployment: {
      ok: true,
      skipped: false,
      recorded_at: '2026-03-26T10:02:00.000Z',
    },
    trace: [
      { id: 'compile', status: 'pass', timestamp: '2026-03-26T10:00:00.000Z', error_code: null, message: 'Compile ok' },
      { id: 'stage', status: 'pass', timestamp: '2026-03-26T10:01:00.000Z', error_code: null, message: 'Stage ok' },
      { id: 'validate', status: 'pass', timestamp: '2026-03-26T10:02:00.000Z', error_code: null, message: 'Validate ok' },
      { id: 'deploy', status: 'pass', timestamp: '2026-03-26T10:03:00.000Z', error_code: null, message: 'Deploy ok' },
      { id: 'promote', status: 'pass', timestamp: '2026-03-26T10:04:00.000Z', error_code: null, message: 'Promote ok' },
      { id: 'live_probe', status: 'pass', timestamp: '2026-03-26T10:05:00.000Z', error_code: null, message: 'Probe ok' },
    ],
    failure_class: 'none',
    live_probe: {
      ok: true,
      http_status: 200,
      resolved_route_id: 'overview',
      evidence_marker_count: 4,
      fallback_shell_present: false,
      unresolved_dynamic_link_count: 0,
      preview: {
        title: 'Board Surface',
        excerpt: 'Compact preview excerpt',
      },
      probed_at: '2026-03-26T10:05:00.000Z',
    },
    portal_quality: {
      score: 90,
      path_binding_complete: true,
      live_probe_ok: true,
      evidence_markers_present: true,
      fallback_shell_absent: true,
      unresolved_dynamic_link_count: 0,
      required_route_count: 2,
      rendered_required_route_count: 1,
      rendered_route_ids: ['overview'],
    },
    customization_strategy: null,
    customization_result: null,
    previous_revision_id: null,
    preserved_live_on_failure: false,
    recovery_mode: 'normal',
    user_message_code: null,
    active_live_revision_id: 'rev_demo',
    attempted_revision_id: null,
    recomposition_scorecard: null,
    fallback_reason: null,
    operator_trace_id: null,
    recent_events: [],
    stale_serving_reason: null,
    ...overrides,
  };
}

describe('SurfaceDiagnosticsConsole', () => {
  it('renders the Surface summary, trace, and live probe details', () => {
    render(
      <SurfaceDiagnosticsConsole
        diagnostics={diagnostics()}
        isLoading={false}
        onRefresh={() => {}}
      />
    );

    expect(screen.getByText('Living Interface operator console')).toBeInTheDocument();
    expect(screen.getByText('Board Surface')).toBeInTheDocument();
    expect(screen.getByTestId('surface-stage-compile')).toHaveTextContent('Passed');
    expect(screen.getByText('HTTP status: 200')).toBeInTheDocument();
    expect(screen.getByText('Evidence markers: 4')).toBeInTheDocument();
    expect(screen.getByText('Open Living Interface')).toBeInTheDocument();
  });

  it('renders failure class and failing stage state', () => {
    render(
      <SurfaceDiagnosticsConsole
        diagnostics={diagnostics({
          failure_class: 'deploy_failed',
          trace: [
            { id: 'compile', status: 'pass', timestamp: null, error_code: null, message: 'Compile ok' },
            { id: 'stage', status: 'pass', timestamp: null, error_code: null, message: 'Stage ok' },
            { id: 'validate', status: 'pass', timestamp: null, error_code: null, message: 'Validate ok' },
            { id: 'deploy', status: 'fail', timestamp: null, error_code: 'deploy_failed', message: 'Deploy failed' },
            { id: 'promote', status: 'pending', timestamp: null, error_code: null, message: 'Promote pending' },
            { id: 'live_probe', status: 'pending', timestamp: null, error_code: null, message: 'Probe pending' },
          ],
          candidate: {
            ...diagnostics().candidate!,
            generation_failures: ['Cloudflare deploy rejected the worker module.'],
          },
        })}
        isLoading={false}
        onRefresh={() => {}}
      />
    );

    expect(screen.getByTestId('surface-failure-class')).toHaveTextContent('Deploy Failed');
    expect(screen.getByTestId('surface-stage-deploy')).toHaveTextContent('Failed');
    expect(screen.getByText('Generation failures')).toBeInTheDocument();
    expect(screen.getByText('Cloudflare deploy rejected the worker module.')).toBeInTheDocument();
  });

  it('renders customization strategy details when recomposition is tracked', () => {
    render(
      <SurfaceDiagnosticsConsole
        diagnostics={diagnostics({
          customization_strategy: 'recompose',
          customization_result: 'preserved_live',
          previous_revision_id: 'rev_prev',
          attempted_revision_id: 'rev_attempt',
          preserved_live_on_failure: true,
          recovery_mode: 'preserved_live',
          fallback_reason: 'worker_too_similar_to_reference',
          recomposition_scorecard: {
            novelty_signal_count: 3,
            novelty_signals: ['route_chrome_delta', 'css_selector_overlap_ratio', 'design_system_delta'],
            shared_line_ratio: 0.72,
            shared_token_ratio: 0.70,
          },
        })}
        isLoading={false}
        onRefresh={() => {}}
      />
    );

    expect(screen.getByText('Customization strategy: Recompose • Result: Preserved Live')).toBeInTheDocument();
    expect(screen.getByText('Previous revision: rev_prev')).toBeInTheDocument();
    expect(screen.getByText('Attempted revision: rev_attempt')).toBeInTheDocument();
    expect(screen.getByText('Fallback reason: Worker Too Similar To Reference')).toBeInTheDocument();
    expect(screen.getByText('Recomposition scorecard')).toBeInTheDocument();
    expect(screen.getByText('The previous Living Interface stayed active because the recomposition attempt did not fully replace it.')).toBeInTheDocument();
  });
});
