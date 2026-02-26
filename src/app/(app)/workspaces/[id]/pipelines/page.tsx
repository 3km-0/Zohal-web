'use client';

import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import { Play, Save, CheckCircle2, Layers, RefreshCw } from 'lucide-react';

import { AppHeader } from '@/components/layout/AppHeader';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { Badge, Button, EmptyState, Input, ScholarNotebookCard, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { isPipelineBuilderEnabledForWorkspace } from '@/lib/feature-flags';
import { createClient } from '@/lib/supabase/client';
import { buildDefaultPipelineSpec, flowToSpec, specToFlow } from '@/lib/pipelines/graph';
import type { PipelineNodeKind, PipelineSpecV1 } from '@/types/pipelines';

type PipelineRow = {
  id: string;
  workspace_id: string | null;
  name: string;
  status: 'draft' | 'published' | 'deprecated';
  is_system_preset: boolean;
  current_version?: {
    id: string;
    version_number: number;
    spec_hash: string;
    compile_warnings?: unknown;
    published_at?: string | null;
  } | null;
};

const fallbackPalette: Array<{ kind: PipelineNodeKind; label: string; enabled: boolean }> = [
  { kind: 'trigger.manual_start', label: 'Manual Start', enabled: true },
  { kind: 'doc.enqueue_ingestion', label: 'Enqueue Ingestion', enabled: true },
  { kind: 'doc.wait_indexed', label: 'Wait Indexed', enabled: true },
  { kind: 'doc.classify', label: 'Classify Document', enabled: true },
  { kind: 'ai.llm_task', label: 'LLM Task', enabled: true },
  { kind: 'contract.generator', label: 'Contract Generator', enabled: true },
  { kind: 'contract.reduce', label: 'Contract Reduce', enabled: true },
  { kind: 'contract.verifier', label: 'Contract Verifier', enabled: true },
  { kind: 'contract.judge', label: 'Contract Judge', enabled: true },
  { kind: 'contract.snapshot_writer', label: 'Snapshot Writer', enabled: true },
  { kind: 'agent.standard_zohal_verifier', label: 'Standard Verifier', enabled: true },
  { kind: 'logic.if_discrepancy', label: 'If Discrepancy', enabled: true },
  { kind: 'logic.parallel_group', label: 'Parallel Group (UI)', enabled: true },
  { kind: 'logic.subpipeline', label: 'Subpipeline', enabled: true },
  { kind: 'logic.wait_human_approval', label: 'Wait Human', enabled: true },
  { kind: 'output.generate_decision_pack', label: 'Decision Pack', enabled: true },
  { kind: 'output.webhook_json', label: 'Webhook', enabled: false },
];

type CatalogNode = {
  kind: PipelineNodeKind;
  title: string;
  execution: string;
  enabled: boolean;
  input_contract?: string | null;
  output_contract?: string | null;
  config_schema?: Record<string, unknown> | null;
  ui_hints?: Record<string, unknown> | null;
  palette_icon?: string | null;
  palette_badge_i18n_keys?: string[] | null;
  guardrail_warning_i18n_keys?: string[] | null;
};

type RunNodeRow = {
  node_id: string;
  status: string;
  last_error_code?: string | null;
  last_error_message?: string | null;
};

type JsonSchema = {
  type?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function schemaToFieldOrder(schema: Record<string, unknown> | null | undefined, uiHints: Record<string, unknown> | null | undefined) {
  const s = (schema || {}) as JsonSchema;
  const props = (s.properties || {}) as Record<string, JsonSchema>;
  const order = Array.isArray((uiHints as any)?.config_order) ? ((uiHints as any).config_order as string[]) : [];
  const keys = Object.keys(props);
  const ordered = [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))];
  return { props, ordered };
}

function nodeBadgeVariant(status: string | undefined): 'default' | 'warning' | 'success' | 'error' {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'running' || status === 'ready' || status === 'waiting_external' || status === 'waiting_human') return 'warning';
  return 'default';
}

