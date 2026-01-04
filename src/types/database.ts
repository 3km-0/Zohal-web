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

export type NoteType =
  | 'user_written'
  | 'ai_summary'
  | 'extracted_insight'
  | 'chat_message';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type SubscriptionTier = 'free' | 'pro' | 'ultra';

export interface Profile {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  subscription_tier: SubscriptionTier;
  subscription_expires_at?: string | null;
  preferred_language: 'en' | 'ar';
  created_at: string;
  updated_at: string;
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
  workspace_id: string;
  user_id: string;
  title: string;
  original_filename?: string;
  storage_path?: string;
  file_size_bytes?: number;
  mime_type?: string;
  page_count?: number;
  document_type?: DocumentType;
  processing_status: ProcessingStatus;
  ocr_status?: string;
  has_text_layer?: boolean;
  embedding_completed?: boolean;
  thumbnail_url?: string;
  source_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
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
  workspace_id: string;
  document_id?: string;
  user_id: string;
  note_type: NoteType;
  title?: string;
  content_text?: string;
  content_html?: string;
  page_number?: number;
  selection_text?: string;
  conversation_id?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Task {
  id: string;
  workspace_id: string;
  document_id?: string;
  user_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  due_at?: string;
  priority?: number;
  source_insight_id?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
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
  is_missing_standard_protection?: boolean;
  created_at: string;
}

export interface LegalObligation {
  id: string;
  contract_id: string;
  obligation_type: string;
  due_at?: string;
  recurrence?: string;
  responsible_party?: string;
  created_at: string;
}

export interface LegalRiskFlag {
  id: string;
  contract_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  explanation?: string;
  resolved: boolean;
  created_at: string;
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

