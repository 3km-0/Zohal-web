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

export type SnapshotSchemaVersion = '1.0' | '2.0'

export type SnapshotTemplate = 
  | 'renewal_pack' 
  | 'lease_pack' 
  | 'diligence_pack' 
  | 'coverage_pack' 
  | 'contract_analysis'

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

/** Links extracted data back to source document location */
export interface EvidenceAnchor {
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

// =============================================================================
// Evidence Grade Snapshot
// =============================================================================

/** The canonical snapshot structure for evidence-grade contract analysis (Schema v2.0) */
export interface EvidenceGradeSnapshot {
  schema_version: SnapshotSchemaVersion
  template: SnapshotTemplate
  
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
    template: 'contract_analysis',
    variables,
    clauses,
    obligations,
    risks,
    analyzed_at: legacy.analyzed_at || new Date().toISOString(),
    chunks_analyzed: legacy.chunks_analyzed || 0,
    document_id: documentId
  }
}

/** Parse snapshot from raw object, handling both v1 and v2 formats */
export function parseSnapshot(raw: unknown, documentId: string): EvidenceGradeSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  
  const obj = raw as Record<string, unknown>
  const schemaVersion = obj.schema_version as string | undefined
  
  if (schemaVersion === '2.0') {
    // Already v2 format
    return raw as EvidenceGradeSnapshot
  }
  
  // Convert from v1
  return convertLegacySnapshot(raw as LegacyContractSnapshot, documentId)
}
