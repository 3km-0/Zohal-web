export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string
          icon_name: string | null
          id: string
          is_active: boolean
          name: string
          requirement_json: Json | null
          xp_reward: number
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          description: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          name: string
          requirement_json?: Json | null
          xp_reward?: number
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          name?: string
          requirement_json?: Json | null
          xp_reward?: number
        }
        Relationships: []
      }
      actions: {
        Row: {
          action_type: string
          cost_cents: number | null
          created_at: string
          id: string
          input_json: Json | null
          input_text: string | null
          latency_ms: number | null
          model_used: string | null
          org_id: string | null
          output_json: Json | null
          output_text: string | null
          plugin_family: string | null
          related_entity_ids: string[] | null
          related_task_ids: string[] | null
          status: string
          target_document_ids: string[] | null
          target_selection_ids: string[] | null
          triggered_by_user_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          action_type: string
          cost_cents?: number | null
          created_at?: string
          id?: string
          input_json?: Json | null
          input_text?: string | null
          latency_ms?: number | null
          model_used?: string | null
          org_id?: string | null
          output_json?: Json | null
          output_text?: string | null
          plugin_family?: string | null
          related_entity_ids?: string[] | null
          related_task_ids?: string[] | null
          status?: string
          target_document_ids?: string[] | null
          target_selection_ids?: string[] | null
          triggered_by_user_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          action_type?: string
          cost_cents?: number | null
          created_at?: string
          id?: string
          input_json?: Json | null
          input_text?: string | null
          latency_ms?: number | null
          model_used?: string | null
          org_id?: string | null
          output_json?: Json | null
          output_text?: string | null
          plugin_family?: string | null
          related_entity_ids?: string[] | null
          related_task_ids?: string[] | null
          status?: string
          target_document_ids?: string[] | null
          target_selection_ids?: string[] | null
          triggered_by_user_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          created_at: string
          document_id: string | null
          ends_at: string | null
          external_calendar_id: string | null
          external_event_id: string | null
          id: string
          metadata: Json | null
          org_id: string | null
          source: string
          starts_at: string
          task_id: string | null
          title: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          document_id?: string | null
          ends_at?: string | null
          external_calendar_id?: string | null
          external_event_id?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
          source?: string
          starts_at: string
          task_id?: string | null
          title: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          all_day?: boolean
          created_at?: string
          document_id?: string | null
          ends_at?: string | null
          external_calendar_id?: string | null
          external_event_id?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
          source?: string
          starts_at?: string
          task_id?: string | null
          title?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "calendar_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_events: {
        Row: {
          apple_event_identifier: string | null
          created_at: string | null
          description: string | null
          document_id: string | null
          end_date: string | null
          google_event_id: string | null
          ics_exported_at: string | null
          id: string
          insight_id: string | null
          is_all_day: boolean | null
          start_date: string
          title: string
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          apple_event_identifier?: string | null
          created_at?: string | null
          description?: string | null
          document_id?: string | null
          end_date?: string | null
          google_event_id?: string | null
          ics_exported_at?: string | null
          id?: string
          insight_id?: string | null
          is_all_day?: boolean | null
          start_date: string
          title: string
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          apple_event_identifier?: string | null
          created_at?: string | null
          description?: string | null
          document_id?: string | null
          end_date?: string | null
          google_event_id?: string | null
          ics_exported_at?: string | null
          id?: string
          insight_id?: string | null
          is_all_day?: boolean | null
          start_date?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sync_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "calendar_sync_events_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sync_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_chunks: {
        Row: {
          canonical_id: string
          chunk_index: number
          content_hash: string
          content_text: string
          created_at: string
          id: string
          language: string | null
          page_number: number | null
        }
        Insert: {
          canonical_id: string
          chunk_index: number
          content_hash: string
          content_text: string
          created_at?: string
          id?: string
          language?: string | null
          page_number?: number | null
        }
        Update: {
          canonical_id?: string
          chunk_index?: number
          content_hash?: string
          content_text?: string
          created_at?: string
          id?: string
          language?: string | null
          page_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "canonical_chunks_canonical_id_fkey"
            columns: ["canonical_id"]
            isOneToOne: false
            referencedRelation: "canonical_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_documents: {
        Row: {
          author: string | null
          chunk_count: number | null
          content_hash: string
          created_at: string
          edition: string | null
          embedding_status: string | null
          id: string
          is_verified: boolean | null
          isbn: string | null
          language: string | null
          level: string | null
          page_count: number | null
          publisher: string | null
          subject: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          chunk_count?: number | null
          content_hash: string
          created_at?: string
          edition?: string | null
          embedding_status?: string | null
          id?: string
          is_verified?: boolean | null
          isbn?: string | null
          language?: string | null
          level?: string | null
          page_count?: number | null
          publisher?: string | null
          subject?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          chunk_count?: number | null
          content_hash?: string
          created_at?: string
          edition?: string | null
          embedding_status?: string | null
          id?: string
          is_verified?: boolean | null
          isbn?: string | null
          language?: string | null
          level?: string | null
          page_count?: number | null
          publisher?: string | null
          subject?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      canonical_embeddings: {
        Row: {
          canonical_id: string
          chunk_id: string
          created_at: string
          embedding_model: string
          embedding_version: string
          id: string
          index_name: string
          vector_key: string
        }
        Insert: {
          canonical_id: string
          chunk_id: string
          created_at?: string
          embedding_model: string
          embedding_version: string
          id?: string
          index_name: string
          vector_key: string
        }
        Update: {
          canonical_id?: string
          chunk_id?: string
          created_at?: string
          embedding_model?: string
          embedding_version?: string
          id?: string
          index_name?: string
          vector_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_embeddings_canonical_id_fkey"
            columns: ["canonical_id"]
            isOneToOne: false
            referencedRelation: "canonical_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_embeddings_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "canonical_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_models: {
        Row: {
          created_at: string
          description: string | null
          equations: Json
          exported_code_julia: string | null
          exported_code_python: string | null
          id: string
          is_public: boolean
          model_type: string
          name: string
          parameters: Json
          share_token: string | null
          source_document_id: string | null
          source_workspace_id: string | null
          ui_controls: Json | null
          updated_at: string
          user_id: string
          variables: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          equations: Json
          exported_code_julia?: string | null
          exported_code_python?: string | null
          id?: string
          is_public?: boolean
          model_type: string
          name: string
          parameters: Json
          share_token?: string | null
          source_document_id?: string | null
          source_workspace_id?: string | null
          ui_controls?: Json | null
          updated_at?: string
          user_id: string
          variables?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          equations?: Json
          exported_code_julia?: string | null
          exported_code_python?: string | null
          id?: string
          is_public?: boolean
          model_type?: string
          name?: string
          parameters?: Json
          share_token?: string | null
          source_document_id?: string | null
          source_workspace_id?: string | null
          ui_controls?: Json | null
          updated_at?: string
          user_id?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "canvas_models_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_models_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "canvas_models_source_workspace_id_fkey"
            columns: ["source_workspace_id"]
            isOneToOne: false
            referencedRelation: "problem_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_models_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chunk_embeddings: {
        Row: {
          chunk_id: string
          content_hash: string
          created_at: string
          dimension: number
          embedding_model: string
          embedding_version: string
          error: string | null
          id: string
          index_name: string
          status: string
          updated_at: string
          vector_key: string
        }
        Insert: {
          chunk_id: string
          content_hash: string
          created_at?: string
          dimension: number
          embedding_model: string
          embedding_version: string
          error?: string | null
          id?: string
          index_name: string
          status?: string
          updated_at?: string
          vector_key: string
        }
        Update: {
          chunk_id?: string
          content_hash?: string
          created_at?: string
          dimension?: number
          embedding_model?: string
          embedding_version?: string
          error?: string | null
          id?: string
          index_name?: string
          status?: string
          updated_at?: string
          vector_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "chunk_embeddings_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          code: string
          created_at: string
          description: string | null
          domain: string
          id: string
          name: string
          prerequisite_concepts: string[] | null
          typical_level: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          domain: string
          id?: string
          name: string
          prerequisite_concepts?: string[] | null
          typical_level?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          domain?: string
          id?: string
          name?: string
          prerequisite_concepts?: string[] | null
          typical_level?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          context_text: string | null
          created_at: string | null
          deleted_at: string | null
          document_id: string | null
          id: string
          is_active: boolean | null
          note_id: string | null
          selection_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          context_text?: string | null
          created_at?: string | null
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          is_active?: boolean | null
          note_id?: string | null
          selection_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          context_text?: string | null
          created_at?: string | null
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          is_active?: boolean | null
          note_id?: string | null
          selection_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "conversations_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      course_analytics: {
        Row: {
          active_students: number
          common_errors: Json | null
          computed_at: string
          concept_difficulty: Json | null
          course_id: string
          id: string
          period_end: string
          period_start: string
          struggling_sections: Json | null
          total_explanations: number
          total_hints: number
          total_solution_reveals: number
        }
        Insert: {
          active_students?: number
          common_errors?: Json | null
          computed_at?: string
          concept_difficulty?: Json | null
          course_id: string
          id?: string
          period_end: string
          period_start: string
          struggling_sections?: Json | null
          total_explanations?: number
          total_hints?: number
          total_solution_reveals?: number
        }
        Update: {
          active_students?: number
          common_errors?: Json | null
          computed_at?: string
          concept_difficulty?: Json | null
          course_id?: string
          id?: string
          period_end?: string
          period_start?: string
          struggling_sections?: Json | null
          total_explanations?: number
          total_hints?: number
          total_solution_reveals?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_analytics_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_documents: {
        Row: {
          added_at: string
          assignment_type: string | null
          course_id: string
          document_id: string
          due_date: string | null
          id: string
          solutions_locked: boolean
        }
        Insert: {
          added_at?: string
          assignment_type?: string | null
          course_id: string
          document_id: string
          due_date?: string | null
          id?: string
          solutions_locked?: boolean
        }
        Update: {
          added_at?: string
          assignment_type?: string | null
          course_id?: string
          document_id?: string
          due_date?: string | null
          id?: string
          solutions_locked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "course_documents_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
        ]
      }
      course_enrollments: {
        Row: {
          course_id: string
          enrolled_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          course_id: string
          enrolled_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          course_id?: string
          enrolled_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          allow_full_solutions: boolean
          code: string | null
          created_at: string
          description: string | null
          educator_id: string
          id: string
          institution: string | null
          is_active: boolean
          max_hints_per_problem: number | null
          name: string
          require_attempts_before_solution: number | null
          term: string | null
          updated_at: string
        }
        Insert: {
          allow_full_solutions?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          educator_id: string
          id?: string
          institution?: string | null
          is_active?: boolean
          max_hints_per_problem?: number | null
          name: string
          require_attempts_before_solution?: number | null
          term?: string | null
          updated_at?: string
        }
        Update: {
          allow_full_solutions?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          educator_id?: string
          id?: string
          institution?: string | null
          is_active?: boolean
          max_hints_per_problem?: number | null
          name?: string
          require_attempts_before_solution?: number | null
          term?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_educator_id_fkey"
            columns: ["educator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_usage: {
        Row: {
          contract_analyses_count: number | null
          created_at: string | null
          explanations_count: number | null
          handwriting_ocr_count: number | null
          id: string
          semantic_searches_count: number | null
          solution_checks_count: number | null
          updated_at: string | null
          usage_date: string
          user_id: string
          workspace_organization_count: number | null
        }
        Insert: {
          contract_analyses_count?: number | null
          created_at?: string | null
          explanations_count?: number | null
          handwriting_ocr_count?: number | null
          id?: string
          semantic_searches_count?: number | null
          solution_checks_count?: number | null
          updated_at?: string | null
          usage_date?: string
          user_id: string
          workspace_organization_count?: number | null
        }
        Update: {
          contract_analyses_count?: number | null
          created_at?: string | null
          explanations_count?: number | null
          handwriting_ocr_count?: number | null
          id?: string
          semantic_searches_count?: number | null
          solution_checks_count?: number | null
          updated_at?: string | null
          usage_date?: string
          user_id?: string
          workspace_organization_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          bounding_box: Json | null
          chunk_index: number | null
          chunk_type: string
          content_hash: string | null
          content_latex: string | null
          content_text: string
          created_at: string
          detected_concepts: string[] | null
          document_id: string
          embedding: string | null
          end_char: number | null
          id: string
          language: string | null
          page_id: string | null
          page_number: number
          start_char: number | null
          toc_id: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          bounding_box?: Json | null
          chunk_index?: number | null
          chunk_type: string
          content_hash?: string | null
          content_latex?: string | null
          content_text: string
          created_at?: string
          detected_concepts?: string[] | null
          document_id: string
          embedding?: string | null
          end_char?: number | null
          id?: string
          language?: string | null
          page_id?: string | null
          page_number: number
          start_char?: number | null
          toc_id?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          bounding_box?: Json | null
          chunk_index?: number | null
          chunk_type?: string
          content_hash?: string | null
          content_latex?: string | null
          content_text?: string
          created_at?: string
          detected_concepts?: string[] | null
          document_id?: string
          embedding?: string | null
          end_char?: number | null
          id?: string
          language?: string | null
          page_id?: string | null
          page_number?: number
          start_char?: number | null
          toc_id?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_chunks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "document_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_toc_id_fkey"
            columns: ["toc_id"]
            isOneToOne: false
            referencedRelation: "document_toc"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pages: {
        Row: {
          created_at: string
          document_id: string
          embedding: string | null
          extracted_latex: string | null
          extracted_text: string | null
          id: string
          ocr_completed: boolean | null
          ocr_confidence: number | null
          ocr_required: boolean | null
          page_number: number
        }
        Insert: {
          created_at?: string
          document_id: string
          embedding?: string | null
          extracted_latex?: string | null
          extracted_text?: string | null
          id?: string
          ocr_completed?: boolean | null
          ocr_confidence?: number | null
          ocr_required?: boolean | null
          page_number: number
        }
        Update: {
          created_at?: string
          document_id?: string
          embedding?: string | null
          extracted_latex?: string | null
          extracted_text?: string | null
          id?: string
          ocr_completed?: boolean | null
          ocr_confidence?: number | null
          ocr_required?: boolean | null
          page_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
        ]
      }
      document_tags: {
        Row: {
          added_by: string | null
          added_by_ai: boolean | null
          confidence: number | null
          created_at: string
          document_id: string
          id: string
          tag_id: string
        }
        Insert: {
          added_by?: string | null
          added_by_ai?: boolean | null
          confidence?: number | null
          created_at?: string
          document_id: string
          id?: string
          tag_id: string
        }
        Update: {
          added_by?: string | null
          added_by_ai?: boolean | null
          confidence?: number | null
          created_at?: string
          document_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_tags_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tags_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tags_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      document_toc: {
        Row: {
          created_at: string
          depth: number
          document_id: string
          end_page: number | null
          estimated_concepts: number | null
          full_path: string | null
          id: string
          order_index: number
          parent_id: string | null
          start_page: number | null
          title: string
        }
        Insert: {
          created_at?: string
          depth?: number
          document_id: string
          end_page?: number | null
          estimated_concepts?: number | null
          full_path?: string | null
          id?: string
          order_index: number
          parent_id?: string | null
          start_page?: number | null
          title: string
        }
        Update: {
          created_at?: string
          depth?: number
          document_id?: string
          end_page?: number | null
          estimated_concepts?: number | null
          full_path?: string | null
          id?: string
          order_index?: number
          parent_id?: string | null
          start_page?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_toc_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_toc_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_toc_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_toc"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          author: string | null
          canonical_id: string | null
          content_fingerprint: string | null
          created_at: string
          deleted_at: string | null
          detected_level: string | null
          detected_subject: string | null
          document_type: string
          edition: string | null
          embedding_completed: boolean
          file_size_bytes: number | null
          folder_id: string | null
          has_text_layer: boolean | null
          id: string
          is_active: boolean
          isbn: string | null
          last_opened_at: string | null
          ocr_status: string | null
          original_filename: string | null
          page_count: number | null
          privacy_mode: boolean
          processing_status: string
          publisher: string | null
          source_integration_id: string | null
          source_metadata: Json | null
          source_type: string | null
          storage_bucket: string
          storage_path: string
          text_extraction_completed: boolean
          title: string
          toc_extraction_completed: boolean
          total_study_time_seconds: number
          updated_at: string
          user_id: string
          uses_shared_embeddings: boolean | null
          workspace_id: string | null
        }
        Insert: {
          author?: string | null
          canonical_id?: string | null
          content_fingerprint?: string | null
          created_at?: string
          deleted_at?: string | null
          detected_level?: string | null
          detected_subject?: string | null
          document_type?: string
          edition?: string | null
          embedding_completed?: boolean
          file_size_bytes?: number | null
          folder_id?: string | null
          has_text_layer?: boolean | null
          id?: string
          is_active?: boolean
          isbn?: string | null
          last_opened_at?: string | null
          ocr_status?: string | null
          original_filename?: string | null
          page_count?: number | null
          privacy_mode?: boolean
          processing_status?: string
          publisher?: string | null
          source_integration_id?: string | null
          source_metadata?: Json | null
          source_type?: string | null
          storage_bucket?: string
          storage_path: string
          text_extraction_completed?: boolean
          title: string
          toc_extraction_completed?: boolean
          total_study_time_seconds?: number
          updated_at?: string
          user_id: string
          uses_shared_embeddings?: boolean | null
          workspace_id?: string | null
        }
        Update: {
          author?: string | null
          canonical_id?: string | null
          content_fingerprint?: string | null
          created_at?: string
          deleted_at?: string | null
          detected_level?: string | null
          detected_subject?: string | null
          document_type?: string
          edition?: string | null
          embedding_completed?: boolean
          file_size_bytes?: number | null
          folder_id?: string | null
          has_text_layer?: boolean | null
          id?: string
          is_active?: boolean
          isbn?: string | null
          last_opened_at?: string | null
          ocr_status?: string | null
          original_filename?: string | null
          page_count?: number | null
          privacy_mode?: boolean
          processing_status?: string
          publisher?: string | null
          source_integration_id?: string | null
          source_metadata?: Json | null
          source_type?: string | null
          storage_bucket?: string
          storage_path?: string
          text_extraction_completed?: boolean
          title?: string
          toc_extraction_completed?: boolean
          total_study_time_seconds?: number
          updated_at?: string
          user_id?: string
          uses_shared_embeddings?: boolean | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_canonical_id_fkey"
            columns: ["canonical_id"]
            isOneToOne: false
            referencedRelation: "canonical_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "workspace_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_source_integration_fk"
            columns: ["source_integration_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_configs: {
        Row: {
          active_index_name: string
          active_model: string
          active_version: string
          created_at: string
          id: string
          scope: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          active_index_name: string
          active_model: string
          active_version: string
          created_at?: string
          id?: string
          scope: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          active_index_name?: string
          active_model?: string
          active_version?: string
          created_at?: string
          id?: string
          scope?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "embedding_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_queue: {
        Row: {
          attempts: number | null
          canonical_match_id: string | null
          check_canonical: boolean | null
          completed_at: string | null
          created_at: string
          document_id: string
          error_message: string | null
          id: string
          priority: number | null
          processed_chunks: number | null
          started_at: string | null
          status: string
          total_chunks: number | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          attempts?: number | null
          canonical_match_id?: string | null
          check_canonical?: boolean | null
          completed_at?: string | null
          created_at?: string
          document_id: string
          error_message?: string | null
          id?: string
          priority?: number | null
          processed_chunks?: number | null
          started_at?: string | null
          status?: string
          total_chunks?: number | null
          user_id: string
          workspace_id: string
        }
        Update: {
          attempts?: number | null
          canonical_match_id?: string | null
          check_canonical?: boolean | null
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error_message?: string | null
          id?: string
          priority?: number | null
          processed_chunks?: number | null
          started_at?: string | null
          status?: string
          total_chunks?: number | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "embedding_queue_canonical_match_id_fkey"
            columns: ["canonical_match_id"]
            isOneToOne: false
            referencedRelation: "canonical_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "embedding_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          aliases: string[] | null
          created_at: string
          deleted_at: string | null
          entity_type: string
          id: string
          metadata: Json | null
          name: string
          normalized_name: string | null
          plugin_family: string | null
          workspace_id: string | null
        }
        Insert: {
          aliases?: string[] | null
          created_at?: string
          deleted_at?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          name: string
          normalized_name?: string | null
          plugin_family?: string | null
          workspace_id?: string | null
        }
        Update: {
          aliases?: string[] | null
          created_at?: string
          deleted_at?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          name?: string
          normalized_name?: string | null
          plugin_family?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_mentions: {
        Row: {
          chunk_id: string | null
          confidence: number | null
          created_at: string
          document_id: string
          entity_id: string
          id: string
          page_number: number | null
          selection_id: string | null
          source_action_id: string | null
          span_end: number | null
          span_start: number | null
        }
        Insert: {
          chunk_id?: string | null
          confidence?: number | null
          created_at?: string
          document_id: string
          entity_id: string
          id?: string
          page_number?: number | null
          selection_id?: string | null
          source_action_id?: string | null
          span_end?: number | null
          span_start?: number | null
        }
        Update: {
          chunk_id?: string | null
          confidence?: number | null
          created_at?: string
          document_id?: string
          entity_id?: string
          id?: string
          page_number?: number | null
          selection_id?: string | null
          source_action_id?: string | null
          span_end?: number | null
          span_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_mentions_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_mentions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_mentions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "entity_mentions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_mentions_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_mentions_source_action_fk"
            columns: ["source_action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_packs: {
        Row: {
          created_at: string
          description: string | null
          difficulty_distribution: Json | null
          domain: string
          estimated_hours: number | null
          exam_type: string
          id: string
          is_active: boolean
          is_premium: boolean
          name: string
          price_cents: number | null
          total_problems: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          difficulty_distribution?: Json | null
          domain: string
          estimated_hours?: number | null
          exam_type: string
          id?: string
          is_active?: boolean
          is_premium?: boolean
          name: string
          price_cents?: number | null
          total_problems?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          difficulty_distribution?: Json | null
          domain?: string
          estimated_hours?: number | null
          exam_type?: string
          id?: string
          is_active?: boolean
          is_premium?: boolean
          name?: string
          price_cents?: number | null
          total_problems?: number
        }
        Relationships: []
      }
      exam_problems: {
        Row: {
          created_at: string
          difficulty: string | null
          estimated_minutes: number | null
          id: string
          pack_id: string
          problem_image_path: string | null
          problem_latex: string | null
          problem_text: string
          sequence_number: number
          solution_latex: string | null
          solution_steps: Json | null
          solution_text: string | null
          topics: string[] | null
        }
        Insert: {
          created_at?: string
          difficulty?: string | null
          estimated_minutes?: number | null
          id?: string
          pack_id: string
          problem_image_path?: string | null
          problem_latex?: string | null
          problem_text: string
          sequence_number: number
          solution_latex?: string | null
          solution_steps?: Json | null
          solution_text?: string | null
          topics?: string[] | null
        }
        Update: {
          created_at?: string
          difficulty?: string | null
          estimated_minutes?: number | null
          id?: string
          pack_id?: string
          problem_image_path?: string | null
          problem_latex?: string | null
          problem_text?: string
          sequence_number?: number
          solution_latex?: string | null
          solution_steps?: Json | null
          solution_text?: string | null
          topics?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_problems_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "exam_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      explanation_followups: {
        Row: {
          assistant_response: string
          created_at: string
          explanation_id: string
          id: string
          latency_ms: number | null
          model_used: string | null
          sequence_number: number
          user_id: string
          user_message: string
        }
        Insert: {
          assistant_response: string
          created_at?: string
          explanation_id: string
          id?: string
          latency_ms?: number | null
          model_used?: string | null
          sequence_number: number
          user_id: string
          user_message: string
        }
        Update: {
          assistant_response?: string
          created_at?: string
          explanation_id?: string
          id?: string
          latency_ms?: number | null
          model_used?: string | null
          sequence_number?: number
          user_id?: string
          user_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "explanation_followups_explanation_id_fkey"
            columns: ["explanation_id"]
            isOneToOne: false
            referencedRelation: "explanations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explanation_followups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explanations: {
        Row: {
          action_type: string | null
          book_anchor_page: number | null
          book_anchor_section: string | null
          completion_tokens: number | null
          context_chunks: string[] | null
          conversation_id: string | null
          created_at: string
          document_id: string | null
          estimated_cost_cents: number | null
          follow_up_requested: boolean | null
          id: string
          input_latex: string | null
          input_text: string
          latency_ms: number | null
          model_used: string | null
          plugin_family: string | null
          prompt_tokens: number | null
          related_chunk_ids: string[] | null
          request_type: string
          response_html: string | null
          response_latex: string | null
          response_text: string
          role: string | null
          selection_id: string | null
          user_feedback: string | null
          user_id: string
          user_level: string | null
          user_rating: number | null
          was_helpful: boolean | null
        }
        Insert: {
          action_type?: string | null
          book_anchor_page?: number | null
          book_anchor_section?: string | null
          completion_tokens?: number | null
          context_chunks?: string[] | null
          conversation_id?: string | null
          created_at?: string
          document_id?: string | null
          estimated_cost_cents?: number | null
          follow_up_requested?: boolean | null
          id?: string
          input_latex?: string | null
          input_text: string
          latency_ms?: number | null
          model_used?: string | null
          plugin_family?: string | null
          prompt_tokens?: number | null
          related_chunk_ids?: string[] | null
          request_type: string
          response_html?: string | null
          response_latex?: string | null
          response_text: string
          role?: string | null
          selection_id?: string | null
          user_feedback?: string | null
          user_id: string
          user_level?: string | null
          user_rating?: number | null
          was_helpful?: boolean | null
        }
        Update: {
          action_type?: string | null
          book_anchor_page?: number | null
          book_anchor_section?: string | null
          completion_tokens?: number | null
          context_chunks?: string[] | null
          conversation_id?: string | null
          created_at?: string
          document_id?: string | null
          estimated_cost_cents?: number | null
          follow_up_requested?: boolean | null
          id?: string
          input_latex?: string | null
          input_text?: string
          latency_ms?: number | null
          model_used?: string | null
          plugin_family?: string | null
          prompt_tokens?: number | null
          related_chunk_ids?: string[] | null
          request_type?: string
          response_html?: string | null
          response_latex?: string | null
          response_text?: string
          role?: string | null
          selection_id?: string | null
          user_feedback?: string | null
          user_id?: string
          user_level?: string | null
          user_rating?: number | null
          was_helpful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "explanations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explanations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explanations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "explanations_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explanations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          document_id: string
          error: string | null
          extraction_type: string
          id: string
          input_config: Json | null
          model: string
          output_summary: Json | null
          prompt_version: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          document_id: string
          error?: string | null
          extraction_type: string
          id?: string
          input_config?: Json | null
          model: string
          output_summary?: Json | null
          prompt_version: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error?: string | null
          extraction_type?: string
          id?: string
          input_config?: Json | null
          model?: string
          output_summary?: Json | null
          prompt_version?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "extraction_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_invoice_line_items: {
        Row: {
          category: string | null
          created_at: string
          currency: string | null
          description: string | null
          document_id: string | null
          id: string
          invoice_number: string | null
          line_index: number | null
          quantity: number | null
          total: number | null
          unit_price: number | null
          workspace_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          document_id?: string | null
          id?: string
          invoice_number?: string | null
          line_index?: number | null
          quantity?: number | null
          total?: number | null
          unit_price?: number | null
          workspace_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          document_id?: string | null
          id?: string
          invoice_number?: string | null
          line_index?: number | null
          quantity?: number | null
          total?: number | null
          unit_price?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_invoice_line_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_invoice_line_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "finance_invoice_line_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_kpi_snapshots: {
        Row: {
          created_at: string
          id: string
          metrics: Json | null
          period_end: string | null
          period_start: string | null
          source_document_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metrics?: Json | null
          period_end?: string | null
          period_start?: string | null
          source_document_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metrics?: Json | null
          period_end?: string | null
          period_start?: string | null
          source_document_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_kpi_snapshots_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_kpi_snapshots_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "finance_kpi_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          back_latex: string | null
          back_text: string
          concept_id: string | null
          created_at: string
          document_id: string | null
          ease_factor: number
          explanation_id: string | null
          front_latex: string | null
          front_text: string
          id: string
          interval_days: number
          next_review_at: string
          repetitions: number
          times_correct: number
          times_incorrect: number
          updated_at: string
          user_id: string
        }
        Insert: {
          back_latex?: string | null
          back_text: string
          concept_id?: string | null
          created_at?: string
          document_id?: string | null
          ease_factor?: number
          explanation_id?: string | null
          front_latex?: string | null
          front_text: string
          id?: string
          interval_days?: number
          next_review_at?: string
          repetitions?: number
          times_correct?: number
          times_incorrect?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          back_latex?: string | null
          back_text?: string
          concept_id?: string | null
          created_at?: string
          document_id?: string | null
          ease_factor?: number
          explanation_id?: string | null
          front_latex?: string | null
          front_text?: string
          id?: string
          interval_days?: number
          next_review_at?: string
          repetitions?: number
          times_correct?: number
          times_incorrect?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "flashcards_explanation_id_fkey"
            columns: ["explanation_id"]
            isOneToOne: false
            referencedRelation: "explanations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hourly_usage: {
        Row: {
          created_at: string
          document_ingestions_count: number
          hour_start: string
          ocr_pages_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_ingestions_count?: number
          hour_start: string
          ocr_pages_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_ingestions_count?: number
          hour_start?: string
          ocr_pages_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hourly_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_events: {
        Row: {
          created_at: string
          document_id: string | null
          error_message: string | null
          id: string
          integration_account_id: string | null
          raw_metadata: Json | null
          source_type: string
          status: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          error_message?: string | null
          id?: string
          integration_account_id?: string | null
          raw_metadata?: Json | null
          source_type: string
          status?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          error_message?: string | null
          id?: string
          integration_account_id?: string | null
          raw_metadata?: Json | null
          source_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "ingestion_events_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ink_recognitions: {
        Row: {
          confidence: number | null
          corrected_latex: string | null
          corrected_text: string | null
          correction_time_ms: number | null
          created_at: string
          flagged_for_review: boolean
          id: string
          image_storage_path: string | null
          recognized_latex: string | null
          recognized_text: string | null
          segment_type: string | null
          segments: Json | null
          selection_id: string | null
          stroke_data: Json
          user_corrected: boolean
          user_id: string
        }
        Insert: {
          confidence?: number | null
          corrected_latex?: string | null
          corrected_text?: string | null
          correction_time_ms?: number | null
          created_at?: string
          flagged_for_review?: boolean
          id?: string
          image_storage_path?: string | null
          recognized_latex?: string | null
          recognized_text?: string | null
          segment_type?: string | null
          segments?: Json | null
          selection_id?: string | null
          stroke_data: Json
          user_corrected?: boolean
          user_id: string
        }
        Update: {
          confidence?: number | null
          corrected_latex?: string | null
          corrected_text?: string | null
          correction_time_ms?: number | null
          created_at?: string
          flagged_for_review?: boolean
          id?: string
          image_storage_path?: string | null
          recognized_latex?: string | null
          recognized_text?: string | null
          segment_type?: string | null
          segments?: Json | null
          selection_id?: string | null
          stroke_data?: Json
          user_corrected?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ink_recognitions_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ink_recognitions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          chunk_id: string | null
          confidence: number | null
          created_at: string
          currency: string | null
          deleted_at: string | null
          document_id: string | null
          due_at: string | null
          id: string
          is_verified: boolean | null
          kind: string
          number_value: number | null
          payload: Json
          run_id: string | null
          source_refs: Json | null
          text_value: string | null
          updated_at: string
          user_id: string
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
          workspace_id: string
        }
        Insert: {
          chunk_id?: string | null
          confidence?: number | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          document_id?: string | null
          due_at?: string | null
          id?: string
          is_verified?: boolean | null
          kind: string
          number_value?: number | null
          payload?: Json
          run_id?: string | null
          source_refs?: Json | null
          text_value?: string | null
          updated_at?: string
          user_id: string
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
          workspace_id: string
        }
        Update: {
          chunk_id?: string | null
          confidence?: number | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          document_id?: string | null
          due_at?: string | null
          id?: string
          is_verified?: boolean | null
          kind?: string
          number_value?: number | null
          payload?: Json
          run_id?: string | null
          source_refs?: Json | null
          text_value?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "insights_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "extraction_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_accounts: {
        Row: {
          access_token: string | null
          access_token_ref: string | null
          connected_at: string
          created_at: string
          display_name: string | null
          external_id: string | null
          id: string
          metadata: Json | null
          org_id: string | null
          provider: string
          provider_id: string | null
          refresh_token: string | null
          scopes: string[] | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          access_token_ref?: string | null
          connected_at?: string
          created_at?: string
          display_name?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
          provider?: string
          provider_id?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          access_token_ref?: string | null
          connected_at?: string
          created_at?: string
          display_name?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
          provider?: string
          provider_id?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_accounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_messages: {
        Row: {
          id: string
          integration_account_id: string
          message_type: string
          payload: Json
          resource_id: string | null
          sent_at: string
        }
        Insert: {
          id?: string
          integration_account_id: string
          message_type: string
          payload: Json
          resource_id?: string | null
          sent_at?: string
        }
        Update: {
          id?: string
          integration_account_id?: string
          message_type?: string
          payload?: Json
          resource_id?: string | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_messages_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_messages_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "integration_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_providers: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      integration_resources: {
        Row: {
          created_at: string
          external_id: string
          id: string
          integration_account_id: string
          metadata: Json | null
          name: string | null
          resource_type: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          integration_account_id: string
          metadata?: Json | null
          name?: string | null
          resource_type: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          integration_account_id?: string
          metadata?: Json | null
          name?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_resources_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_clauses: {
        Row: {
          char_end: number | null
          char_start: number | null
          chunk_ids: string[] | null
          clause_number: string | null
          clause_title: string | null
          clause_type: string | null
          contract_id: string
          created_at: string
          end_page: number | null
          id: string
          is_missing_standard_protection: boolean | null
          page_number: number | null
          risk_level: string | null
          start_page: number | null
          text: string | null
        }
        Insert: {
          char_end?: number | null
          char_start?: number | null
          chunk_ids?: string[] | null
          clause_number?: string | null
          clause_title?: string | null
          clause_type?: string | null
          contract_id: string
          created_at?: string
          end_page?: number | null
          id?: string
          is_missing_standard_protection?: boolean | null
          page_number?: number | null
          risk_level?: string | null
          start_page?: number | null
          text?: string | null
        }
        Update: {
          char_end?: number | null
          char_start?: number | null
          chunk_ids?: string[] | null
          clause_number?: string | null
          clause_title?: string | null
          clause_type?: string | null
          contract_id?: string
          created_at?: string
          end_page?: number | null
          id?: string
          is_missing_standard_protection?: boolean | null
          page_number?: number | null
          risk_level?: string | null
          start_page?: number | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_clauses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "legal_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_contracts: {
        Row: {
          auto_renewal: boolean | null
          contract_type: string | null
          counterparty_entity_id: string | null
          counterparty_name: string | null
          created_at: string
          document_id: string
          effective_date: string | null
          end_date: string | null
          governing_law: string | null
          id: string
          metadata: Json | null
          notice_period_days: number | null
          our_entity_id: string | null
          renewal_terms: string | null
          status: string
          term_length_months: number | null
          termination_for_convenience: boolean | null
          updated_at: string
          verification_object_id: string | null
          version_id: string | null
          workspace_id: string | null
        }
        Insert: {
          auto_renewal?: boolean | null
          contract_type?: string | null
          counterparty_entity_id?: string | null
          counterparty_name?: string | null
          created_at?: string
          document_id: string
          effective_date?: string | null
          end_date?: string | null
          governing_law?: string | null
          id?: string
          metadata?: Json | null
          notice_period_days?: number | null
          our_entity_id?: string | null
          renewal_terms?: string | null
          status?: string
          term_length_months?: number | null
          termination_for_convenience?: boolean | null
          updated_at?: string
          verification_object_id?: string | null
          version_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          auto_renewal?: boolean | null
          contract_type?: string | null
          counterparty_entity_id?: string | null
          counterparty_name?: string | null
          created_at?: string
          document_id?: string
          effective_date?: string | null
          end_date?: string | null
          governing_law?: string | null
          id?: string
          metadata?: Json | null
          notice_period_days?: number | null
          our_entity_id?: string | null
          renewal_terms?: string | null
          status?: string
          term_length_months?: number | null
          termination_for_convenience?: boolean | null
          updated_at?: string
          verification_object_id?: string | null
          version_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_contracts_counterparty_entity_id_fkey"
            columns: ["counterparty_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_contracts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_contracts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "legal_contracts_our_entity_id_fkey"
            columns: ["our_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_contracts_verification_object_id_fkey"
            columns: ["verification_object_id"]
            isOneToOne: false
            referencedRelation: "verification_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_contracts_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "verification_object_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_contracts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_obligations: {
        Row: {
          action: string | null
          condition: string | null
          confidence: string | null
          confidence_state: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          contract_id: string
          counterparty_entity_id: string | null
          created_at: string
          due_at: string | null
          id: string
          metadata: Json | null
          obligation_type: string | null
          page_number: number | null
          recurrence: string | null
          responsible_party: string | null
          responsible_party_entity_id: string | null
          source_clause_id: string | null
          summary: string | null
          task_id: string | null
          user_notes: string | null
        }
        Insert: {
          action?: string | null
          condition?: string | null
          confidence?: string | null
          confidence_state?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          contract_id: string
          counterparty_entity_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          metadata?: Json | null
          obligation_type?: string | null
          page_number?: number | null
          recurrence?: string | null
          responsible_party?: string | null
          responsible_party_entity_id?: string | null
          source_clause_id?: string | null
          summary?: string | null
          task_id?: string | null
          user_notes?: string | null
        }
        Update: {
          action?: string | null
          condition?: string | null
          confidence?: string | null
          confidence_state?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          contract_id?: string
          counterparty_entity_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          metadata?: Json | null
          obligation_type?: string | null
          page_number?: number | null
          recurrence?: string | null
          responsible_party?: string | null
          responsible_party_entity_id?: string | null
          source_clause_id?: string | null
          summary?: string | null
          task_id?: string | null
          user_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_obligations_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_obligations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "legal_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_obligations_counterparty_entity_id_fkey"
            columns: ["counterparty_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_obligations_responsible_party_entity_id_fkey"
            columns: ["responsible_party_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_obligations_source_clause_id_fkey"
            columns: ["source_clause_id"]
            isOneToOne: false
            referencedRelation: "legal_clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_obligations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_risk_flags: {
        Row: {
          clause_id: string | null
          contract_id: string
          created_at: string
          description: string
          explanation: string | null
          id: string
          page_number: number | null
          resolved: boolean
          resolved_at: string | null
          severity: string
        }
        Insert: {
          clause_id?: string | null
          contract_id: string
          created_at?: string
          description: string
          explanation?: string | null
          id?: string
          page_number?: number | null
          resolved?: boolean
          resolved_at?: string | null
          severity: string
        }
        Update: {
          clause_id?: string | null
          contract_id?: string
          created_at?: string
          description?: string
          explanation?: string | null
          id?: string
          page_number?: number | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_risk_flags_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "legal_clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_risk_flags_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "legal_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      mathpix_pdf_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          document_id: string
          error_message: string | null
          id: string
          lines_json_storage_path: string | null
          mathpix_pdf_id: string
          mmd_storage_path: string | null
          page_count: number | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          document_id: string
          error_message?: string | null
          id?: string
          lines_json_storage_path?: string | null
          mathpix_pdf_id: string
          mmd_storage_path?: string | null
          page_count?: number | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error_message?: string | null
          id?: string
          lines_json_storage_path?: string | null
          mathpix_pdf_id?: string
          mmd_storage_path?: string | null
          page_count?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mathpix_pdf_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mathpix_pdf_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
        ]
      }
      meeting_actions: {
        Row: {
          action_type: string | null
          created_at: string
          id: string
          meeting_id: string
          summary: string
          task_id: string | null
        }
        Insert: {
          action_type?: string | null
          created_at?: string
          id?: string
          meeting_id: string
          summary: string
          task_id?: string | null
        }
        Update: {
          action_type?: string | null
          created_at?: string
          id?: string
          meeting_id?: string
          summary?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_actions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_actions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          participants: Json | null
          source_document_id: string | null
          starts_at: string | null
          title: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          participants?: Json | null
          source_document_id?: string | null
          starts_at?: string | null
          title: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          participants?: Json | null
          source_document_id?: string | null
          starts_at?: string | null
          title?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "meetings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      note_assets: {
        Row: {
          asset_type: string
          cell_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          note_id: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          asset_type: string
          cell_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          note_id: string
          storage_bucket: string
          storage_path: string
        }
        Update: {
          asset_type?: string
          cell_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          note_id?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_assets_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "note_cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_assets_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_attempts: {
        Row: {
          attempt_type: string | null
          confidence: number | null
          feedback_text: string | null
          feedback_type: string | null
          id: string
          note_id: string | null
          recognized_latex: string | null
          recognized_text: string | null
          step_number: number | null
          submitted_at: string
          user_id: string
          verification_details: Json | null
          verification_status: string | null
          verified_at: string | null
        }
        Insert: {
          attempt_type?: string | null
          confidence?: number | null
          feedback_text?: string | null
          feedback_type?: string | null
          id?: string
          note_id?: string | null
          recognized_latex?: string | null
          recognized_text?: string | null
          step_number?: number | null
          submitted_at?: string
          user_id: string
          verification_details?: Json | null
          verification_status?: string | null
          verified_at?: string | null
        }
        Update: {
          attempt_type?: string | null
          confidence?: number | null
          feedback_text?: string | null
          feedback_type?: string | null
          id?: string
          note_id?: string | null
          recognized_latex?: string | null
          recognized_text?: string | null
          step_number?: number | null
          submitted_at?: string
          user_id?: string
          verification_details?: Json | null
          verification_status?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_attempts_workspace_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "problem_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      note_cells: {
        Row: {
          blocks: Json
          cell_type: string
          created_at: string
          id: string
          is_pinned: boolean | null
          message_role: string | null
          note_id: string
          position: number
          updated_at: string
        }
        Insert: {
          blocks?: Json
          cell_type?: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          message_role?: string | null
          note_id: string
          position: number
          updated_at?: string
        }
        Update: {
          blocks?: Json
          cell_type?: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          message_role?: string | null
          note_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_cells_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          anchor_position: Json | null
          color: string | null
          completed_at: string | null
          correct_steps: number | null
          created_at: string
          deleted_at: string | null
          document_id: string | null
          expected_answer_latex: string | null
          expected_answer_text: string | null
          hints_used: number | null
          id: string
          ink_data: Json | null
          ink_data_url: string | null
          is_pinned: boolean
          note_latex: string | null
          note_text: string | null
          note_type: string | null
          page_number: number | null
          problem_latex: string | null
          problem_text: string | null
          problem_type: string | null
          recognized_latex: string | null
          selection_id: string | null
          solution_revealed: boolean | null
          source_explanation_id: string | null
          started_at: string | null
          tags: string[] | null
          total_steps: number | null
          updated_at: string
          user_id: string
          verification_status: string | null
          workspace_id: string | null
        }
        Insert: {
          anchor_position?: Json | null
          color?: string | null
          completed_at?: string | null
          correct_steps?: number | null
          created_at?: string
          deleted_at?: string | null
          document_id?: string | null
          expected_answer_latex?: string | null
          expected_answer_text?: string | null
          hints_used?: number | null
          id?: string
          ink_data?: Json | null
          ink_data_url?: string | null
          is_pinned?: boolean
          note_latex?: string | null
          note_text?: string | null
          note_type?: string | null
          page_number?: number | null
          problem_latex?: string | null
          problem_text?: string | null
          problem_type?: string | null
          recognized_latex?: string | null
          selection_id?: string | null
          solution_revealed?: boolean | null
          source_explanation_id?: string | null
          started_at?: string | null
          tags?: string[] | null
          total_steps?: number | null
          updated_at?: string
          user_id: string
          verification_status?: string | null
          workspace_id?: string | null
        }
        Update: {
          anchor_position?: Json | null
          color?: string | null
          completed_at?: string | null
          correct_steps?: number | null
          created_at?: string
          deleted_at?: string | null
          document_id?: string | null
          expected_answer_latex?: string | null
          expected_answer_text?: string | null
          hints_used?: number | null
          id?: string
          ink_data?: Json | null
          ink_data_url?: string | null
          is_pinned?: boolean
          note_latex?: string | null
          note_text?: string | null
          note_type?: string | null
          page_number?: number | null
          problem_latex?: string | null
          problem_text?: string | null
          problem_type?: string | null
          recognized_latex?: string | null
          selection_id?: string | null
          solution_revealed?: boolean | null
          source_explanation_id?: string | null
          started_at?: string | null
          tags?: string[] | null
          total_steps?: number | null
          updated_at?: string
          user_id?: string
          verification_status?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "notes_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_source_explanation_id_fkey"
            columns: ["source_explanation_id"]
            isOneToOne: false
            referencedRelation: "explanations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          invited_at: string | null
          joined_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string | null
          joined_at?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string | null
          joined_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_id: string
          plan_tier: string
          slug: string | null
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          owner_id: string
          plan_tier?: string
          slug?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
          plan_tier?: string
          slug?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          card_brand: string | null
          card_expiry_month: number | null
          card_expiry_year: number | null
          card_holder_name: string | null
          card_last_four: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          moyasar_token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          card_brand?: string | null
          card_expiry_month?: number | null
          card_expiry_year?: number | null
          card_holder_name?: string | null
          card_last_four?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          moyasar_token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          card_brand?: string | null
          card_expiry_month?: number | null
          card_expiry_year?: number | null
          card_holder_name?: string | null
          card_last_four?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          moyasar_token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_lines: {
        Row: {
          confidence: number | null
          content_latex: string | null
          content_text: string | null
          created_at: string
          document_id: string
          id: string
          line_index: number
          line_type: string | null
          page_number: number
          x_max: number
          x_min: number
          y_max: number
          y_min: number
        }
        Insert: {
          confidence?: number | null
          content_latex?: string | null
          content_text?: string | null
          created_at?: string
          document_id: string
          id?: string
          line_index: number
          line_type?: string | null
          page_number: number
          x_max: number
          x_min: number
          y_max: number
          y_min: number
        }
        Update: {
          confidence?: number | null
          content_latex?: string | null
          content_text?: string | null
          created_at?: string
          document_id?: string
          id?: string
          line_index?: number
          line_type?: string | null
          page_number?: number
          x_max?: number
          x_min?: number
          y_max?: number
          y_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdf_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
        ]
      }
      plugin_families: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      plugin_subscriptions: {
        Row: {
          billing_metadata: Json | null
          created_at: string
          expires_at: string | null
          id: string
          org_id: string | null
          plan: string
          plugin_family_id: string
          started_at: string
          user_id: string | null
        }
        Insert: {
          billing_metadata?: Json | null
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id?: string | null
          plan?: string
          plugin_family_id: string
          started_at?: string
          user_id?: string | null
        }
        Update: {
          billing_metadata?: Json | null
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id?: string | null
          plan?: string
          plugin_family_id?: string
          started_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plugin_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plugin_subscriptions_plugin_family_id_fkey"
            columns: ["plugin_family_id"]
            isOneToOne: false
            referencedRelation: "plugin_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plugin_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      problem_workspaces: {
        Row: {
          completed_at: string | null
          correct_steps: number
          created_at: string
          document_id: string | null
          expected_answer_latex: string | null
          expected_answer_text: string | null
          hints_used: number
          id: string
          problem_latex: string | null
          problem_text: string
          problem_type: string | null
          selection_id: string | null
          solution_revealed: boolean
          started_at: string
          status: string
          total_steps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          correct_steps?: number
          created_at?: string
          document_id?: string | null
          expected_answer_latex?: string | null
          expected_answer_text?: string | null
          hints_used?: number
          id?: string
          problem_latex?: string | null
          problem_text: string
          problem_type?: string | null
          selection_id?: string | null
          solution_revealed?: boolean
          started_at?: string
          status?: string
          total_steps?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          correct_steps?: number
          created_at?: string
          document_id?: string | null
          expected_answer_latex?: string | null
          expected_answer_text?: string | null
          hints_used?: number
          id?: string
          problem_latex?: string | null
          problem_text?: string
          problem_type?: string | null
          selection_id?: string | null
          solution_revealed?: boolean
          started_at?: string
          status?: string
          total_steps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_workspaces_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_workspaces_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "problem_workspaces_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_workspaces_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_streak_days: number
          daily_ask_count: number
          daily_explanation_count: number
          daily_explanation_reset_at: string
          daily_rag_reset_at: string
          daily_search_count: number
          default_org_id: string | null
          display_name: string | null
          education_level: string | null
          email: string | null
          grace_period_ends_at: string | null
          graduation_year: number | null
          id: string
          institution: string | null
          last_active_at: string | null
          last_study_date: string | null
          latest_transaction_id: string | null
          longest_streak_days: number
          major: string | null
          moyasar_customer_id: string | null
          onboarding_completed_at: string | null
          onboarding_persona: string | null
          payment_source: string | null
          preferred_explanation_depth: string | null
          preferred_hint_style: string | null
          show_latex_source: boolean | null
          storage_used_bytes: number | null
          stripe_customer_id: string | null
          subscription_auto_renew: boolean | null
          subscription_cancelled_at: string | null
          subscription_expires_at: string | null
          subscription_period: string | null
          subscription_status: string
          subscription_tier: string
          timezone: string | null
          total_explanations_lifetime: number
          total_xp: number
          updated_at: string
          user_type: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_streak_days?: number
          daily_ask_count?: number
          daily_explanation_count?: number
          daily_explanation_reset_at?: string
          daily_rag_reset_at?: string
          daily_search_count?: number
          default_org_id?: string | null
          display_name?: string | null
          education_level?: string | null
          email?: string | null
          grace_period_ends_at?: string | null
          graduation_year?: number | null
          id: string
          institution?: string | null
          last_active_at?: string | null
          last_study_date?: string | null
          latest_transaction_id?: string | null
          longest_streak_days?: number
          major?: string | null
          moyasar_customer_id?: string | null
          onboarding_completed_at?: string | null
          onboarding_persona?: string | null
          payment_source?: string | null
          preferred_explanation_depth?: string | null
          preferred_hint_style?: string | null
          show_latex_source?: boolean | null
          storage_used_bytes?: number | null
          stripe_customer_id?: string | null
          subscription_auto_renew?: boolean | null
          subscription_cancelled_at?: string | null
          subscription_expires_at?: string | null
          subscription_period?: string | null
          subscription_status?: string
          subscription_tier?: string
          timezone?: string | null
          total_explanations_lifetime?: number
          total_xp?: number
          updated_at?: string
          user_type?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_streak_days?: number
          daily_ask_count?: number
          daily_explanation_count?: number
          daily_explanation_reset_at?: string
          daily_rag_reset_at?: string
          daily_search_count?: number
          default_org_id?: string | null
          display_name?: string | null
          education_level?: string | null
          email?: string | null
          grace_period_ends_at?: string | null
          graduation_year?: number | null
          id?: string
          institution?: string | null
          last_active_at?: string | null
          last_study_date?: string | null
          latest_transaction_id?: string | null
          longest_streak_days?: number
          major?: string | null
          moyasar_customer_id?: string | null
          onboarding_completed_at?: string | null
          onboarding_persona?: string | null
          payment_source?: string | null
          preferred_explanation_depth?: string | null
          preferred_hint_style?: string | null
          show_latex_source?: boolean | null
          storage_used_bytes?: number | null
          stripe_customer_id?: string | null
          subscription_auto_renew?: boolean | null
          subscription_cancelled_at?: string | null
          subscription_expires_at?: string | null
          subscription_period?: string | null
          subscription_status?: string
          subscription_tier?: string
          timezone?: string | null
          total_explanations_lifetime?: number
          total_xp?: number
          updated_at?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_org_id_fkey"
            columns: ["default_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referral_code: string
          referred_id: string
          referred_reward_applied: boolean
          referred_reward_type: string | null
          referrer_id: string
          referrer_reward_applied: boolean
          referrer_reward_type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          referral_code: string
          referred_id: string
          referred_reward_applied?: boolean
          referred_reward_type?: string | null
          referrer_id: string
          referrer_reward_applied?: boolean
          referrer_reward_type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          referral_code?: string
          referred_id?: string
          referred_reward_applied?: boolean
          referred_reward_type?: string | null
          referrer_id?: string
          referrer_reward_applied?: boolean
          referrer_reward_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      selections: {
        Row: {
          bounding_box: Json
          context_after: string | null
          context_before: string | null
          created_at: string
          deleted_at: string | null
          document_id: string
          explanation_id: string | null
          id: string
          page_id: string | null
          page_number: number
          parsed_intent: string | null
          selected_latex: string | null
          selected_text: string | null
          selection_type: string
          stroke_data: Json | null
          user_annotation: string | null
          user_id: string
        }
        Insert: {
          bounding_box: Json
          context_after?: string | null
          context_before?: string | null
          created_at?: string
          deleted_at?: string | null
          document_id: string
          explanation_id?: string | null
          id?: string
          page_id?: string | null
          page_number: number
          parsed_intent?: string | null
          selected_latex?: string | null
          selected_text?: string | null
          selection_type: string
          stroke_data?: Json | null
          user_annotation?: string | null
          user_id: string
        }
        Update: {
          bounding_box?: Json
          context_after?: string | null
          context_before?: string | null
          created_at?: string
          deleted_at?: string | null
          document_id?: string
          explanation_id?: string | null
          id?: string
          page_id?: string | null
          page_number?: number
          parsed_intent?: string | null
          selected_latex?: string | null
          selected_text?: string | null
          selection_type?: string
          stroke_data?: Json | null
          user_annotation?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "selections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "selections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "document_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      simulations: {
        Row: {
          compute_time_ms: number | null
          created_at: string
          document_id: string | null
          domain: string
          equations_latex: string[] | null
          id: string
          initial_conditions: Json | null
          parameters: Json
          plot_config: Json | null
          plot_image_path: string | null
          result_storage_path: string | null
          results: Json | null
          sim_type: string
          solver_used: string | null
          time_span: Json | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          compute_time_ms?: number | null
          created_at?: string
          document_id?: string | null
          domain: string
          equations_latex?: string[] | null
          id?: string
          initial_conditions?: Json | null
          parameters: Json
          plot_config?: Json | null
          plot_image_path?: string | null
          result_storage_path?: string | null
          results?: Json | null
          sim_type: string
          solver_used?: string | null
          time_span?: Json | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          compute_time_ms?: number | null
          created_at?: string
          document_id?: string | null
          domain?: string
          equations_latex?: string[] | null
          id?: string
          initial_conditions?: Json | null
          parameters?: Json
          plot_config?: Json | null
          plot_image_path?: string | null
          result_storage_path?: string | null
          results?: Json | null
          sim_type?: string
          solver_used?: string | null
          time_span?: Json | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "simulations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "problem_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      solution_steps: {
        Row: {
          detected_errors: string[] | null
          detected_operations: string[] | null
          feedback_text: string | null
          feedback_type: string | null
          id: string
          ink_recognition_id: string | null
          step_latex: string | null
          step_number: number
          step_text: string | null
          submitted_at: string
          user_id: string
          verification_details: Json | null
          verification_method: string | null
          verification_status: string
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          detected_errors?: string[] | null
          detected_operations?: string[] | null
          feedback_text?: string | null
          feedback_type?: string | null
          id?: string
          ink_recognition_id?: string | null
          step_latex?: string | null
          step_number: number
          step_text?: string | null
          submitted_at?: string
          user_id: string
          verification_details?: Json | null
          verification_method?: string | null
          verification_status?: string
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          detected_errors?: string[] | null
          detected_operations?: string[] | null
          feedback_text?: string | null
          feedback_type?: string | null
          id?: string
          ink_recognition_id?: string | null
          step_latex?: string | null
          step_number?: number
          step_text?: string | null
          submitted_at?: string
          user_id?: string
          verification_details?: Json | null
          verification_method?: string | null
          verification_status?: string
          verified_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solution_steps_ink_recognition_id_fkey"
            columns: ["ink_recognition_id"]
            isOneToOne: false
            referencedRelation: "ink_recognitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solution_steps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solution_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "problem_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      study_group_documents: {
        Row: {
          document_id: string
          group_id: string
          id: string
          shared_at: string
          shared_by: string
        }
        Insert: {
          document_id: string
          group_id: string
          id?: string
          shared_at?: string
          shared_by: string
        }
        Update: {
          document_id?: string
          group_id?: string
          id?: string
          shared_at?: string
          shared_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_group_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "study_group_documents_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_documents_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_group_leaderboard: {
        Row: {
          group_id: string
          id: string
          is_visible: boolean
          period_start: string
          period_type: string
          sections_completed: number
          streak_days: number
          study_time_seconds: number
          updated_at: string
          user_id: string
          xp_earned: number
        }
        Insert: {
          group_id: string
          id?: string
          is_visible?: boolean
          period_start: string
          period_type: string
          sections_completed?: number
          streak_days?: number
          study_time_seconds?: number
          updated_at?: string
          user_id: string
          xp_earned?: number
        }
        Update: {
          group_id?: string
          id?: string
          is_visible?: boolean
          period_start?: string
          period_type?: string
          sections_completed?: number
          streak_days?: number
          study_time_seconds?: number
          updated_at?: string
          user_id?: string
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_group_leaderboard_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_leaderboard_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_public: boolean
          max_members: number | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean
          max_members?: number | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean
          max_members?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          app_version: string | null
          created_at: string
          device_type: string | null
          document_id: string | null
          duration_seconds: number | null
          ended_at: string | null
          explanations_requested: number
          hints_received: number
          id: string
          pages_viewed: number
          problems_attempted: number
          started_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_type?: string | null
          document_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          explanations_requested?: number
          hints_received?: number
          id?: string
          pages_viewed?: number
          problems_attempted?: number
          started_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_type?: string | null
          document_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          explanations_requested?: number
          hints_received?: number
          id?: string
          pages_viewed?: number
          problems_attempted?: number
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "study_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_data: Json
          event_type: string
          id: string
          processed: boolean
          processed_at: string | null
          stripe_customer_id: string | null
          stripe_event_id: string
          stripe_subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_data: Json
          event_type: string
          id?: string
          processed?: boolean
          processed_at?: string | null
          stripe_customer_id?: string | null
          stripe_event_id: string
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_data?: Json
          event_type?: string
          id?: string
          processed?: boolean
          processed_at?: string | null
          stripe_customer_id?: string | null
          stripe_event_id?: string
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount_cents: number
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string | null
          currency: string
          failure_count: number | null
          failure_reason: string | null
          id: string
          is_renewal: boolean | null
          metadata: Json | null
          moyasar_payment_id: string | null
          payment_method_id: string | null
          retry_at: string | null
          status: string
          subscription_period: string
          subscription_tier: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          currency?: string
          failure_count?: number | null
          failure_reason?: string | null
          id?: string
          is_renewal?: boolean | null
          metadata?: Json | null
          moyasar_payment_id?: string | null
          payment_method_id?: string | null
          retry_at?: string | null
          status?: string
          subscription_period: string
          subscription_tier: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          currency?: string
          failure_count?: number | null
          failure_reason?: string | null
          id?: string
          is_renewal?: boolean | null
          metadata?: Json | null
          moyasar_payment_id?: string | null
          payment_method_id?: string | null
          retry_at?: string | null
          status?: string
          subscription_period?: string
          subscription_tier?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          badge_text: string | null
          created_at: string
          description: string | null
          display_order: number
          features: Json
          highlight_color: string | null
          id: string
          is_active: boolean
          is_default: boolean
          limits: Json
          name: string
          price_monthly_sar: number | null
          price_monthly_usd: number | null
          price_yearly_sar: number | null
          price_yearly_usd: number | null
          product_id_monthly: string | null
          product_id_yearly: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          features?: Json
          highlight_color?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          limits?: Json
          name: string
          price_monthly_sar?: number | null
          price_monthly_usd?: number | null
          price_yearly_sar?: number | null
          price_yearly_usd?: number | null
          product_id_monthly?: string | null
          product_id_yearly?: string | null
          tier: string
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          features?: Json
          highlight_color?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          limits?: Json
          name?: string
          price_monthly_sar?: number | null
          price_monthly_usd?: number | null
          price_yearly_sar?: number | null
          price_yearly_usd?: number | null
          product_id_monthly?: string | null
          product_id_yearly?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          confidence: number | null
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
          tag_type: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          color?: string | null
          confidence?: number | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug: string
          tag_type?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          color?: string | null
          confidence?: number | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          tag_type?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_user_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          id: string
          metadata: Json | null
          org_id: string | null
          priority: string
          source_document_id: string | null
          source_plugin_family: string | null
          source_selection_id: string | null
          status: string
          title: string
          workspace_id: string | null
        }
        Insert: {
          assignee_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
          priority?: string
          source_document_id?: string | null
          source_plugin_family?: string | null
          source_selection_id?: string | null
          status?: string
          title: string
          workspace_id?: string | null
        }
        Update: {
          assignee_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
          priority?: string
          source_document_id?: string | null
          source_plugin_family?: string | null
          source_selection_id?: string | null
          status?: string
          title?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "tasks_source_selection_id_fkey"
            columns: ["source_selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_records: {
        Row: {
          actions_executed: number
          compute_cost_cents: number
          created_at: string
          documents_processed: number
          explanations_count: number
          id: string
          llm_cost_cents: number
          period_end: string
          period_start: string
          plugin_usage: Json | null
          simulations_count: number
          user_id: string
          verifications_count: number
        }
        Insert: {
          actions_executed?: number
          compute_cost_cents?: number
          created_at?: string
          documents_processed?: number
          explanations_count?: number
          id?: string
          llm_cost_cents?: number
          period_end: string
          period_start: string
          plugin_usage?: Json | null
          simulations_count?: number
          user_id: string
          verifications_count?: number
        }
        Update: {
          actions_executed?: number
          compute_cost_cents?: number
          created_at?: string
          documents_processed?: number
          explanations_count?: number
          id?: string
          llm_cost_cents?: number
          period_end?: string
          period_start?: string
          plugin_usage?: Json | null
          simulations_count?: number
          user_id?: string
          verifications_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_concept_mastery: {
        Row: {
          concept_id: string
          ease_factor: number | null
          first_seen_at: string
          id: string
          interval_days: number | null
          last_seen_at: string
          mastery_score: number
          next_review_at: string | null
          times_encountered: number
          times_struggled: number
          times_succeeded: number
          user_id: string
        }
        Insert: {
          concept_id: string
          ease_factor?: number | null
          first_seen_at?: string
          id?: string
          interval_days?: number | null
          last_seen_at?: string
          mastery_score?: number
          next_review_at?: string | null
          times_encountered?: number
          times_struggled?: number
          times_succeeded?: number
          user_id: string
        }
        Update: {
          concept_id?: string
          ease_factor?: number | null
          first_seen_at?: string
          id?: string
          interval_days?: number | null
          last_seen_at?: string
          mastery_score?: number
          next_review_at?: string | null
          times_encountered?: number
          times_struggled?: number
          times_succeeded?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_concept_mastery_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_concept_mastery_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_exam_progress: {
        Row: {
          exam_date: string | null
          id: string
          last_practiced_at: string | null
          pack_id: string
          problems_attempted: number
          problems_correct: number
          problems_with_hints: number
          started_at: string
          total_time_seconds: number
          user_id: string
          weak_topics: Json | null
        }
        Insert: {
          exam_date?: string | null
          id?: string
          last_practiced_at?: string | null
          pack_id: string
          problems_attempted?: number
          problems_correct?: number
          problems_with_hints?: number
          started_at?: string
          total_time_seconds?: number
          user_id: string
          weak_topics?: Json | null
        }
        Update: {
          exam_date?: string | null
          id?: string
          last_practiced_at?: string | null
          pack_id?: string
          problems_attempted?: number
          problems_correct?: number
          problems_with_hints?: number
          started_at?: string
          total_time_seconds?: number
          user_id?: string
          weak_topics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "user_exam_progress_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "exam_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_exam_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_section_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          document_id: string
          explanations_requested: number
          first_opened_at: string | null
          hints_accepted: number
          id: string
          last_studied_at: string | null
          marked_understood: boolean
          min_explanations_received: number
          problems_attempted: number
          problems_correct: number
          section_opened: boolean
          status: string
          steps_checked: number
          steps_correct: number
          time_spent_seconds: number
          toc_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          document_id: string
          explanations_requested?: number
          first_opened_at?: string | null
          hints_accepted?: number
          id?: string
          last_studied_at?: string | null
          marked_understood?: boolean
          min_explanations_received?: number
          problems_attempted?: number
          problems_correct?: number
          section_opened?: boolean
          status?: string
          steps_checked?: number
          steps_correct?: number
          time_spent_seconds?: number
          toc_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          document_id?: string
          explanations_requested?: number
          first_opened_at?: string | null
          hints_accepted?: number
          id?: string
          last_studied_at?: string | null
          marked_understood?: boolean
          min_explanations_received?: number
          problems_attempted?: number
          problems_correct?: number
          section_opened?: boolean
          status?: string
          steps_checked?: number
          steps_correct?: number
          time_spent_seconds?: number
          toc_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_section_progress_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_section_progress_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "user_section_progress_toc_id_fkey"
            columns: ["toc_id"]
            isOneToOne: false
            referencedRelation: "document_toc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_section_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_audit: {
        Row: {
          actual_result: string | null
          check_type: string
          confidence: number | null
          created_at: string
          domain: string
          expected_result: string | null
          id: string
          input_expression: string | null
          passed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          step_id: string | null
          was_false_negative: boolean | null
          was_false_positive: boolean | null
          workspace_id: string | null
        }
        Insert: {
          actual_result?: string | null
          check_type: string
          confidence?: number | null
          created_at?: string
          domain: string
          expected_result?: string | null
          id?: string
          input_expression?: string | null
          passed: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          step_id?: string | null
          was_false_negative?: boolean | null
          was_false_positive?: boolean | null
          workspace_id?: string | null
        }
        Update: {
          actual_result?: string | null
          check_type?: string
          confidence?: number | null
          created_at?: string
          domain?: string
          expected_result?: string | null
          id?: string
          input_expression?: string | null
          passed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          step_id?: string | null
          was_false_negative?: boolean | null
          was_false_positive?: boolean | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_audit_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_audit_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "solution_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "problem_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_object_versions: {
        Row: {
          change_notes: string | null
          created_at: string | null
          created_by: string | null
          diff_summary_json: Json | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          snapshot_json: Json
          state: string
          verification_object_id: string
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          diff_summary_json?: Json | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot_json: Json
          state?: string
          verification_object_id: string
          version_number: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          diff_summary_json?: Json | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot_json?: Json
          state?: string
          verification_object_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "verification_object_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_object_versions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_object_versions_verification_object_id_fkey"
            columns: ["verification_object_id"]
            isOneToOne: false
            referencedRelation: "verification_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_objects: {
        Row: {
          created_at: string | null
          current_version_id: string | null
          document_id: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          object_type: string
          share_token: string | null
          state: string
          title: string | null
          updated_at: string | null
          user_id: string
          visibility: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          current_version_id?: string | null
          document_id: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          object_type: string
          share_token?: string | null
          state?: string
          title?: string | null
          updated_at?: string | null
          user_id: string
          visibility?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          current_version_id?: string | null
          document_id?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          object_type?: string
          share_token?: string | null
          state?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
          visibility?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "verification_object_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_objects_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_objects_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "obligations_with_clauses"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "verification_objects_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_objects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          error_message: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          trigger_payload: Json | null
          workflow_id: string
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          trigger_payload?: Json | null
          workflow_id: string
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          trigger_payload?: Json | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          step_index: number
          step_type: string
          workflow_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          step_index: number
          step_type: string
          workflow_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          step_index?: number
          step_type?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          plugin_family: string | null
          trigger_filter: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          plugin_family?: string | null
          trigger_filter?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          plugin_family?: string | null
          trigger_filter?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_folders: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          sort_index: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_index?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_index?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "workspace_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          permissions: Json | null
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: Json | null
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: Json | null
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          org_id: string | null
          owner_id: string
          primary_plugin_family: string | null
          sort_index: number | null
          status: string
          updated_at: string
          workspace_type: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          org_id?: string | null
          owner_id: string
          primary_plugin_family?: string | null
          sort_index?: number | null
          status?: string
          updated_at?: string
          workspace_type?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          org_id?: string | null
          owner_id?: string
          primary_plugin_family?: string | null
          sort_index?: number | null
          status?: string
          updated_at?: string
          workspace_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      obligations_with_clauses: {
        Row: {
          action: string | null
          clause_end_page: number | null
          clause_start_page: number | null
          clause_text: string | null
          clause_title: string | null
          clause_type: string | null
          condition: string | null
          confidence_state: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          contract_id: string | null
          contract_type: string | null
          counterparty_entity_id: string | null
          counterparty_name: string | null
          created_at: string | null
          document_id: string | null
          document_title: string | null
          due_at: string | null
          id: string | null
          metadata: Json | null
          obligation_type: string | null
          page_number: number | null
          recurrence: string | null
          responsible_party: string | null
          responsible_party_entity_id: string | null
          source_clause_id: string | null
          summary: string | null
          task_id: string | null
          user_notes: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_obligations_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_obligations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "legal_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_obligations_counterparty_entity_id_fkey"
            columns: ["counterparty_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_obligations_responsible_party_entity_id_fkey"
            columns: ["responsible_party_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_obligations_source_clause_id_fkey"
            columns: ["source_clause_id"]
            isOneToOne: false
            referencedRelation: "legal_clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_obligations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_section_status: {
        Args: {
          p_marked_understood: boolean
          p_min_explanations: number
          p_section_opened: boolean
        }
        Returns: string
      }
      check_and_increment_ask: { Args: { p_user_id: string }; Returns: Json }
      check_and_increment_explanation: {
        Args: { p_user_id: string }
        Returns: Json
      }
      check_and_increment_hourly_usage: {
        Args: { p_amount: number; p_usage_type: string; p_user_id: string }
        Returns: Json
      }
      check_and_increment_search: { Args: { p_user_id: string }; Returns: Json }
      check_and_increment_usage: {
        Args: { p_usage_type: string; p_user_id: string }
        Returns: Json
      }
      check_document_limit: { Args: { p_user_id: string }; Returns: Json }
      check_feature_access: {
        Args: { p_feature: string; p_user_id: string }
        Returns: Json
      }
      check_plan_feature: {
        Args: { p_feature: string; p_tier: string }
        Returns: boolean
      }
      check_storage_limit: {
        Args: { p_file_size: number; p_user_id: string }
        Returns: Json
      }
      cleanup_expired_deleted_items: {
        Args: never
        Returns: {
          documents_deleted: number
          notes_deleted: number
          tasks_deleted: number
          workspaces_deleted: number
        }[]
      }
      compute_content_fingerprint: {
        Args: { p_page_texts: string[]; p_pages_to_hash?: number }
        Returns: string
      }
      compute_content_hash: { Args: { p_content: string }; Returns: string }
      confirm_obligation: {
        Args: { p_notes?: string; p_obligation_id: string; p_user_id: string }
        Returns: undefined
      }
      create_conversation: {
        Args: {
          p_context_text?: string
          p_document_id?: string
          p_note_id?: string
          p_selection_id?: string
          p_user_id: string
        }
        Returns: string
      }
      days_until_permanent_deletion: {
        Args: { deleted_timestamp: string }
        Returns: number
      }
      downgrade_to_free: { Args: { p_user_id: string }; Returns: undefined }
      enter_grace_period: {
        Args: { p_days?: number; p_user_id: string }
        Returns: undefined
      }
      find_canonical_match: {
        Args: { p_content_fingerprint?: string; p_isbn?: string }
        Returns: string
      }
      find_overlapping_lines: {
        Args: {
          p_document_id: string
          p_page_number: number
          p_x_max: number
          p_x_min: number
          p_y_max: number
          p_y_min: number
        }
        Returns: {
          confidence: number
          content_latex: string
          content_text: string
          id: string
          line_index: number
          line_type: string
        }[]
      }
      generate_vector_key: {
        Args: {
          p_chunk_id: string
          p_model: string
          p_version: string
          p_workspace_id: string
        }
        Returns: string
      }
      get_active_embedding_config: {
        Args: { p_workspace_id: string }
        Returns: {
          index_name: string
          model: string
          version: string
        }[]
      }
      get_chunks_needing_embeddings: {
        Args: {
          p_document_id: string
          p_limit?: number
          p_model?: string
          p_version?: string
        }
        Returns: {
          chunk_id: string
          content_hash: string
          content_text: string
          document_id: string
          page_number: number
          user_id: string
          workspace_id: string
        }[]
      }
      get_conversation_history: {
        Args: { p_conversation_id: string; p_limit?: number }
        Returns: {
          content: string
          created_at: string
          id: string
          request_type: string
          role: string
        }[]
      }
      get_default_payment_method: {
        Args: { p_user_id: string }
        Returns: {
          card_brand: string
          card_last_four: string
          id: string
          moyasar_token: string
        }[]
      }
      get_folder_path: {
        Args: { folder_id: string }
        Returns: {
          depth: number
          id: string
          name: string
        }[]
      }
      get_or_create_daily_usage: {
        Args: { p_user_id: string }
        Returns: {
          contract_analyses_count: number | null
          created_at: string | null
          explanations_count: number | null
          handwriting_ocr_count: number | null
          id: string
          semantic_searches_count: number | null
          solution_checks_count: number | null
          updated_at: string | null
          usage_date: string
          user_id: string
          workspace_organization_count: number | null
        }
        SetofOptions: {
          from: "*"
          to: "daily_usage"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_payments_due_for_retry: {
        Args: never
        Returns: {
          failure_count: number
          moyasar_token: string
          payment_id: string
          payment_method_id: string
          subscription_period: string
          subscription_tier: string
          user_id: string
        }[]
      }
      get_plan_features: { Args: { p_tier: string }; Returns: Json }
      get_plan_limit: {
        Args: { p_limit_key: string; p_tier: string }
        Returns: number
      }
      get_plan_limits: { Args: { p_tier: string }; Returns: Json }
      get_rag_rate_limits: { Args: { p_user_id: string }; Returns: Json }
      get_subscription_price: {
        Args: { p_currency?: string; p_period: string; p_tier: string }
        Returns: number
      }
      get_subscription_price_halalas: {
        Args: { p_period: string; p_tier: string }
        Returns: number
      }
      get_subscriptions_due_for_renewal: {
        Args: { p_hours_ahead?: number }
        Returns: {
          moyasar_token: string
          payment_method_id: string
          subscription_expires_at: string
          subscription_period: string
          subscription_tier: string
          user_id: string
        }[]
      }
      get_user_limits_status: { Args: { p_user_id: string }; Returns: Json }
      get_workspace_stats: {
        Args: { p_workspace_id: string }
        Returns: {
          document_count: number
          note_count: number
          task_count: number
          total_items: number
        }[]
      }
      has_mathpix_ocr: { Args: { p_document_id: string }; Returns: boolean }
      increment_daily_usage: {
        Args: { p_column: string; p_usage_date: string; p_user_id: string }
        Returns: undefined
      }
      is_recoverable: { Args: { deleted_timestamp: string }; Returns: boolean }
      mark_obligation_needs_review: {
        Args: { p_notes?: string; p_obligation_id: string }
        Returns: undefined
      }
      pgmq_delete: {
        Args: { msg_id: number; queue_name: string }
        Returns: boolean
      }
      pgmq_read: {
        Args: { n: number; queue_name: string; sleep_seconds: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_send: {
        Args: { message: Json; queue_name: string; sleep_seconds?: number }
        Returns: number
      }
      pgmq_send_batch: {
        Args: { messages: Json[]; queue_name: string; sleep_seconds?: number }
        Returns: number[]
      }
      reset_daily_explanations: { Args: never; Returns: undefined }
      search_document_chunks:
        | {
            Args: {
              p_document_id: string
              p_match_count?: number
              p_match_threshold?: number
              p_query_embedding: string
            }
            Returns: {
              chunk_type: string
              content_latex: string
              content_text: string
              id: string
              page_number: number
              similarity: number
            }[]
          }
        | {
            Args: {
              filter_document_ids?: string[]
              filter_workspace_ids?: string[]
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
            Returns: {
              content_text: string
              document_id: string
              id: string
              language: string
              page_number: number
              similarity: number
              workspace_id: string
            }[]
          }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_folder_cascade: {
        Args: { target_folder_id: string }
        Returns: undefined
      }
      update_storage_usage: {
        Args: { p_delta: number; p_user_id: string }
        Returns: undefined
      }
      update_study_streak: { Args: { p_user_id: string }; Returns: undefined }
      update_user_subscription: {
        Args: {
          p_expires_at: string
          p_period: string
          p_tier: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
