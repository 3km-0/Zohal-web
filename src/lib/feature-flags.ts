export interface AnalysisV3WebFlags {
  enabled: boolean;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function getAnalysisV3WebFlags(): AnalysisV3WebFlags {
  return {
    enabled: readBool(process.env.NEXT_PUBLIC_ANALYSIS_V3_ENABLED, false),
  };
}

