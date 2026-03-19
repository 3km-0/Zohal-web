export type RightPaneMode = 'chat' | 'analysis';

export type AnalysisRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type AnalysisRunScope = 'single' | 'bundle';
export type AnalysisRunDocsetMode = 'ephemeral' | 'saved';
export type AnalysisRunPrecedencePolicy = 'manual' | 'primary_first' | 'latest_wins';

export interface AnalysisRunMemberRole {
  documentId: string;
  role: string;
  sortOrder: number;
}

export interface RememberedRelatedDocuments {
  sourceRunId: string;
  scope: AnalysisRunScope;
  documentIds: string[];
  memberRoles: AnalysisRunMemberRole[];
  primaryDocumentId: string | null;
  precedencePolicy: AnalysisRunPrecedencePolicy;
}

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
  rememberedRelatedDocuments: RememberedRelatedDocuments | null;
}
