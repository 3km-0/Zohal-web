import type { Edge, Node } from '@xyflow/react';
import type { PipelineNodeKind, PipelineSpecV1 } from '@/types/pipelines';

const isPipelineNodeKind = (value: unknown): value is PipelineNodeKind => {
  if (typeof value !== 'string') return false;
  return [
    'trigger.manual_start',
    'trigger.email_inbox_listener',
    'trigger.api_webhook',
    'trigger.folder_watcher',
    'doc.enqueue_ingestion',
    'doc.wait_indexed',
    'doc.classify',
    'ai.llm_task',
    'contract.generator',
    'contract.reduce',
    'contract.verifier',
    'contract.judge',
    'contract.snapshot_writer',
    'agent.standard_zohal_verifier',
    'logic.if_discrepancy',
    'logic.parallel_group',
    'logic.subpipeline',
    'logic.wait_human_approval',
    'output.generate_decision_pack',
    'output.send_email',
    'output.webhook_json',
    'output.push_erp_json',
  ].includes(value);
};

export function buildDefaultPipelineSpec(name = 'New Pipeline'): PipelineSpecV1 {
  return {
    version: 'v1',
    meta: {
      name,
    },
    graph: {
      nodes: [
        {
          id: 'start',
          kind: 'trigger.manual_start',
          label: 'Manual Start',
          position: { x: 80, y: 80 },
          config: {},
        },
      ],
      edges: [],
    },
    defaults: {
      max_parallelism: 4,
      default_timeout_ms: 90000,
      redaction_mode: 'safe',
    },
  };
}

export function specToFlow(spec: PipelineSpecV1): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = spec.graph.nodes.map((node) => ({
    id: node.id,
    type: 'pipelineNode',
    position: node.position || { x: 0, y: 0 },
    data: {
      kind: node.kind,
      label: node.label || node.kind,
      config: node.config || {},
      timeout_ms: node.timeout_ms,
      retry_policy: node.retry_policy,
    },
  }));

  const edges: Edge[] = spec.graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data: {
      condition: edge.condition,
    },
  }));

  return { nodes, edges };
}

export function flowToSpec(args: { name: string; nodes: Node[]; edges: Edge[] }): PipelineSpecV1 {
  const normalizedNodes = args.nodes.map((node) => {
    const data = (node.data || {}) as Record<string, unknown>;
    const kind = isPipelineNodeKind(data.kind) ? data.kind : 'logic.parallel_group';

    return {
      id: node.id,
      kind,
      label: typeof data.label === 'string' && data.label.trim() ? data.label.trim() : kind,
      position: {
        x: Number(node.position?.x || 0),
        y: Number(node.position?.y || 0),
      },
      config: data.config && typeof data.config === 'object' ? (data.config as Record<string, unknown>) : {},
      timeout_ms: Number.isFinite(Number(data.timeout_ms)) ? Number(data.timeout_ms) : undefined,
      retry_policy:
        data.retry_policy && typeof data.retry_policy === 'object'
          ? (data.retry_policy as { max_attempts?: number; backoff_seconds?: number })
          : undefined,
    };
  });

  const normalizedEdges = args.edges.map((edge) => {
    const data = (edge.data || {}) as Record<string, unknown>;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      condition: data.condition as any,
    };
  });

  return {
    version: 'v1',
    meta: {
      name: args.name.trim() || 'Untitled Pipeline',
    },
    graph: {
      nodes: normalizedNodes,
      edges: normalizedEdges,
    },
    defaults: {
      max_parallelism: 4,
      default_timeout_ms: 90000,
      redaction_mode: 'safe',
    },
  };
}
