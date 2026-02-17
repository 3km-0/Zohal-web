export type RightPaneMode = 'chat' | 'analysis';

export type AnalysisRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type AnalysisRunScope = 'single' | 'bundle';
export type AnalysisRunDocsetMode = 'ephemeral' | 'saved';

export interface AnalysisRunSummary {
  runId: string;
  actionId: string | null;
  status: AnalysisRunStatus;
  createdAt: string;
  updatedAt: string;
  templateId: string | null;
  playbookLabel: string | null;
  scope: AnalysisRunScope;
  packId: string | null;
  docsetMode: AnalysisRunDocsetMode | null;
  savedDocsetName: string | null;
  versionId: string | null;
  verificationObjectId: string | null;
}
