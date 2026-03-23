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

export type WorkspaceAgentStreamEvent =
  | { type: 'run_started'; conversation_id: string; workspace_id?: string; opened_document_id?: string | null }
  | { type: 'status'; message: string }
  | { type: 'tool_activity'; message: string }
  | { type: 'scope_candidate'; included_sources: WorkspaceAgentSource[]; excluded_sources: WorkspaceAgentSource[]; primary_document_id?: string | null }
  | { type: 'template_candidate'; template_plan: WorkspaceAgentTemplatePlan }
  | { type: 'pending_confirmation'; conversation_id: string; pending_kind: string; message: string }
  | { type: 'cta_set'; ctas: WorkspaceAgentCta[] }
  | { type: 'run_progress'; message: string; run_ref?: Record<string, unknown> | null }
  | { type: 'live_experience_ready'; live_experience: Record<string, unknown> }
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
