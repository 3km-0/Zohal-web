import { describe, expect, it } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { buildDefaultPipelineSpec, flowToSpec, specToFlow } from './graph';

describe('pipeline graph serialization', () => {
  it('builds default pipeline with one start node', () => {
    const spec = buildDefaultPipelineSpec('Hello');
    expect(spec.version).toBe('v1');
    expect(spec.meta.name).toBe('Hello');
    expect(spec.graph.nodes).toHaveLength(1);
    expect(spec.graph.nodes[0].kind).toBe('trigger.manual_start');
  });

  it('round-trips flow <-> spec deterministically', () => {
    const nodes: Node[] = [
      {
        id: 'start',
        type: 'pipelineNode',
        position: { x: 1, y: 2 },
        data: { kind: 'trigger.manual_start', label: 'Start', config: {} },
      },
      {
        id: 'verify',
        type: 'pipelineNode',
        position: { x: 4, y: 6 },
        data: { kind: 'agent.standard_zohal_verifier', label: 'Verifier', config: { document_id: 'doc-1' } },
      },
    ];

    const edges: Edge[] = [{ id: 'e1', source: 'start', target: 'verify' }];

    const spec = flowToSpec({ name: 'Pipeline A', nodes, edges });
    const flow = specToFlow(spec);

    expect(flow.nodes).toHaveLength(2);
    expect(flow.edges).toHaveLength(1);
    expect(flow.nodes[1].data.kind).toBe('agent.standard_zohal_verifier');
    expect(spec.graph.edges[0].source).toBe('start');
  });
});
