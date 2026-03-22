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

export interface AnalysisRunLibrarySource {
  libraryItemId: string;
  title: string | null;
  authority: string | null;
  jurisdiction: string | null;
  versionLabel: string | null;
}

export interface AnalysisRunCorpusResolution {
  corpusId: string | null;
  corpusKind: string | null;
  primaryDocumentId: string | null;
  documentIds: string[];
  memberRoles: AnalysisRunMemberRole[];
  precedencePolicy: AnalysisRunPrecedencePolicy;
  legacyPackId: string | null;
  savedLabel: string | null;
  librarySources: AnalysisRunLibrarySource[];
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
  corpusId: string | null;
  corpusKind: string | null;
  docsetMode: AnalysisRunDocsetMode | null;
  savedDocsetName: string | null;
  versionId: string | null;
  verificationObjectId: string | null;
  corpusResolution: AnalysisRunCorpusResolution | null;
  rememberedRelatedDocuments: RememberedRelatedDocuments | null;
}