async function resolveInvokeError(error: unknown, data: any, fallback: string): Promise<Error> {
  if (data && typeof data === 'object') {
    const message =
      (typeof data.message === 'string' && data.message) ||
      (typeof data.details === 'string' && data.details) ||
      (typeof data.error === 'string' && data.error);
    if (message) return new Error(message);
  }

  if (error && typeof error === 'object') {
    const maybeContext = (error as any).context;
    if (maybeContext && typeof maybeContext.clone === 'function') {
      try {
        const payload = await maybeContext.clone().json();
        if (payload && typeof payload === 'object') {
          const message =
            (typeof payload.message === 'string' && payload.message) ||
            (typeof payload.details === 'string' && payload.details) ||
            (typeof payload.error === 'string' && payload.error);
          if (message) return new Error(message);
        }
      } catch {
        // Ignore parse failures and fall back to generic error mapping.
      }
    }

    const rawMessage = (error as any).message;
    if (typeof rawMessage === 'string' && rawMessage.trim()) {
      return new Error(rawMessage);
    }
  }

  return new Error(fallback);
}

export default function PipelinesPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = String(params?.id || '').toLowerCase();
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations('pipelines');
  const toast = useToast();

  const [pipelines, setPipelines] = useState<PipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [checkpointing, setCheckpointing] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [specName, setSpecName] = useState('');
  const [testInput, setTestInput] = useState('{"document_id":""}');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<number>(0);
  const [runEvents, setRunEvents] = useState<Array<Record<string, unknown>>>([]);
  const [nodeStatusById, setNodeStatusById] = useState<Record<string, string>>({});
  const [runNodes, setRunNodes] = useState<RunNodeRow[]>([]);
  const [runStatus, setRunStatus] = useState<string>('');
  const [runStatusReason, setRunStatusReason] = useState<string>('');
  const [catalogNodes, setCatalogNodes] = useState<CatalogNode[]>([]);
  const [serverWorkspaceEnabled, setServerWorkspaceEnabled] = useState<boolean | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [rawConfigDraft, setRawConfigDraft] = useState<string>('');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const draftSaveRef = useRef<number | null>(null);
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) || null;

  const envEnabled = isPipelineBuilderEnabledForWorkspace(workspaceId);
  const enabled = serverWorkspaceEnabled ?? envEnabled;

  const palette = useMemo(() => {
    if (catalogNodes.length === 0) return fallbackPalette;
    return catalogNodes.map((n) => ({
      kind: n.kind,
      label: n.title,
      enabled: n.enabled,
      badges: Array.isArray(n.palette_badge_i18n_keys) ? n.palette_badge_i18n_keys : [],
    }));
  }, [catalogNodes]);

  const presetNodes = useMemo(() => {
    return [
      {
        id: 'preset.openai_json',
        label: t('palette.presets.openaiJson'),
        kind: 'ai.llm_task' as PipelineNodeKind,
        config: {
          provider: 'openai',
          model: 'gpt-5.2',
          system_prompt: 'Return valid JSON only. Do not include markdown.',
          prompt_template: 'Describe the task and required JSON output.',
          output_json_schema: { type: 'object', additionalProperties: true },
          temperature: 0,
          max_tokens: 1200,
        },
      },
      {
        id: 'preset.vertex_gemini_json',
        label: t('palette.presets.geminiJson'),
        kind: 'ai.llm_task' as PipelineNodeKind,
        config: {
          provider: 'vertex',
          model: 'gemini-1.5-pro',
          system_prompt: 'Return valid JSON only. Do not include markdown.',
          prompt_template: 'Describe the task and required JSON output.',
          output_json_schema: { type: 'object', additionalProperties: true },
          temperature: 0,
          max_tokens: 1200,
        },
      },
    ];
  }, [t]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const selectedNodeKind = String((selectedNode?.data as any)?.kind || '');
  const selectedCatalogNode = useMemo(() => {
    return catalogNodes.find((n) => n.kind === (selectedNodeKind as PipelineNodeKind)) || null;
  }, [catalogNodes, selectedNodeKind]);

  useEffect(() => {
    if (!selectedNode) {
      setRawConfigDraft('');
      return;
    }
    const cfg = isRecord((selectedNode.data as any)?.config) ? ((selectedNode.data as any).config as Record<string, unknown>) : {};
    setRawConfigDraft(JSON.stringify(cfg, null, 2));
  }, [selectedNode]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, id: crypto.randomUUID() }, eds));
    },
    [setEdges],
  );

  const loadPipelines = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('pipelines-list', {
      body: { workspace_id: workspaceId, kind: 'agent_pipeline' },
    });

    if (error || !data?.ok) {
      toast.showError(error || new Error('Failed to load pipelines'), 'pipelines-list');
      setLoading(false);
      return;
    }

    setPipelines(data.pipelines || []);
    if (!selectedPipelineId && data.pipelines?.length) {
      setSelectedPipelineId(String(data.pipelines[0].id));
    }
    setLoading(false);
  }, [selectedPipelineId, supabase, toast, workspaceId]);

  const loadNodeCatalog = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('pipelines-node-catalog', {
      body: { workspace_id: workspaceId },
    });

    if (error || !data?.ok || !Array.isArray(data.nodes)) {
      return;
    }

    if (typeof data.workspace_enabled === 'boolean') {
      setServerWorkspaceEnabled(data.workspace_enabled);
    }

    const mapped: CatalogNode[] = data.nodes
      .filter((n: any) => typeof n?.kind === 'string')
      .map((n: any) => ({
        kind: n.kind as PipelineNodeKind,
        title: String(n.title || n.kind),
        execution: String(n.execution || 'internal'),
        enabled: n.enabled === true,
        input_contract: typeof n.input_contract === 'string' ? n.input_contract : null,
        output_contract: typeof n.output_contract === 'string' ? n.output_contract : null,
        config_schema: isRecord(n.config_schema) ? (n.config_schema as Record<string, unknown>) : null,
        ui_hints: isRecord(n.ui_hints) ? (n.ui_hints as Record<string, unknown>) : null,
        palette_icon: typeof n.palette_icon === 'string' ? n.palette_icon : null,
        palette_badge_i18n_keys: Array.isArray(n.palette_badge_i18n_keys)
          ? (n.palette_badge_i18n_keys.filter((k: any) => typeof k === 'string') as string[])
          : null,
        guardrail_warning_i18n_keys: Array.isArray(n.guardrail_warning_i18n_keys)
          ? (n.guardrail_warning_i18n_keys.filter((k: any) => typeof k === 'string') as string[])
          : null,
      }));

    setCatalogNodes(mapped);
  }, [supabase, workspaceId]);

  useEffect(() => {
    void loadNodeCatalog();
  }, [loadNodeCatalog]);

  useEffect(() => {
    if (!enabled) return;
    void loadPipelines();
  }, [enabled, loadPipelines]);

  const loadSelectedDraftOrCurrent = useCallback(async (pipeline: PipelineRow) => {
    const { data: draftData } = await supabase.functions.invoke('pipelines-save-draft', {
      body: {
        pipeline_id: pipeline.id,
        mode: 'get',
      },
    });

    const maybeDraft = draftData?.draft?.spec_json;
    const base = maybeDraft || buildDefaultPipelineSpec(pipeline.name);
    const flow = specToFlow(base as PipelineSpecV1);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSpecName((base as PipelineSpecV1).meta?.name || pipeline.name);
  }, [setEdges, setNodes, supabase]);

  useEffect(() => {
    if (!enabled || !selectedPipeline) return;
    void loadSelectedDraftOrCurrent(selectedPipeline);
  }, [enabled, loadSelectedDraftOrCurrent, selectedPipeline]);

  useEffect(() => {
    if (!selectedPipelineId || !enabled) return;
    if (draftSaveRef.current) {
      clearTimeout(draftSaveRef.current);
    }

    draftSaveRef.current = window.setTimeout(async () => {
      const spec = flowToSpec({
        name: specName || selectedPipeline?.name || 'Untitled Pipeline',
        nodes,
        edges,
      });
      setSavingDraft(true);
      const { error } = await supabase.functions.invoke('pipelines-save-draft', {
        body: {
          pipeline_id: selectedPipelineId,
          mode: 'save',
          spec_json: spec,
        },
      });
      setSavingDraft(false);
      if (error) {
        toast.showError(error, 'pipelines-save-draft');
      }
    }, 1200);

    return () => {
      if (draftSaveRef.current) clearTimeout(draftSaveRef.current);
    };
  }, [edges, enabled, nodes, selectedPipeline?.name, selectedPipelineId, specName, supabase, toast]);

  const createPipeline = async () => {
    if (!newName.trim()) return;
    const initialSpec = buildDefaultPipelineSpec(newName.trim());
    const { data, error } = await supabase.functions.invoke('pipelines-create', {
      body: {
        workspace_id: workspaceId,
        name: newName.trim(),
        kind: 'agent_pipeline',
        initial_spec_json: initialSpec,
        changelog: 'Initial pipeline scaffold',
      },
    });

    if (error || !data?.ok) {
      const resolved = await resolveInvokeError(error, data, 'Failed to create pipeline');
      toast.showError(resolved, 'pipelines-create');
      return;
    }

    setNewName('');
    await loadPipelines();
    setSelectedPipelineId(String(data.pipeline.id));
  };

  const checkpoint = async () => {
    if (!selectedPipelineId) return;
    setCheckpointing(true);
    const spec = flowToSpec({
      name: specName || selectedPipeline?.name || 'Untitled Pipeline',
      nodes,
      edges,
    });

    const { data, error } = await supabase.functions.invoke('pipelines-create-version', {
      body: {
        pipeline_id: selectedPipelineId,
        spec_json: spec,
        changelog: 'Manual checkpoint from builder',
        make_current: true,
      },
    });

    setCheckpointing(false);

    if (error || !data?.ok) {
      const resolved = await resolveInvokeError(error, data, 'Failed to checkpoint pipeline');
      toast.showError(resolved, 'pipelines-create-version');
      return;
    }

    toast.showSuccess(t('builder.checkpointSaved'));
    await loadPipelines();
  };

  const publish = async () => {
    if (!selectedPipelineId) return;
    setPublishing(true);
    const { data, error } = await supabase.functions.invoke('pipelines-publish', {
      body: {
        pipeline_id: selectedPipelineId,
      },
    });
    setPublishing(false);

    if (error || !data?.ok) {
      const resolved = await resolveInvokeError(error, data, 'Failed to publish pipeline');
      toast.showError(resolved, 'pipelines-publish');
      return;
    }

    toast.showSuccess(t('builder.published'));
    await loadPipelines();
  };

  const addNode = (kind: PipelineNodeKind, opts?: { label?: string; config?: Record<string, unknown> }) => {
    const id = `${kind.replace(/\./g, '_')}_${Math.random().toString(36).slice(2, 7)}`;
    const title = catalogNodes.find((n) => n.kind === kind)?.title || kind;
    const next: Node = {
      id,
      type: 'default',
      position: { x: 220 + nodes.length * 20, y: 140 + nodes.length * 20 },
      data: {
        kind,
        label: opts?.label || title,
        config: opts?.config || {},
      },
    };
    setNodes((prev) => [...prev, next]);
    setSelectedNodeId(id);
  };

  const updateSelectedNodeConfig = useCallback(
    (nextConfig: Record<string, unknown>) => {
      if (!selectedNodeId) return;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== selectedNodeId) return n;
          return {
            ...n,
            data: {
              ...(n.data as any),
              config: nextConfig,
            },
          };
        }),
      );
    },
    [selectedNodeId, setNodes],
  );

  const applyRawConfigDraft = useCallback(() => {
    if (!selectedNode) return;
    try {
      const parsed = JSON.parse(rawConfigDraft || '{}');
      if (!isRecord(parsed)) {
        toast.showError(new Error('Config JSON must be an object'), 'pipeline-node-config');
        return;
      }
      updateSelectedNodeConfig(parsed);
      toast.showSuccess(t('builder.nodeConfigSaved'));
    } catch (e) {
      toast.showError(e instanceof Error ? e : new Error('Invalid JSON'), 'pipeline-node-config');
    }
  }, [rawConfigDraft, selectedNode, t, toast, updateSelectedNodeConfig]);

  const runTest = async () => {
    if (!selectedPipelineId) return;

    let parsedInput: Record<string, unknown> = {};
    try {
      parsedInput = JSON.parse(testInput || '{}');
    } catch {
      toast.showError(new Error(t('builder.invalidTestJson')), 'pipelines-start-run');
      return;
    }

    setRunning(true);
    setRunEvents([]);
    setLastEventId(0);
    setNodeStatusById({});
    setRunNodes([]);
    setRunStatus('running');
    setRunStatusReason('');

    const { data, error } = await supabase.functions.invoke('pipelines-start-run', {
      body: {
        workspace_id: workspaceId,
        pipeline_id: selectedPipelineId,
        input_json: parsedInput,
      },
    });

    if (error || !data?.accepted || !data?.pipeline_run_id) {
      setRunning(false);
      const resolved = await resolveInvokeError(error, data, 'Failed to start run');
      toast.showError(resolved, 'pipelines-start-run');
      return;
    }

    setActiveRunId(String(data.pipeline_run_id));
  };

  const runNodeAction = async (nodeId: string, action: 'approve' | 'reject' | 'retry') => {
    if (!activeRunId) return;

    const { data, error } = await supabase.functions.invoke('pipelines-node-action', {
      body: {
        pipeline_run_id: activeRunId,
        node_id: nodeId,
        action,
      },
    });

    if (error || !data?.ok) {
      const resolved = await resolveInvokeError(error, data, t('builder.nodeActionFailed'));
      toast.showError(resolved, 'pipelines-node-action');
      return;
    }

    toast.showSuccess(t('builder.nodeActionSuccess'));
  };

  useEffect(() => {
    if (!activeRunId) return;

    const timer = window.setInterval(async () => {
      const [{ data: eventsData }, { data: runData }] = await Promise.all([
        supabase.functions.invoke('pipelines-list-events', {
          body: {
            pipeline_run_id: activeRunId,
            after_id: lastEventId,
            limit: 100,
          },
        }),
        supabase.functions.invoke('pipelines-get-run', {
          body: {
            pipeline_run_id: activeRunId,
          },
        }),
      ]);

      if (eventsData?.ok && Array.isArray(eventsData.events) && eventsData.events.length > 0) {
        setRunEvents((prev) => [...prev, ...eventsData.events]);
        const maxId = Math.max(...eventsData.events.map((e: any) => Number(e.id || 0)));
        setLastEventId((prev) => Math.max(prev, maxId));
      }

      if (runData?.ok && Array.isArray(runData.nodes)) {
        const nextStatus: Record<string, string> = {};
        for (const node of runData.nodes) {
          nextStatus[String(node.node_id)] = String(node.status || 'pending');
        }
        setNodeStatusById(nextStatus);
        setRunNodes((runData.nodes || []) as RunNodeRow[]);

        const runStatus = String(runData.run?.status || '');
        const runReason = String(runData.run?.status_reason || '');
        setRunStatus(runStatus);
        setRunStatusReason(runReason);
        if (['succeeded', 'failed', 'cancelled'].includes(runStatus)) {
          setRunning(false);
          clearInterval(timer);
        }
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [activeRunId, lastEventId, supabase]);

  const waitingHumanNodes = useMemo(
    () => runNodes.filter((n) => n.status === 'waiting_human'),
    [runNodes],
  );

  const retryableNodes = useMemo(
    () => runNodes.filter((n) => ['failed', 'waiting_external'].includes(n.status)),
    [runNodes],
  );

  const policyDeniedEvents = useMemo(
    () => runEvents.filter((event) => String(event.event_type || '') === 'policy_denied').slice(-5),
    [runEvents],
  );

  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const status = nodeStatusById[node.id];
        let border = '#d6d3d1';
        if (status === 'succeeded') border = '#16a34a';
        if (status === 'failed') border = '#dc2626';
        if (status === 'running' || status === 'ready') border = '#f59e0b';
        if (status === 'waiting_external' || status === 'waiting_human') border = '#0ea5e9';

        return {
          ...node,
          style: {
            ...(node.style || {}),
            border: `2px solid ${border}`,
            borderRadius: 12,
            background: '#fffef8',
          },
        };
      }),
    );
  }, [nodeStatusById, setNodes]);

  if (!enabled && serverWorkspaceEnabled === null) {
    return (
      <div className="h-full overflow-y-auto bg-bg">
        <AppHeader />
        <WorkspaceTabs workspaceId={workspaceId} active="pipelines" />
        <div className="mx-auto max-w-5xl p-6">
          <div className="flex items-center gap-2 text-text-soft text-sm">
            <Spinner size="sm" />
            {t('list.loading')}
          </div>
        </div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="h-full overflow-y-auto bg-bg">
        <AppHeader />
        <WorkspaceTabs workspaceId={workspaceId} active="pipelines" />
        <div className="mx-auto max-w-5xl p-6">
          <EmptyState title={t('disabled.title')} description={t('disabled.description')} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <AppHeader />
      <WorkspaceTabs workspaceId={workspaceId} active="pipelines" />
      <div className="mx-auto max-w-[1400px] p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        <ScholarNotebookCard header={t('list.title')}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('list.newPlaceholder')}
              />
              <Button onClick={createPipeline} size="sm" disabled={!newName.trim()}>
                {t('list.create')}
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-text-soft text-sm">
                <Spinner size="sm" />
                {t('list.loading')}
              </div>
            ) : pipelines.length === 0 ? (
              <EmptyState title={t('list.emptyTitle')} description={t('list.emptyDescription')} />
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                {pipelines.map((pipeline) => (
                  <button
                    key={pipeline.id}
                    onClick={() => setSelectedPipelineId(pipeline.id)}
                    className={`w-full text-left p-3 rounded-scholar border transition-colors ${
                      selectedPipelineId === pipeline.id
                        ? 'border-highlight bg-highlight/10'
                        : 'border-border hover:bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm text-text truncate">{pipeline.name}</div>
                      <Badge size="sm" variant={pipeline.status === 'published' ? 'success' : 'default'}>
                        {pipeline.status}
                      </Badge>
                    </div>
                    {pipeline.current_version ? (
                      <div className="text-xs text-text-soft mt-1">
                        v{pipeline.current_version.version_number}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-border space-y-2">
              <div className="text-xs font-semibold text-text-soft uppercase tracking-wide">{t('palette.title')}</div>
              <div className="grid grid-cols-1 gap-2">
                <div className="rounded-scholar border border-border bg-surface p-2">
                  <div className="text-[11px] font-semibold text-text-soft uppercase tracking-wide">{t('palette.presets.title')}</div>
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {presetNodes.map((p) => (
                      <Button
                        key={p.id}
                        variant="ghost"
                        size="sm"
                        onClick={() => addNode(p.kind, { label: p.label, config: p.config })}
                        className="justify-start"
                        disabled={!selectedPipelineId}
                      >
                        <Layers className="w-3.5 h-3.5 mr-2" />
                        <span className="truncate">{p.label}</span>
                        <span className="ml-auto flex items-center gap-1">
                          <Badge size="sm" variant="success">{t('palette.presets.badge')}</Badge>
                        </span>
                      </Button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-text-soft">{t('palette.presets.hint')}</div>
                </div>

                {palette.map((item) => (
                  <Button
                    key={item.kind}
                    variant="ghost"
                    size="sm"
                    onClick={() => addNode(item.kind)}
                    className="justify-start"
                    disabled={!selectedPipelineId || item.enabled === false}
                  >
                    <Layers className="w-3.5 h-3.5 mr-2" />
                    <span className="truncate">{item.label}{item.enabled === false ? ` ${t('palette.blockedSuffix')}` : ''}</span>
                    {Array.isArray((item as any).badges) && (item as any).badges.length ? (
                      <span className="ml-auto flex items-center gap-1">
                        {((item as any).badges as string[]).slice(0, 2).map((key) => (
                          <Badge
                            key={key}
                            size="sm"
                            variant={key.includes('canonical') ? 'error' : 'warning'}
                          >
                            {t(key as any)}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </ScholarNotebookCard>

        <ScholarNotebookCard header={t('list.title')}>
          {!selectedPipelineId ? (
            <EmptyState title={t('builder.selectTitle')} description={t('builder.selectDescription')} />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={specName}
                    onChange={(e) => setSpecName(e.target.value)}
                    placeholder={t('builder.namePlaceholder')}
                    className="w-[280px]"
                    disabled={!selectedPipelineId}
                  />
                  {savingDraft ? <Badge size="sm" variant="warning">{t('builder.saving')}</Badge> : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={loadPipelines}>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    {t('builder.reload')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={checkpoint} disabled={!selectedPipelineId || checkpointing}>
                    <Save className="w-4 h-4 mr-1" />
                    {checkpointing ? t('builder.checkpointing') : t('builder.checkpoint')}
                  </Button>
                  <Button size="sm" onClick={publish} disabled={!selectedPipelineId || publishing}>
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {publishing ? t('builder.publishing') : t('builder.publish')}
                  </Button>
                </div>
              </div>

              <div className="h-[540px] w-full border border-border rounded-scholar overflow-hidden bg-[#fffdf4]">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  fitView
                  minZoom={0.2}
                  maxZoom={2}
                >
                  <MiniMap pannable zoomable />
                  <Controls />
                  <Background gap={20} size={1} color="#e7e5e4" />
                </ReactFlow>
              </div>

              <div className="border border-border rounded-scholar p-3 bg-surface">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-xs font-semibold text-text-soft uppercase tracking-wide">{t('builder.nodeInspector')}</div>
                  {selectedNode ? (
                    <Badge size="sm" variant="default">
                      {selectedCatalogNode?.title || selectedNodeKind || selectedNode.id}
                    </Badge>
                  ) : (
                    <Badge size="sm" variant="default">
                      {t('builder.noNodeSelected')}
                    </Badge>
                  )}
                </div>

                {!selectedNode ? (
                  <div className="text-sm text-text-soft">{t('builder.nodeInspectorHint')}</div>
                ) : (
                  <div className="space-y-3">
                    {Array.isArray(selectedCatalogNode?.guardrail_warning_i18n_keys) && selectedCatalogNode?.guardrail_warning_i18n_keys?.length ? (
                      <div className="rounded-scholar border border-border bg-highlight/10 p-2">
                        <div className="text-xs font-semibold text-text-soft uppercase tracking-wide">{t('builder.guardrailsTitle')}</div>
                        <ul className="mt-1 space-y-1">
                          {selectedCatalogNode.guardrail_warning_i18n_keys.slice(0, 4).map((key) => (
                            <li key={key} className="text-xs text-text">
                              - {t(key as any)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-text-soft">
                      <div>
                        <div className="font-semibold">{t('builder.nodeKind')}</div>
                        <div className="text-text">{selectedNodeKind}</div>
                      </div>
                      <div>
                        <div className="font-semibold">{t('builder.nodeContracts')}</div>
                        <div className="text-text">
                          {(selectedCatalogNode?.input_contract || '—')}&nbsp;→&nbsp;{(selectedCatalogNode?.output_contract || '—')}
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const { props, ordered } = schemaToFieldOrder(selectedCatalogNode?.config_schema || null, selectedCatalogNode?.ui_hints || null);
                      const currentConfig = isRecord((selectedNode.data as any)?.config) ? ((selectedNode.data as any).config as Record<string, unknown>) : {};
                      if (ordered.length === 0) return null;

                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {ordered.map((key) => {
                            const field = props[key] || {};
                            const label = field.title || key;
                            const value = currentConfig[key];

                            if (Array.isArray(field.enum)) {
                              return (
                                <label key={key} className="space-y-1">
                                  <div className="text-xs font-medium text-text-soft">{label}</div>
                                  <select
                                    className="w-full rounded-scholar border border-border bg-surface px-3 py-2 text-sm text-text"
                                    value={typeof value === 'string' ? value : ''}
                                    onChange={(e) => updateSelectedNodeConfig({ ...currentConfig, [key]: e.target.value })}
                                  >
                                    <option value="">{t('builder.selectPlaceholder')}</option>
                                    {field.enum.map((opt, idx) => (
                                      <option key={idx} value={String(opt)}>
                                        {String(opt)}
                                      </option>
                                    ))}
                                  </select>
                                  {field.description ? <div className="text-xs text-text-soft">{field.description}</div> : null}
                                </label>
                              );
                            }

                            if (field.type === 'boolean') {
                              return (
                                <label key={key} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={value === true}
                                    onChange={(e) => updateSelectedNodeConfig({ ...currentConfig, [key]: e.target.checked })}
                                  />
                                  <span className="text-sm text-text">{label}</span>
                                </label>
                              );
                            }

                            if (field.type === 'array' || field.type === 'object') {
                              return (
                                <label key={key} className="space-y-1 md:col-span-2">
                                  <div className="text-xs font-medium text-text-soft">{label}</div>
                                  <textarea
                                    className="w-full min-h-[64px] rounded-scholar border border-border bg-surface px-3 py-2 text-sm text-text font-mono"
                                    value={JSON.stringify(value ?? (field.type === 'array' ? [] : {}), null, 2)}
                                    onChange={(e) => {
                                      try {
                                        const parsed = JSON.parse(e.target.value || (field.type === 'array' ? '[]' : '{}'));
                                        updateSelectedNodeConfig({ ...currentConfig, [key]: parsed });
                                      } catch {
                                        // keep last valid value; user can use raw config editor for complex editing
                                      }
                                    }}
                                  />
                                  {field.description ? <div className="text-xs text-text-soft">{field.description}</div> : null}
                                </label>
                              );
                            }

                            const isNumber = field.type === 'number' || field.type === 'integer';
                            return (
                              <label key={key} className="space-y-1">
                                <div className="text-xs font-medium text-text-soft">{label}</div>
                                <Input
                                  value={value === undefined || value === null ? '' : String(value)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const next = isNumber ? (raw.trim() ? Number(raw) : undefined) : raw;
                                    updateSelectedNodeConfig({ ...currentConfig, [key]: next });
                                  }}
                                  placeholder={label}
                                />
                                {field.description ? <div className="text-xs text-text-soft">{field.description}</div> : null}
                              </label>
                            );
                          })}
                        </div>
                      );
                    })()}

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-text-soft mb-1">{t('builder.rawConfig')}</div>
                      <textarea
                        value={rawConfigDraft}
                        onChange={(e) => setRawConfigDraft(e.target.value)}
                        className="w-full min-h-[120px] rounded-scholar border border-border bg-surface px-3 py-2 text-xs text-text font-mono"
                      />
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <Button variant="ghost" size="sm" onClick={applyRawConfigDraft}>
                          {t('builder.applyConfig')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-text-soft mb-1">{t('builder.testInput')}</div>
                  <textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    className="w-full min-h-[86px] rounded-scholar border border-border bg-surface px-3 py-2 text-sm text-text"
                  />
                </div>
                <Button onClick={runTest} disabled={running || !selectedPipelineId}>
                  <Play className="w-4 h-4 mr-1" />
                  {running ? t('builder.running') : t('builder.testRun')}
                </Button>
              </div>

              {activeRunId ? (
                <div className="border border-border rounded-scholar p-3 bg-surface">
                  <div className="text-xs font-semibold text-text-soft uppercase tracking-wide mb-2">{t('builder.liveEvents')}</div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge size="sm" variant={nodeBadgeVariant(runStatus)}>
                      {t('builder.runStatus')}: {runStatus || 'running'}
                    </Badge>
                    {runStatusReason ? (
                      <Badge size="sm" variant="warning">
                        {t('builder.statusReason')}: {runStatusReason}
                      </Badge>
                    ) : null}
                  </div>

                  {waitingHumanNodes.length > 0 ? (
                    <div className="mb-3 space-y-2">
                      <div className="text-xs font-semibold text-text-soft uppercase tracking-wide">{t('builder.approvalsTitle')}</div>
                      <div className="flex flex-wrap gap-2">
                        {waitingHumanNodes.map((node) => (
                          <div key={`approve-${node.node_id}`} className="flex items-center gap-2 border border-border rounded-scholar px-2 py-1">
                            <span className="text-xs">{node.node_id}</span>
                            <Button size="sm" variant="ghost" onClick={() => runNodeAction(node.node_id, 'approve')}>
                              {t('builder.approve')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => runNodeAction(node.node_id, 'reject')}>
                              {t('builder.reject')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {retryableNodes.length > 0 ? (
                    <div className="mb-3 space-y-2">
                      <div className="text-xs font-semibold text-text-soft uppercase tracking-wide">{t('builder.retryTitle')}</div>
                      <div className="flex flex-wrap gap-2">
                        {retryableNodes.map((node) => (
                          <div key={`retry-${node.node_id}`} className="flex items-center gap-2 border border-border rounded-scholar px-2 py-1">
                            <span className="text-xs">{node.node_id}</span>
                            <Badge size="sm" variant={node.status === 'failed' ? 'error' : 'warning'}>
                              {node.status}
                            </Badge>
                            <Button size="sm" variant="ghost" onClick={() => runNodeAction(node.node_id, 'retry')}>
                              {t('builder.retry')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {policyDeniedEvents.length > 0 ? (
                    <div className="mb-3 border border-red-200 bg-red-50 text-red-700 rounded-scholar p-2 text-xs space-y-1">
                      <div className="font-semibold">{t('builder.policyDeniedTitle')}</div>
                      {policyDeniedEvents.map((event: any) => (
                        <div key={`policy-${event.id}`}>
                          #{event.id} {String(event.node_id || 'run')}: {String((event.payload_preview_json as any)?.reason || 'policy_denied')}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 mb-3">
                    {nodes.map((node) => (
                      <Badge key={node.id} size="sm" variant={nodeBadgeVariant(nodeStatusById[node.id])}>
                        {node.id}: {nodeStatusById[node.id] || 'pending'}
                      </Badge>
                    ))}
                  </div>
                  <div className="max-h-[180px] overflow-auto text-xs text-text-soft space-y-1">
                    {runEvents.length === 0 ? (
                      <div>{t('builder.noEvents')}</div>
                    ) : (
                      runEvents.slice(-40).map((event: any) => (
                        <div key={`${event.id}`} className="flex items-center gap-2">
                          <span className="font-mono text-[11px]">#{event.id}</span>
                          <span>{String(event.event_type || 'event')}</span>
                          {event.node_id ? <span className="text-text">[{String(event.node_id)}]</span> : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </ScholarNotebookCard>
      </div>
    </div>
  );
}
