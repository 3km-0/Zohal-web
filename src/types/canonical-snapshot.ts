export type CanonicalConfidence = 'high' | 'medium' | 'low';

export type CanonicalVerificationState =
  | 'extracted'
  | 'needs_review'
  | 'verified'
  | 'finalized';

export type SourceAnchor = {
  document_id?: string;
  page_number: number;
  chunk_id?: string;
  snippet: string;
};

export type CanonicalDerivation = {
  input_item_ids: string[];
  method: string;
  rationale?: string;
  verifier_outcome?: 'confirmed' | 'disputed' | 'skipped';
};

export type CanonicalItem = {
  id: string;
  provenance_class: 'extracted' | 'derived';
  structural_facet: string;
  display_name: string;
  payload: Record<string, unknown>;
  confidence: CanonicalConfidence;
  verification_state: CanonicalVerificationState;
  source_anchors?: SourceAnchor[];
  anchor_integrity?: 'verified' | 'unverified' | 'failed';
  derivation?: CanonicalDerivation;
  created_at: string;
  updated_at?: string;
};

export type ItemLink = {
  id: string;
  type: string;
  from_item_id: string;
  to_item_id: string;
  metadata?: Record<string, unknown>;
};

export type SourceManifest = {
  documents: Array<{
    document_id: string;
    chunk_count: number;
    page_numbers: number[];
  }>;
  document_count: number;
};

export type ProofManifest = {
  proof_paths: {
    extracted: 'source_anchor';
    derived: 'lineage';
  };
  counts: {
    total_items: number;
    extracted_items: number;
    derived_items: number;
    anchor_verified_items: number;
    anchor_failed_items: number;
    derived_with_lineage: number;
  };
  review_policy?: Record<string, unknown>;
};

export type StageTrace = {
  execution_plane: 'gcp';
  entries: Array<{
    stage: string;
    status: string;
    at: string;
    metadata?: Record<string, unknown>;
  }>;
  metadata?: Record<string, unknown>;
};

export type CanonicalSnapshotV3 = {
  schema_version: '3.0';
  run_id: string | null;
  workspace_id: string | null;
  corpus_revision_id: string | null;
  template_id: string;
  template_version: string;
  document_id: string;
  source_manifest: SourceManifest;
  items: CanonicalItem[];
  links: ItemLink[];
  proof_manifest: ProofManifest;
  stage_trace: StageTrace;
  analyzed_at: string;
};
