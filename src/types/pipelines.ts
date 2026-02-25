export type PipelineNodeKind =
  | 'trigger.manual_start'
  | 'trigger.email_inbox_listener'
  | 'trigger.api_webhook'
  | 'trigger.folder_watcher'
  | 'agent.standard_zohal_verifier'
  | 'logic.if_discrepancy'
  | 'logic.parallel_group'
  | 'logic.wait_human_approval'
  | 'output.generate_decision_pack'
  | 'output.send_email'
  | 'output.webhook_json'
  | 'output.push_erp_json';

export type PipelineConditionAst =
  | { op: 'all' | 'any'; conditions: PipelineConditionAst[] }
  | { op: 'not'; condition: PipelineConditionAst }
  | {
      op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists' | 'in';
      ref: string;
      value?: unknown;
    };

export interface PipelineNodeSpec {
  id: string;
  kind: PipelineNodeKind;
  label?: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
  timeout_ms?: number;
  retry_policy?: {
    max_attempts?: number;
    backoff_seconds?: number;
  };
}

export interface PipelineEdgeSpec {
  id: string;
  source: string;
  target: string;
  condition?: PipelineConditionAst;
}

export interface PipelineSpecV1 {
  version: 'v1';
  meta: {
    name: string;
    description?: string;
    tags?: string[];
  };
  graph: {
    nodes: PipelineNodeSpec[];
    edges: PipelineEdgeSpec[];
  };
  defaults?: {
    max_parallelism?: number;
    default_timeout_ms?: number;
    redaction_mode?: 'safe' | 'strict';
  };
  [key: string]: unknown;
}

export interface PipelineRunEvent {
  id: number;
  run_id: string;
  node_id: string | null;
  event_type: string;
  event_status: string | null;
  payload_preview_json: Record<string, unknown>;
  payload_ref_json: Record<string, unknown>;
  redaction_level: string;
  created_at: string;
}
