export type PortalTraceStage = {
  id: string;
  status: string;
  timestamp: string | null;
  error_code: string | null;
  message: string | null;
};

export type PortalDiagnostics = {
  summary: {
    title: string | null;
    source_kind: string | null;
    publication_lane: string | null;
    active_runtime: string | null;
    active_revision_id: string | null;
    recovery_mode?: string | null;
    live_url: string | null;
  };
  candidate: {
    candidate_id: string;
    revision_id: string;
    run_id: string | null;
    status: string;
    authoring_strategy: string | null;
    generation_failures: string[];
    generation_quality: {
      score?: number | null;
      strategy?: string | null;
      validation_ok?: boolean | null;
    } | null;
    validation_summary: {
      fail_count?: number;
      warning_count?: number;
      generation_quality_score?: number;
    } | null;
    validation_report?: {
      status?: string;
      summary?: {
        fail_count?: number;
        warning_count?: number;
      };
    } | null;
    failure?: {
      message?: string | null;
    } | null;
  } | null;
  path_binding: {
    host: string | null;
    path_family: string | null;
    path_key: string | null;
    public_url: string | null;
  };
  deployment: {
    ok?: boolean;
    skipped?: boolean;
    reason?: string | null;
    message?: string | null;
    recorded_at?: string | null;
    worker_name?: string | null;
  } | null;
  trace: PortalTraceStage[];
  failure_class: string;
  live_probe: {
    ok?: boolean;
    skipped?: boolean;
    http_status?: number | null;
    error_code?: string | null;
    message?: string | null;
    resolved_route_id?: string | null;
    evidence_marker_count?: number;
    fallback_shell_present?: boolean;
    unresolved_dynamic_link_count?: number;
    preview?: {
      title?: string | null;
      excerpt?: string | null;
    } | null;
    probed_at?: string | null;
  } | null;
  portal_quality: {
    score: number;
    path_binding_complete: boolean;
    live_probe_ok: boolean;
    evidence_markers_present: boolean;
    fallback_shell_absent: boolean;
    unresolved_dynamic_link_count: number;
    required_route_count: number;
    rendered_required_route_count: number;
    rendered_route_ids: string[];
  };
  customization_strategy: string | null;
  customization_result: string | null;
  previous_revision_id: string | null;
  preserved_live_on_failure: boolean;
  recovery_mode?: string | null;
  user_message_code?: string | null;
  active_live_revision_id?: string | null;
  attempted_revision_id?: string | null;
  attempted_strategy?: string | null;
  fallback_from_strategy?: string | null;
  stale_worker_reason?: string | null;
  edit_diff_summary?: {
    changed?: boolean | null;
    added_line_count?: number | null;
    removed_line_count?: number | null;
  } | null;
  recomposition_scorecard?: {
    novelty_signal_count?: number | null;
    novelty_signals?: string[] | null;
    shared_line_ratio?: number | null;
    shared_token_ratio?: number | null;
    css_selector_overlap_ratio?: number | null;
    top_level_structure_overlap_ratio?: number | null;
    route_chrome_delta?: boolean | null;
    design_system_delta?: boolean | null;
    reason?: string | null;
  } | null;
  fallback_reason?: string | null;
  operator_trace_id?: string | null;
  routing_mode?: string | null;
  projection_status?: string | null;
  projection_diagnostics?: {
    routing_mode?: string | null;
    projection_status?: string | null;
    projection_source?: string | null;
    projection_source_template_id?: string | null;
    projection_source_template_version?: string | null;
    projection_route_count?: number;
    projection_route_ids?: string[];
    projection_fallback_reason?: string | null;
    projection_validation_issues?: string[];
    projection_validation_warnings?: string[];
    projection_coverage?: number | null;
  } | null;
  recent_events: Array<{
    event_kind: string;
    created_at: string;
  }>;
  stale_serving_reason: string | null;
};

export type PortalDiagnosticsEnvelope = {
  ok: boolean;
  experience_id: string;
  candidate_id: string | null;
  diagnostics: PortalDiagnostics;
};

export function humanizeFailureClass(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "none") return "No active failure";
  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function humanizeStageStatus(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Pending";
  if (normalized === "pass") return "Passed";
  if (normalized === "fail") return "Failed";
  if (normalized === "skipped") return "Skipped";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function isStageFailed(stage: PortalTraceStage): boolean {
  return String(stage.status || "").trim().toLowerCase() === "fail";
}
