export type RightPaneMode = 'chat' | 'analysis';

export type AnalysisRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type AnalysisRunScope = 'single' | 'bundle';

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
  versionId: string | null;
  verificationObjectId: string | null;
}
