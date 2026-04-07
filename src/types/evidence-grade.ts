/**
 * Evidence-Grade Snapshot Types (Schema v2.0)
 * 
 * These types represent the CANONICAL truth stored in
 * verification_object_versions.snapshot_json.
 * 
 * Key concepts:
 * - VerifiedVariable: Structured, typed facts with evidence anchors
 * - EvidenceAnchor: Links extracted data back to source document (Tap-to-Proof)
 * - VerificationState: Workflow state (extracted → needs_review → verified → finalized)
 */

// =============================================================================
// Schema Version & Template
// =============================================================================

export type SnapshotSchemaVersion = string

/**
 * Template ID (lane).
 *
 * Forward-compatibility requirement:
 * - Backend may introduce new template IDs after the web app is deployed.
 * - Keep this type open so unknown templates don't break builds.
 *
 * Known values today include:
 * - 'renewal_pack'
 * - 'lease_pack'
 * - 'diligence_pack'
 * - 'coverage_pack'
 * - 'contract_analysis'
 */
export type SnapshotTemplate = string

// =============================================================================
// Verification States
// =============================================================================

/** Verification workflow state for individual items */
export type ItemVerificationState = 
  | 'extracted'      // AI-extracted, not yet reviewed
  | 'needs_review'   // Flagged for human review
  | 'verified'       // Human-confirmed
  | 'finalized'      // Locked, audit-ready

/** AI confidence level for extractions */
export type AIConfidence = 'high' | 'medium' | 'low'

/** Variable types for verified variables */
export type VariableType = 'text' | 'date' | 'money' | 'duration' | 'boolean' | 'number'

// =============================================================================
// Evidence Anchor (Core of Tap-to-Proof)
// =============================================================================

/** Bounding box for visual evidence location (normalized 0-1 coordinates) */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ApiSourceInfo {
  connection_id: string
  connection_name: string
  endpoint_url: string
  fetched_at: string
  response_path?: string
}

/** Links extracted data back to source document location */
export interface EvidenceAnchor {
  /** Optional source document ID (for multi-document bundles). */
  document_id?: string

  /** Page number where evidence was found (1-indexed) */
  page_number: number
  
  /** Reference to document_chunks.id for stable linking */
  chunk_id?: string
  
  /** Verbatim text snippet from source (50-150 chars) */
  snippet: string
  
  /** Character offset within chunk (optional) */
  char_start?: number
  char_end?: number
  
  /** Visual bounding box (only if available from extraction) */
  bbox?: BoundingBox

  /** Source type: document (default if absent) or api */
  source_type?: 'document' | 'api'

  /** API source provenance (present when source_type === 'api') */
  api_source?: ApiSourceInfo
}

// =============================================================================
// Verified Variable
// =============================================================================

/** A verified variable with evidence anchor - the atomic unit of evidence-grade data */
export interface VerifiedVariable {
  id: string
  
  /** Machine name (e.g., "effective_date", "notice_period_days") */
  name: string
  
  /** Human-readable name (e.g., "Effective Date", "Notice Period") */
  display_name: string
  
  /** Variable type for formatting/validation */
  type: VariableType
  
  /** The value (can be string, number, or boolean) */
  value: string | number | boolean | null
  
  /** Unit for duration/money types (e.g., "days", "SAR", "months") */
  unit?: string
  
  /** Current verification state */
  verification_state: ItemVerificationState
  
  /** Evidence linking back to source document */
  evidence?: EvidenceAnchor
  
  /** AI's confidence in this extraction */
  ai_confidence: AIConfidence

  /** Deterministic verifier result (additive metadata; optional) */
  verifier?: {
    status: 'green' | 'yellow' | 'red'
    reasons: string[]
  }
}

// =============================================================================
// Clause With Evidence
// =============================================================================

/** A contract clause with evidence anchor */
export interface ClauseWithEvidence {
  id: string
  clause_type: string
  clause_title?: string
  clause_number?: string
  text: string
  risk_level: 'low' | 'medium' | 'high'
  is_missing_standard_protection?: boolean
  verification_state: ItemVerificationState
  evidence?: EvidenceAnchor
}

// =============================================================================
// Obligation With Evidence
// =============================================================================

