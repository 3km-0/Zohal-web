// Database types matching the Supabase schema

export type WorkspaceType =
  | 'project'
  | 'case'
  | 'course'
  | 'personal'
  | 'archive'
  | 'research'
  | 'client'
  | 'other';

export type DocumentType =
  | 'textbook'
  | 'lecture_notes'
  | 'problem_set'
  | 'paper'
  | 'personal_notes'
  | 'contract'
  | 'financial_report'
  | 'meeting_notes'
  | 'invoice'
  | 'legal_filing'
  | 'research'
  | 'other';

export type ProcessingStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'chunked'
  | 'embedding'
  | 'completed'
  | 'failed';

// Note types matching database
export type NoteType =
  | 'text'           // User-typed text note
  | 'handwritten'    // Canvas with ink data
  | 'ai_saved'       // Saved AI response
  | 'conversation';  // Chat conversation

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type SubscriptionTier = 'free' | 'core' | 'pro' | 'pro_plus' | 'premium' | 'team';

export interface Profile {
  id: string;
  email?: string | null;
  display_name?: string | null;  // Note: DB uses display_name, not full_name
  avatar_url?: string | null;
  user_type?: string;
  education_level?: string | null;
  institution?: string | null;
  major?: string | null;
  graduation_year?: number | null;
  default_org_id?: string | null;
  timezone?: string | null;
  onboarding_persona?: string | null;
  subscription_tier: SubscriptionTier;
  subscription_status?: string;
  subscription_expires_at?: string | null;
  daily_explanation_count?: number;
  daily_explanation_reset_at?: string;
  total_explanations_lifetime?: number;
  preferred_explanation_depth?: string | null;
  preferred_hint_style?: string | null;
  total_xp?: number;
  current_streak_days?: number;
  longest_streak_days?: number;
  last_study_date?: string | null;
  created_at: string;
  updated_at: string;
  onboarding_completed_at?: string | null;
  last_active_at?: string | null;
}

