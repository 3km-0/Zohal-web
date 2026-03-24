export type WorkspaceAgentCitation = {
  document_id: string;
  document_title: string;
  page_number: number;
  quote: string;
  source_kind?: 'workspace_document' | 'zohal_library';
  workspace_id?: string | null;
  workspace_name?: string | null;
  library_item_id?: string | null;
  library_object_path?: string | null;
  library_url?: string | null;
};

export type WorkspaceAgentSource = {
  document_id: string;
  title: string;
  document_type?: string | null;
  reason: string;
  included: boolean;
  score?: number;
};

export type WorkspaceAgentCta = {
  action_id: string;
  label: string;
  kind: 'primary' | 'secondary' | 'ghost';
  payload?: Record<string, unknown>;
};

export type WorkspaceAgentTemplatePlan = {
  planned_template_name?: string;
  decision?: 'reuse_existing' | 'create_new';
  reason?: string;
  selected_playbook_id?: string | null;
  selected_playbook_version_id?: string | null;
  selected_template_name?: string | null;
  draft_summary?: string | null;
  templates?: Array<{
    playbook_id: string;
    name: string;
    kind: string;
    status: string;
    current_version_id?: string | null;
    current_version_number?: number | null;
  }>;
};

export type WorkspaceAgentUserIntent = {
  request_text: string;
  summary: string;
  requested_focus: string[];
  requested_outputs: string[];
  experience_goal?: string | null;
  publish_requested?: boolean;
};

export type WorkspaceAgentExecutionPlan = {
  summary: string;
  source_summary: string;
  extraction_targets: string[];
  output_shape: string[];
  experience_intent: string;
  review_policy: 'manual_verifier';
  compat_playbook_binding?: {
    mode: 'reuse_existing' | 'create_new';
    playbook_id?: string | null;
    playbook_version_id?: string | null;
    template_name?: string | null;
  } | null;
};

export type WorkspaceAgentCanonicalOutput = {
  canonical_store: 'verification_object_versions.snapshot_json';
  primary_document_id?: string | null;
  expected_sections: string[];
  compatibility_mode: 'playbook_runtime';
  latest_verification_object_id?: string | null;
  latest_verification_object_version_id?: string | null;
};

export type WorkspaceAgentPreheatStatus = {
  status: string;
  summary: string;
  metadata?: Record<string, unknown> | null;
  live_scaffold?: {
    experience_id?: string | null;
    candidate_id?: string | null;
    revision_id?: string | null;
    public_url?: string | null;
  } | null;
};

export type WorkspaceAgentLiveExperience = {
  experience_id?: string | null;
  candidate_id?: string | null;
  revision_id?: string | null;
  live_url?: string | null;
  redeem_url?: string | null;
  public_url?: string | null;
  materialization_status?: string | null;
};

export type WorkspaceAgentPublishedInterface = {
  experience_id?: string | null;
  candidate_id?: string | null;
  url?: string | null;
  promoted_revision_id?: string | null;
};

export type WorkspaceAgentReviewState = {
  policy: 'manual_only';
  signals: Array<{
    kind: 'low_confidence' | 'needs_review' | 'exception' | 'conflict';
    severity: 'info' | 'warning';
    message: string;
  }>;
  verifier_available: boolean;
  last_manual_run_ref?: Record<string, unknown> | null;
};

export type WorkspaceAgentStreamEvent =
  | { type: 'run_started'; conversation_id: string; workspace_id?: string; opened_document_id?: string | null }
  | { type: 'status'; message: string }
  | { type: 'tool_activity'; message: string }
  | { type: 'intent_candidate'; user_intent: WorkspaceAgentUserIntent }
  | { type: 'analysis_plan'; analysis_plan: WorkspaceAgentExecutionPlan }
  | { type: 'canonical_output'; canonical_output: WorkspaceAgentCanonicalOutput }
  | { type: 'preheat_status'; preheat: WorkspaceAgentPreheatStatus }
  | { type: 'review_signals'; review: WorkspaceAgentReviewState }
  | { type: 'scope_candidate'; included_sources: WorkspaceAgentSource[]; excluded_sources: WorkspaceAgentSource[]; primary_document_id?: string | null }
  | { type: 'template_candidate'; template_plan: WorkspaceAgentTemplatePlan }
  | { type: 'pending_confirmation'; conversation_id: string; pending_kind: string; message: string }
  | { type: 'cta_set'; ctas: WorkspaceAgentCta[] }
  | { type: 'run_progress'; message: string; run_ref?: Record<string, unknown> | null }
  | { type: 'live_experience_ready'; live_experience: WorkspaceAgentLiveExperience }
  | { type: 'published_interface_ready'; published_interface: WorkspaceAgentPublishedInterface }
  | { type: 'answer_delta'; delta: string }
  | { type: 'citations'; citations: WorkspaceAgentCitation[] }
  | { type: 'completed'; conversation_id: string; citations: WorkspaceAgentCitation[]; run_ref?: Record<string, unknown> | null }
  | { type: 'error'; message: string };

export function ctaButtonClass(kind: WorkspaceAgentCta['kind']): string {
  if (kind === 'primary') {
    return 'bg-accent text-accent-foreground hover:bg-accent/90';
  }
  if (kind === 'secondary') {
    return 'bg-secondary text-secondary-foreground hover:bg-secondary/80';
  }
  return 'border border-border bg-transparent text-foreground hover:bg-muted';
}