/** A contract obligation with evidence anchor */
export interface ObligationWithEvidence {
  id: string
  obligation_type: string
  summary?: string
  action?: string
  condition?: string
  responsible_party?: string
  due_at?: string
  recurrence?: string
  verification_state: ItemVerificationState
  evidence?: EvidenceAnchor
  ai_confidence: AIConfidence
}

// =============================================================================
// Risk With Evidence
// =============================================================================

/** A risk flag with optional evidence */
export interface RiskWithEvidence {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  explanation?: string
  evidence?: EvidenceAnchor
  resolved: boolean
}

export interface AnalysisRecord {
  id: string
  record_type: string
  module_id?: string
  module_title?: string
  title?: string
  summary?: string
  status?: 'proposed' | 'confirmed' | 'rejected' | 'resolved'
  severity?: string
  rationale?: string
  group_key?: string
  renderer_hint?: string
  show_in_report?: boolean
  display_order?: number
  fields?: Record<string, unknown>
  evidence?: EvidenceAnchor[]
  provenance?: Record<string, unknown>
}

export interface CanonicalSourceAnchor {
  document_id?: string
  page_number: number
  chunk_id?: string
  snippet: string
  char_start?: number
  char_end?: number
  bbox?: BoundingBox
  source_type?: 'document' | 'api'
  api_source?: ApiSourceInfo
}

export interface CanonicalItemV3 {
  id: string
  provenance_class: 'extracted' | 'derived'
  structural_facet: string
  display_name: string
  payload: Record<string, unknown>
  confidence: AIConfidence
  verification_state: ItemVerificationState
  source_anchors?: CanonicalSourceAnchor[]
  anchor_integrity?: 'verified' | 'unverified' | 'failed'
  derivation?: {
    input_item_ids: string[]
    method: string
    rationale?: string
    verifier_outcome?: 'confirmed' | 'disputed' | 'skipped'
  }
  created_at: string
  updated_at?: string
  template_target_id?: string
}

export interface CanonicalSnapshotV3 {
  schema_version: '3.0'
  run_id?: string | null
  workspace_id?: string | null
  corpus_revision_id?: string | null
  template_id: string
  template_version?: string
  document_id?: string
  source_manifest?: Record<string, unknown>
  items: CanonicalItemV3[]
  links: Array<{
    id: string
    type: string
    from_item_id: string
    to_item_id: string
    metadata?: Record<string, unknown>
  }>
  proof_manifest?: Record<string, unknown>
  stage_trace?: Record<string, unknown>
  analyzed_at: string
}

// =============================================================================
// Evidence Grade Snapshot
// =============================================================================

/** The canonical snapshot structure for evidence-grade contract analysis (Schema v2.0) */
export interface EvidenceGradeSnapshot {
  schema_version: SnapshotSchemaVersion
  template: SnapshotTemplate

  /**
   * Optional pack metadata (additive).
   * Written by the reducer to capture template/module activation and computed outputs.
   * Clients must tolerate unknown modules and payload shapes.
   */
  pack?: {
    template_id?: string
    template_version?: string
    modules_activated?: string[]
    modules?: Record<string, unknown>
    capabilities?: {
      analysis_v3?: {
        enabled?: boolean
        web_enabled?: boolean
        ios_enabled?: boolean
      }
      [k: string]: unknown
    }
    // Multi-document bundles (additive)
    bundle?: {
      bundle_id?: string
      pack_id?: string
      document_ids?: string[]
      document_hashes?: Record<string, string>
      precedence_policy?: string
      member_roles?: Array<{ document_id: string; role: string; sort_order?: number }>
    }
    discrepancies?: Array<Record<string, unknown>>
    // Pinned context sets (manifest only; v1)
    context?: Record<string, unknown>
    // Playbooks (additive)
    playbook?: Record<string, unknown>
    // Analysis V3 additive sections
    records?: AnalysisRecord[]
    rules?: Array<Record<string, unknown>>
    verdicts?: Array<Record<string, unknown>>
    exceptions_v3?: Array<Record<string, unknown>>
    exceptions_summary?: { blocker: number; warning: number }
    exceptions?: Array<Record<string, unknown>>
  }
  