export interface Workspace {
  id: string;
  org_id?: string | null;
  owner_id: string;
  name: string;
  description?: string | null;
  workspace_type: WorkspaceType;
  primary_plugin_family?: string | null;
  status?: string;
  color?: string | null;
  icon?: string | null;
  sort_index?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Document {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  folder_id?: string | null;  // Folder within workspace (null = workspace root)
  
  // Document identity
  title: string;
  original_filename?: string | null;
  document_type: DocumentType;  // Required, defaults to 'textbook' in DB
  
  // Storage
  storage_path: string;
  storage_bucket: string;  // 'documents' or 'gcs'
  file_size_bytes?: number | null;
  page_count?: number | null;
  
  // Source tracking
  source_type?: string | null;  // 'local', 'gdrive', 'onedrive', etc.
  source_integration_id?: string | null;
  source_metadata?: Record<string, unknown> | null;
  
  // Metadata extraction
  detected_subject?: string | null;
  detected_level?: string | null;
  isbn?: string | null;
  author?: string | null;
  publisher?: string | null;
  edition?: string | null;
  
  // Processing status
  processing_status: ProcessingStatus;
  text_extraction_completed: boolean;
  toc_extraction_completed: boolean;
  embedding_completed: boolean;
  ocr_status?: string | null;  // 'not_needed', 'pending', 'processing', 'completed', 'failed'
  has_text_layer?: boolean | null;
  privacy_mode?: boolean;  // True = original PDF stays on-device
  
  // User state
  is_active: boolean;
  last_opened_at?: string | null;
  total_study_time_seconds: number;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface WorkspaceFolder {
  id: string;
  workspace_id: string;
  parent_id?: string | null;  // nil = root folder
  name: string;
  icon?: string | null;
  color?: string | null;
  sort_index?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface FolderWithStats extends WorkspaceFolder {
  document_count: number;
  subfolder_count: number;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  workspace_id: string;
  user_id: string;
  page_number: number;
  chunk_index: number;
  chunk_type: string;
  content_text: string;
  content_hash: string;
  language: string;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  workspace_id?: string | null;  // Can be null - notes can be workspace-independent
  document_id?: string | null;
  selection_id?: string | null;
  page_number?: number | null;
  anchor_position?: Record<string, unknown> | null;
  
  // Content & Type
  note_type: NoteType;
  note_text?: string | null;  // Note: DB uses note_text, not content_text
  note_latex?: string | null;
  ink_data_url?: string | null;  // URL to drawing in storage
  
  // For handwritten problem solving
  problem_text?: string | null;
  problem_latex?: string | null;
  problem_type?: string | null;
  expected_answer_text?: string | null;
  expected_answer_latex?: string | null;
  recognized_latex?: string | null;
  verification_status?: 'pending' | 'checking' | 'correct' | 'incorrect' | 'partial' | 'uncertain' | null;
  total_steps?: number;
  correct_steps?: number;
  hints_used?: number;
  solution_revealed?: boolean;
  started_at?: string | null;
  completed_at?: string | null;
  
  // For ai_saved type
  source_explanation_id?: string | null;
  
  // Metadata
  tags?: string[] | null;
  color?: string | null;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Task {
  id: string;
  workspace_id?: string | null;
  document_id?: string | null;
  created_by: string;  // Note: DB uses created_by, not user_id
  assignee_user_id?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  due_at?: string | null;
  priority?: number | null;
  source_insight_id?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  deleted_at?: string | null;
}

export interface Insight {
  id: string;
  workspace_id: string;
  document_id: string;
  chunk_id?: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  due_at?: string;
  number_value?: number;
  text_value?: string;
  currency?: string;
  source_refs?: Array<{
    chunk_id: string;
    page: number;
    quote: string;
  }>;
  confidence?: number;
  created_at: string;
}

export interface Explanation {
  id: string;
  user_id: string;
  document_id?: string;
  conversation_id?: string;
  role: 'user' | 'assistant';
  request_type: string;
  input_text?: string;
  response_text?: string;
  response_html?: string;
  model_used?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;
  created_at: string;
}

export interface LegalContract {
  id: string;
  document_id: string;
  workspace_id: string;
  contract_type?: string;
  effective_date?: string;
  end_date?: string;
  term_length_months?: number;
  notice_period_days?: number;
  auto_renewal?: boolean;
  termination_for_convenience?: boolean;
  governing_law?: string;
  counterparty_name?: string;
  status?: string;
  verification_object_id?: string;
  created_at: string;
  updated_at: string;
}

export interface LegalClause {
  id: string;
  contract_id: string;
  clause_type: string;
  clause_title?: string;
  clause_number?: string;
  text: string;
  risk_level: 'low' | 'medium' | 'high';
  page_number?: number;
  start_page?: number;
  end_page?: number;
  char_start?: number;
  char_end?: number;
  is_missing_standard_protection?: boolean;
  created_at: string;
}

// Obligation confidence states - MVP: Contract Obligations Verification
export type ObligationConfidenceState = 'extracted' | 'needs_review' | 'confirmed';

export interface LegalObligation {
  id: string;
  contract_id: string;
  task_id?: string;
  obligation_type: string;
  due_at?: string;
  recurrence?: string;
  
  // NEW: Full obligation details for MVP - Contract Obligations Verification
  summary?: string;           // What is this obligation?
  action?: string;            // What specific action is required?
  condition?: string;         // Under what conditions?
  responsible_party?: string; // Who must perform (us/counterparty/mutual)
  
  // Confidence state system (workflow state: extracted → needs_review → confirmed)
  confidence_state: ObligationConfidenceState;
  
  // AI's self-reported confidence in the extraction (high/medium/low)
  // This is separate from confidence_state which is a workflow state
  confidence?: 'high' | 'medium' | 'low';
  
  // Source clause linking for highlight/navigation
  source_clause_id?: string;
  page_number?: number;
  
  // User verification tracking
  user_notes?: string;
  confirmed_at?: string;
  confirmed_by?: string;
  
  created_at: string;
}

// Verification Object types for audit trail
export type VerificationState = 'provisional' | 'finalized';
export type VerificationVisibility = 'private' | 'workspace' | 'link';

export interface VerificationObject {
  id: string;
  workspace_id: string;
  document_id: string;
  user_id: string;
  object_type: string;
  title?: string;
  state: VerificationState;
  current_version_id?: string;
  finalized_by?: string;
  finalized_at?: string;
  visibility: VerificationVisibility;
  share_token?: string;
  created_at: string;
  updated_at: string;
}

export interface VerificationObjectVersion {
  id: string;
  verification_object_id: string;
  version_number: number;
  state: VerificationState;
  snapshot_json: Record<string, unknown>;
  diff_summary_json?: {
    added: Array<{ category: string; item_id?: string; description: string }>;
    removed: Array<{ category: string; item_id?: string; description: string }>;
    changed: Array<{ category: string; field: string; old_value?: string; new_value?: string }>;
  };
  change_notes?: string;
  created_by?: string;
  created_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

export interface LegalRiskFlag {
  id: string;
  contract_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  explanation?: string;
  resolved: boolean;
  page_number?: number | null;
  created_at: string;
}

// Payment-related types
export type PaymentStatus = 'initiated' | 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
export type PaymentSource = 'apple' | 'moyasar' | 'stripe' | 'manual';

export interface PaymentMethod {
  id: string;
  user_id: string;
  moyasar_token: string;
  card_last_four?: string | null;
  card_brand?: string | null;
  card_holder_name?: string | null;
  card_expiry_month?: number | null;
  card_expiry_year?: number | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPayment {
  id: string;
  user_id: string;
  payment_method_id?: string | null;
  moyasar_payment_id?: string | null;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  subscription_tier: string;
  subscription_period: 'monthly' | 'yearly';
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  failure_reason?: string | null;
  failure_count: number;
  retry_at?: string | null;
  is_renewal: boolean;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  tier: string;
  name: string;
  description?: string | null;
  price_monthly_usd?: number | null;
  price_yearly_usd?: number | null;
  price_monthly_sar?: number | null;
  price_yearly_sar?: number | null;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  badge_text?: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Search result types
export interface SearchResult {
  chunk_id: string;
  document_id: string;
  document_title: string;
  page_number: number;
  content_text: string;
  content_preview: string;
  similarity: number;
  language: string;
}

export interface AskWorkspaceResult {
  success: boolean;
  conversation_id: string;
  question: string;
  answer: string;
  citations: Array<{
    document_id: string;
    document_title: string;
    page_number: number;
    quote: string;
    chunk_id: string;
  }>;
  confidence: number;
  source: 'insights' | 'rag';
}

