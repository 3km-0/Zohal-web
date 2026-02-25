export interface AnalysisV3WebFlags {
  enabled: boolean;
}

export interface WebSubscriptionFlags {
  v2Enabled: boolean;
}

export interface PipelineBuilderWebFlags {
  enabled: boolean;
  workspaceAllowlist: Set<string>;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function parseAllowlist(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function getAnalysisV3WebFlags(): AnalysisV3WebFlags {
  return {
    enabled: readBool(process.env.NEXT_PUBLIC_ANALYSIS_V3_ENABLED, false),
  };
}

export function getWebSubscriptionFlags(): WebSubscriptionFlags {
  return {
    v2Enabled: readBool(process.env.NEXT_PUBLIC_WEB_SUBSCRIPTION_V2, false),
  };
}

export function getPipelineBuilderWebFlags(): PipelineBuilderWebFlags {
  return {
    enabled: readBool(process.env.NEXT_PUBLIC_PIPELINE_BUILDER_ENABLED, false),
    workspaceAllowlist: parseAllowlist(process.env.NEXT_PUBLIC_PIPELINE_BUILDER_WORKSPACE_ALLOWLIST),
  };
}

export function isPipelineBuilderEnabledForWorkspace(workspaceId: string): boolean {
  const flags = getPipelineBuilderWebFlags();
  if (!flags.enabled) return false;
  const wid = workspaceId.trim().toLowerCase();
  if (!wid) return false;
  if (flags.workspaceAllowlist.size === 0) return true;
  return flags.workspaceAllowlist.has(wid);
}