  /** Verified variables (the core of evidence-grade data) */
  variables: VerifiedVariable[]
  
  /** Extracted clauses with evidence */
  clauses: ClauseWithEvidence[]
  
  /** Extracted obligations with evidence */
  obligations: ObligationWithEvidence[]
  
  /** Risk flags */
  risks: RiskWithEvidence[]
  
  /** When this analysis was performed */
  analyzed_at: string
  
  /** Number of document chunks analyzed */
  chunks_analyzed: number
  
  /** Source document ID */
  document_id: string
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Get a variable by name from the snapshot */
export function getVariable(snapshot: EvidenceGradeSnapshot, name: string): VerifiedVariable | undefined {
  return snapshot.variables.find(v => v.name === name)
}

/** Get variables that need review */
export function getVariablesNeedingReview(snapshot: EvidenceGradeSnapshot): VerifiedVariable[] {
  return snapshot.variables.filter(v => v.verification_state === 'needs_review')
}

/** Get obligations that need review */
export function getObligationsNeedingReview(snapshot: EvidenceGradeSnapshot): ObligationWithEvidence[] {
  return snapshot.obligations.filter(o => o.verification_state === 'needs_review')
}

/** Get unresolved risks */
export function getUnresolvedRisks(snapshot: EvidenceGradeSnapshot): RiskWithEvidence[] {
  return snapshot.risks.filter(r => !r.resolved)
}

/** Check if all items have been verified */
export function isFullyVerified(snapshot: EvidenceGradeSnapshot): boolean {
  const allVariablesVerified = snapshot.variables.every(
    v => v.verification_state === 'verified' || v.verification_state === 'finalized'
  )
  const allObligationsVerified = snapshot.obligations.every(
    o => o.verification_state === 'verified' || o.verification_state === 'finalized'
  )
  return allVariablesVerified && allObligationsVerified
}

/** Get total count of items needing review */
export function getTotalNeedingReview(snapshot: EvidenceGradeSnapshot): number {
  return getVariablesNeedingReview(snapshot).length + getObligationsNeedingReview(snapshot).length
}

// =============================================================================
// Legacy Snapshot Conversion
// =============================================================================

/** Legacy snapshot format (v1) */
export interface LegacyContractSnapshot {
  contract_type?: string
  effective_date?: string
  end_date?: string
  term_length_months?: number
  notice_period_days?: number
  auto_renewal: boolean
  termination_for_convenience: boolean
  governing_law?: string
  counterparty_name?: string
  clauses: Array<{
    clause_type: string
    clause_title?: string
    clause_number?: string
    text: string
    risk_level: string
    page_number?: number
    is_missing_standard_protection?: boolean
  }>
  obligations: Array<{
    obligation_type: string
    due_at?: string
    recurrence?: string
    responsible_party?: string
    summary?: string
    action?: string
    condition?: string
    confidence?: string
    source_clause_type?: string
    page_number?: number
  }>
  risks: Array<{
    severity: string
    description: string
    explanation?: string
  }>
  analyzed_at?: string
  chunks_analyzed?: number
}

/** Convert legacy v1 snapshot to v2 format */
export function convertLegacySnapshot(legacy: LegacyContractSnapshot, documentId: string): EvidenceGradeSnapshot {
  const variables: VerifiedVariable[] = []
  const generateId = () => crypto.randomUUID()
  
  // Convert contract-level fields to variables
  const fieldMappings: Array<{
    key: keyof LegacyContractSnapshot
    name: string
    displayName: string
    type: VariableType
    unit?: string
  }> = [
    { key: 'counterparty_name', name: 'counterparty_name', displayName: 'Counterparty', type: 'text' },
    { key: 'contract_type', name: 'contract_type', displayName: 'Contract Type', type: 'text' },
    { key: 'governing_law', name: 'governing_law', displayName: 'Governing Law', type: 'text' },
    { key: 'effective_date', name: 'effective_date', displayName: 'Effective Date', type: 'date' },
    { key: 'end_date', name: 'end_date', displayName: 'End Date', type: 'date' },
    { key: 'term_length_months', name: 'term_length_months', displayName: 'Term Length', type: 'duration', unit: 'months' },
    { key: 'notice_period_days', name: 'notice_period_days', displayName: 'Notice Period', type: 'duration', unit: 'days' },
    { key: 'auto_renewal', name: 'auto_renewal', displayName: 'Auto-Renewal', type: 'boolean' },
    { key: 'termination_for_convenience', name: 'termination_for_convenience', displayName: 'Termination for Convenience', type: 'boolean' },
  ]
  
  for (const mapping of fieldMappings) {
    const value = legacy[mapping.key]
    if (value !== undefined && value !== null) {
      variables.push({
        id: generateId(),
        name: mapping.name,
        display_name: mapping.displayName,
        type: mapping.type,
        value: value as string | number | boolean,
        unit: mapping.unit,
        verification_state: 'extracted',
        ai_confidence: 'high'
      })
    }
  }
  
  // Convert clauses
  const clauses: ClauseWithEvidence[] = legacy.clauses.map(clause => ({
    id: generateId(),
    clause_type: clause.clause_type,
    clause_title: clause.clause_title,
    clause_number: clause.clause_number,
    text: clause.text,
    risk_level: clause.risk_level as 'low' | 'medium' | 'high',
    is_missing_standard_protection: clause.is_missing_standard_protection,
    verification_state: 'extracted' as ItemVerificationState,
    evidence: clause.page_number ? {
      page_number: clause.page_number,
      snippet: clause.text.substring(0, 100)
    } : undefined
  }))
  
  // Convert obligations
  const obligations: ObligationWithEvidence[] = legacy.obligations.map(obligation => ({
    id: generateId(),
    obligation_type: obligation.obligation_type,
    summary: obligation.summary,
    action: obligation.action,
    condition: obligation.condition,
    responsible_party: obligation.responsible_party,
    due_at: obligation.due_at,
    recurrence: obligation.recurrence,
    verification_state: (obligation.confidence === 'high' ? 'extracted' : 'needs_review') as ItemVerificationState,
    evidence: obligation.page_number ? {
      page_number: obligation.page_number,
      snippet: obligation.summary || obligation.action || ''
    } : undefined,
    ai_confidence: (obligation.confidence as AIConfidence) || 'high'
  }))
  
  // Convert risks
  const risks: RiskWithEvidence[] = legacy.risks.map(risk => ({
    id: generateId(),
    severity: risk.severity as 'low' | 'medium' | 'high' | 'critical',
    description: risk.description,
    explanation: risk.explanation,
    resolved: false
  }))
  
  return {
    schema_version: '2.0',
    template: 'document_analysis',
    variables,
    clauses,
    obligations,
    risks,
    analyzed_at: legacy.analyzed_at || new Date().toISOString(),
    chunks_analyzed: legacy.chunks_analyzed || 0,
    document_id: documentId
  }
}

function inferVariableTypeFromCanonicalItem(item: CanonicalItemV3): VariableType {
  const facet = String(item.structural_facet || '').toLowerCase()
  const payload = item.payload || {}
  if (typeof payload.value === 'boolean') return 'boolean'
  if (typeof payload.value === 'number') return 'number'
  if (typeof payload.amount === 'number') return 'money'
  if (typeof payload.date === 'string' || typeof payload.due_at === 'string') return 'date'
  if (facet === 'measure') return 'number'
  return 'text'
}

function canonicalAnchorToEvidence(anchor?: CanonicalSourceAnchor): EvidenceAnchor | undefined {
  if (!anchor) return undefined
  return {
    document_id: anchor.document_id,
    page_number: anchor.page_number,
    chunk_id: anchor.chunk_id,
    snippet: anchor.snippet,
    char_start: anchor.char_start,
    char_end: anchor.char_end,
    bbox: anchor.bbox,
  }
}

export function convertCanonicalSnapshotV3(snapshot: CanonicalSnapshotV3, documentId: string): EvidenceGradeSnapshot {
  const extractedItems = Array.isArray(snapshot.items)
    ? snapshot.items.filter((item) => item.provenance_class === 'extracted')
    : []
  const derivedItems = Array.isArray(snapshot.items)
    ? snapshot.items.filter((item) => item.provenance_class === 'derived')
    : []

  const variables: VerifiedVariable[] = extractedItems.map((item) => ({
    id: item.id,
    name: item.template_target_id || item.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    display_name: item.display_name,
    type: inferVariableTypeFromCanonicalItem(item),
    value:
      (item.payload?.value as string | number | boolean | null | undefined) ??
      (item.payload?.text as string | undefined) ??
      (item.payload?.summary as string | undefined) ??
      null,
    verification_state: item.verification_state,
    evidence: canonicalAnchorToEvidence(item.source_anchors?.[0]),
    ai_confidence: item.confidence,
    verifier:
      item.anchor_integrity === 'verified'
        ? { status: 'green', reasons: ['Source anchor verified'] }
        : item.anchor_integrity === 'failed'
        ? { status: 'red', reasons: ['Source anchor failed verification'] }
        : undefined,
  }))

  const obligations: ObligationWithEvidence[] = extractedItems
    .filter((item) => String(item.structural_facet || '').toLowerCase() === 'event')
    .map((item) => ({
      id: item.id,
      obligation_type: String(item.payload?.type || item.display_name || 'event'),
      summary: String(item.payload?.summary || item.display_name || ''),
      action: typeof item.payload?.action === 'string' ? item.payload.action : undefined,
      condition: typeof item.payload?.condition === 'string' ? item.payload.condition : undefined,
      responsible_party: typeof item.payload?.responsible_party === 'string' ? item.payload.responsible_party : undefined,
      due_at: typeof item.payload?.due_at === 'string' ? item.payload.due_at : undefined,
      recurrence: typeof item.payload?.recurrence === 'string' ? item.payload.recurrence : undefined,
      verification_state: item.verification_state,
      evidence: canonicalAnchorToEvidence(item.source_anchors?.[0]),
      ai_confidence: item.confidence,
    }))

  const clauses: ClauseWithEvidence[] = extractedItems
    .filter((item) => String(item.structural_facet || '').toLowerCase() === 'relationship')
    .map((item) => ({
      id: item.id,
      clause_type: String(item.payload?.type || item.display_name || 'relationship'),
      clause_title: item.display_name,
      text: String(item.payload?.text || item.payload?.summary || item.display_name || ''),
      risk_level: 'low',
      verification_state: item.verification_state,
      evidence: canonicalAnchorToEvidence(item.source_anchors?.[0]),
    }))

  const risks: RiskWithEvidence[] = derivedItems.map((item) => ({
    id: item.id,
    severity: (String(item.payload?.severity || '').toLowerCase() as 'low' | 'medium' | 'high' | 'critical') || 'medium',
    description: String(item.payload?.summary || item.payload?.description || item.display_name || 'Derived insight'),
    explanation:
      typeof item.derivation?.rationale === 'string'
        ? item.derivation.rationale
        : typeof item.payload?.explanation === 'string'
        ? item.payload.explanation
        : undefined,
    evidence: undefined,
    resolved: false,
  }))

  return {
    schema_version: '2.0',
    template: snapshot.template_id || 'document_analysis',
    variables,
    clauses,
    obligations,
    risks,
    analyzed_at: snapshot.analyzed_at || new Date().toISOString(),
    chunks_analyzed: Array.isArray(snapshot.source_manifest?.documents)
      ? snapshot.source_manifest.documents.reduce((sum: number, doc: any) => sum + Number(doc?.chunk_count || 0), 0)
      : 0,
    document_id: snapshot.document_id || documentId,
  }
}

/** Parse snapshot from raw object, handling both v1 and v2 formats */
export function parseSnapshot(raw: unknown, documentId: string): EvidenceGradeSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  
  const obj = raw as Record<string, unknown>
  const schemaVersion = obj.schema_version as string | undefined
  
  if (typeof schemaVersion === 'string' && schemaVersion.split('.')[0] === '3') {
    return convertCanonicalSnapshotV3(raw as CanonicalSnapshotV3, documentId)
  }

  if (typeof schemaVersion === 'string' && schemaVersion.split('.')[0] === '2') {
    // Already v2 format
    return raw as EvidenceGradeSnapshot
  }
  
  // Convert from v1
  return convertLegacySnapshot(raw as LegacyContractSnapshot, documentId)
}
