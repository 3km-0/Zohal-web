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
      alert_instances: {
        Row: {
          analysis_space_id: string
          created_at: string
          id: string
          payload_json: Json
          resolved_run_id: string | null
          rule_id: string | null
          status: string
          target_kind: string
          target_logical_key: string
          triggered_run_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          created_at?: string
          id?: string
          payload_json?: Json
          resolved_run_id?: string | null
          rule_id?: string | null
          status?: string
          target_kind: string
          target_logical_key: string
          triggered_run_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          created_at?: string
          id?: string
          payload_json?: Json
          resolved_run_id?: string | null
          rule_id?: string | null
          status?: string
          target_kind?: string
          target_logical_key?: string
          triggered_run_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_instances_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_instances_resolved_run_id_fkey"
            columns: ["resolved_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_instances_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_instances_triggered_run_id_fkey"
            columns: ["triggered_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_instances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          analysis_space_id: string
          created_at: string
          created_by: string | null
          definition_json: Json
          id: string
          rule_key: string
          rule_kind: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          created_at?: string
          created_by?: string | null
          definition_json?: Json
          id?: string
          rule_key: string
          rule_kind: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          created_at?: string
          created_by?: string | null
          definition_json?: Json
          id?: string
          rule_key?: string
          rule_kind?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_actions: {
        Row: {
          action_kind: string
          action_text: string | null
          condition_text: string | null
          created_at: string
          document_id: string
          due_at: string | null
          evidence_document_id: string | null
          evidence_json: Json
          id: string
          metadata_json: Json
          primary_page_number: number | null
          provenance_json: Json
          recurrence: string | null
          responsible_party: string | null
          source_record_id: string | null
          summary: string | null
          task_id: string | null
          title: string | null
          updated_at: string
          verification_object_id: string
          version_id: string | null
          workflow_state: string
          workspace_id: string
        }
        Insert: {
          action_kind: string
          action_text?: string | null
          condition_text?: string | null
          created_at?: string
          document_id: string
          due_at?: string | null
          evidence_document_id?: string | null
          evidence_json?: Json
          id: string
          metadata_json?: Json
          primary_page_number?: number | null
          provenance_json?: Json
          recurrence?: string | null
          responsible_party?: string | null
          source_record_id?: string | null
          summary?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string
          verification_object_id: string
          version_id?: string | null
          workflow_state?: string
          workspace_id: string
        }
        Update: {
          action_kind?: string
          action_text?: string | null
          condition_text?: string | null
          created_at?: string
          document_id?: string
          due_at?: string | null
          evidence_document_id?: string | null
          evidence_json?: Json
          id?: string
          metadata_json?: Json
          primary_page_number?: number | null
          provenance_json?: Json
          recurrence?: string | null
          responsible_party?: string | null
          source_record_id?: string | null
          summary?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string
          verification_object_id?: string
          version_id?: string | null
          workflow_state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_actions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_actions_evidence_document_id_fkey"
            columns: ["evidence_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_actions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_actions_verification_object_id_fkey"
            columns: ["verification_object_id"]
            isOneToOne: false
            referencedRelation: "verification_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_actions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "verification_object_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_exceptions: {
        Row: {
          created_at: string
          document_id: string
          exception_type: string
          id: string
          message: string
          payload_json: Json
          severity: string
          status: string
          updated_at: string
          verification_object_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          exception_type?: string
          id?: string
          message: string
          payload_json?: Json
          severity?: string
          status?: string
          updated_at?: string
          verification_object_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          exception_type?: string
          id?: string
          message?: string
          payload_json?: Json
          severity?: string
          status?: string
          updated_at?: string
          verification_object_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_exceptions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_exceptions_verification_object_id_fkey"
            columns: ["verification_object_id"]
            isOneToOne: false
            referencedRelation: "verification_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_exceptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_records: {
        Row: {
          created_at: string
          document_id: string
          evidence_json: Json
          fields_json: Json
          id: string
          provenance_json: Json
          rationale: string | null
          record_type: string
          severity: string | null
          status: string
          summary: string | null
          title: string | null
          updated_at: string
          verification_object_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          evidence_json?: Json
          fields_json?: Json
          id?: string
          provenance_json?: Json
          rationale?: string | null
          record_type: string
          severity?: string | null
          status?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          verification_object_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          evidence_json?: Json
          fields_json?: Json
          id?: string
          provenance_json?: Json
          rationale?: string | null
          record_type?: string
          severity?: string | null
          status?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          verification_object_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_records_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_records_verification_object_id_fkey"
            columns: ["verification_object_id"]
            isOneToOne: false
            referencedRelation: "verification_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_refresh_jobs: {
        Row: {
          analysis_space_id: string
          created_at: string
          id: string
          metadata_json: Json
          priority: number
          reason: string
          run_id: string | null
          status: string
          target_key: string
          target_kind: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          created_at?: string
          id?: string
          metadata_json?: Json
          priority?: number
          reason: string
          run_id?: string | null
          status?: string
          target_key: string
          target_kind: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          created_at?: string
          id?: string
          metadata_json?: Json
          priority?: number
          reason?: string
          run_id?: string | null
          status?: string
          target_key?: string
          target_kind?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_refresh_jobs_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_refresh_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_refresh_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_run_sources: {
        Row: {
          analysis_space_id: string
          created_at: string
          id: string
          inclusion_state: string
          reason_json: Json
          resolved_by_id: string | null
          resolved_by_kind: string
          run_id: string
          source_id: string
          source_kind: string
          source_revision_id: string | null
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          created_at?: string
          id?: string
          inclusion_state?: string
          reason_json?: Json
          resolved_by_id?: string | null
          resolved_by_kind?: string
          run_id: string
          source_id: string
          source_kind: string
          source_revision_id?: string | null
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          created_at?: string
          id?: string
          inclusion_state?: string
          reason_json?: Json
          resolved_by_id?: string | null
          resolved_by_kind?: string
          run_id?: string
          source_id?: string
          source_kind?: string
          source_revision_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_run_sources_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_run_sources_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_run_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_runs: {
        Row: {
          analysis_space_id: string
          comparison_target_json: Json | null
          completed_at: string | null
          corpus_revision_id: string | null
          created_at: string
          execution_plane: string
          id: string
          partition_key: string | null
          planner_payload_json: Json
          run_summary_json: Json
          scope_mode: string
          scope_policy_json: Json
          snapshot_version_id: string | null
          source_extraction_run_id: string | null
          started_at: string | null
          status: string
          template_id: string
          template_version: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          comparison_target_json?: Json | null
          completed_at?: string | null
          corpus_revision_id?: string | null
          created_at?: string
          execution_plane?: string
          id: string
          partition_key?: string | null
          planner_payload_json?: Json
          run_summary_json?: Json
          scope_mode?: string
          scope_policy_json?: Json
          snapshot_version_id?: string | null
          source_extraction_run_id?: string | null
          started_at?: string | null
          status?: string
          template_id: string
          template_version?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          comparison_target_json?: Json | null
          completed_at?: string | null
          corpus_revision_id?: string | null
          created_at?: string
          execution_plane?: string
          id?: string
          partition_key?: string | null
          planner_payload_json?: Json
          run_summary_json?: Json
          scope_mode?: string
          scope_policy_json?: Json
          snapshot_version_id?: string | null
          source_extraction_run_id?: string | null
          started_at?: string | null
          status?: string
          template_id?: string
          template_version?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_corpus_revision_id_fkey"
            columns: ["corpus_revision_id"]
            isOneToOne: false
            referencedRelation: "corpus_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "verification_object_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_source_extraction_run_id_fkey"
            columns: ["source_extraction_run_id"]
            isOneToOne: false
            referencedRelation: "extraction_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_spaces: {
        Row: {
          base_analysis_space_id: string | null
          compatibility_verification_object_id: string | null
          created_at: string
          current_corpus_revision_id: string | null
          current_run_id: string | null
          current_snapshot_version_id: string | null
          frozen_at_run_id: string | null
          id: string
          partition_grain: string | null
          primary_document_id: string | null
          scope_anchor_field: string | null
          scope_anchor_kind: string
          scope_display_label: string | null
          scope_mode: string
          scope_policy_json: Json
          status: string
          template_id: string
          template_version: string
          updated_at: string
          window_definition_json: Json | null
          workspace_id: string
        }
        Insert: {
          base_analysis_space_id?: string | null
          compatibility_verification_object_id?: string | null
          created_at?: string
          current_corpus_revision_id?: string | null
          current_run_id?: string | null
          current_snapshot_version_id?: string | null
          frozen_at_run_id?: string | null
          id?: string
          partition_grain?: string | null
          primary_document_id?: string | null
          scope_anchor_field?: string | null
          scope_anchor_kind?: string
          scope_display_label?: string | null
          scope_mode?: string
          scope_policy_json?: Json
          status?: string
          template_id: string
          template_version?: string
          updated_at?: string
          window_definition_json?: Json | null
          workspace_id: string
        }
        Update: {
          base_analysis_space_id?: string | null
          compatibility_verification_object_id?: string | null
          created_at?: string
          current_corpus_revision_id?: string | null
          current_run_id?: string | null
          current_snapshot_version_id?: string | null
          frozen_at_run_id?: string | null
          id?: string
          partition_grain?: string | null
          primary_document_id?: string | null
          scope_anchor_field?: string | null
          scope_anchor_kind?: string
          scope_display_label?: string | null
          scope_mode?: string
          scope_policy_json?: Json
          status?: string
          template_id?: string
          template_version?: string
          updated_at?: string
          window_definition_json?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_spaces_base_analysis_space_fkey"
            columns: ["base_analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_spaces_compatibility_verification_object_id_fkey"
            columns: ["compatibility_verification_object_id"]
            isOneToOne: true
            referencedRelation: "verification_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_spaces_current_corpus_revision_fkey"
            columns: ["current_corpus_revision_id"]
            isOneToOne: false
            referencedRelation: "corpus_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_spaces_current_run_fkey"
            columns: ["current_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_spaces_current_snapshot_version_id_fkey"
            columns: ["current_snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "verification_object_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_spaces_frozen_at_run_fkey"
            columns: ["frozen_at_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_spaces_primary_document_id_fkey"
            columns: ["primary_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_spaces_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_subjects: {
        Row: {
          analysis_space_id: string
          attributes_json: Json
          created_at: string
          id: string
          status: string
          subject_key: string
          subject_type: string
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          attributes_json?: Json
          created_at?: string
          id: string
          status?: string
          subject_key: string
          subject_type: string
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          attributes_json?: Json
          created_at?: string
          id?: string
          status?: string
          subject_key?: string
          subject_type?: string
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_subjects_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_subjects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_verdicts: {
        Row: {
          confidence: string | null
          created_at: string
          document_id: string
          evidence_json: Json
          explanation: string | null
          id: string
          metadata_json: Json
          rule_id: string
          severity: string
          status: string
          updated_at: string
          verification_object_id: string
          workspace_id: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          document_id: string
          evidence_json?: Json
          explanation?: string | null
          id?: string
          metadata_json?: Json
          rule_id: string
          severity?: string
          status: string
          updated_at?: string
          verification_object_id: string
          workspace_id: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          document_id?: string
          evidence_json?: Json
          explanation?: string | null
          id?: string
          metadata_json?: Json
          rule_id?: string
          severity?: string
          status?: string
          updated_at?: string
          verification_object_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_verdicts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_verdicts_verification_object_id_fkey"
            columns: ["verification_object_id"]
            isOneToOne: false
            referencedRelation: "verification_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_verdicts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_fetch_result_excerpts: {
        Row: {
          content_text: string
          created_at: string
          fetch_result_id: string
          id: string
          metadata_json: Json
          ordinal: number
          response_path: string
          source_label: string | null
        }
        Insert: {
          content_text: string
          created_at?: string
          fetch_result_id: string
          id?: string
          metadata_json?: Json
          ordinal: number
          response_path: string
          source_label?: string | null
        }
        Update: {
          content_text?: string
          created_at?: string
          fetch_result_id?: string
          id?: string
          metadata_json?: Json
          ordinal?: number
          response_path?: string
          source_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_fetch_result_excerpts_fetch_result_id_fkey"
            columns: ["fetch_result_id"]
            isOneToOne: false
            referencedRelation: "api_fetch_results"
            referencedColumns: ["id"]
          },
        ]
      }
      api_fetch_results: {
        Row: {
          connection_id: string
          expires_at: string | null
          fetched_at: string
          id: string
          response_body: Json
          response_status: number | null
          response_text: string | null
          run_id: string | null
          workspace_id: string
        }
        Insert: {
          connection_id: string
          expires_at?: string | null
          fetched_at?: string
          id?: string
          response_body?: Json
          response_status?: number | null
          response_text?: string | null
          run_id?: string | null
          workspace_id: string
        }
        Update: {
          connection_id?: string
          expires_at?: string | null
          fetched_at?: string
          id?: string
          response_body?: Json
          response_status?: number | null
          response_text?: string | null
          run_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_fetch_results_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "workspace_api_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_fetch_results_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_model_rates: {
        Row: {
          cached_input_token_multiplier: number
          created_at: string
          embedding_token_multiplier: number
          input_token_multiplier: number
          is_active: boolean
          model_key: string
          notes: string | null
          output_token_multiplier: number
          provider: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          cached_input_token_multiplier?: number
          created_at?: string
          embedding_token_multiplier?: number
          input_token_multiplier?: number
          is_active?: boolean
          model_key: string
          notes?: string | null
          output_token_multiplier?: number
          provider: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          cached_input_token_multiplier?: number
          created_at?: string
          embedding_token_multiplier?: number
          input_token_multiplier?: number
          is_active?: boolean
          model_key?: string
          notes?: string | null
          output_token_multiplier?: number
          provider?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      billing_operation_rates: {
        Row: {
          billable_ops_per_unit: number
          created_at: string
          is_active: boolean
          notes: string | null
          operation_key: string
          provider: string
          source_url: string | null
          unit_label: string
          updated_at: string
        }
        Insert: {
          billable_ops_per_unit: number
          created_at?: string
          is_active?: boolean
          notes?: string | null
          operation_key: string
          provider: string
          source_url?: string | null
          unit_label?: string
          updated_at?: string
        }
        Update: {
          billable_ops_per_unit?: number
          created_at?: string
          is_active?: boolean
          notes?: string | null
          operation_key?: string
          provider?: string
          source_url?: string | null
          unit_label?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_usage_monthly: {
        Row: {
          billable_ops_used: number
          breakdown: Json
          created_at: string
          metered_tokens_used: number
          period_end: string
          period_start: string
          raw_cached_input_tokens: number
          raw_embedding_tokens: number
          raw_input_tokens: number
          raw_output_tokens: number
          storage_bytes_snapshot: number
          updated_at: string
          user_id: string
        }
        Insert: {
          billable_ops_used?: number
          breakdown?: Json
          created_at?: string
          metered_tokens_used?: number
          period_end: string
          period_start: string
          raw_cached_input_tokens?: number
          raw_embedding_tokens?: number
          raw_input_tokens?: number
          raw_output_tokens?: number
          storage_bytes_snapshot?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          billable_ops_used?: number
          breakdown?: Json
          created_at?: string
          metered_tokens_used?: number
          period_end?: string
          period_start?: string
          raw_cached_input_tokens?: number
          raw_embedding_tokens?: number
          raw_input_tokens?: number
          raw_output_tokens?: number
          storage_bytes_snapshot?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_usage_monthly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      context_set_members: {
        Row: {
          added_by: string | null
          context_set_id: string
          created_at: string
          document_id: string
          id: string
          role: string
          sort_order: number
        }
        Insert: {
          added_by?: string | null
          context_set_id: string
          created_at?: string
          document_id: string
          id?: string
          role?: string
          sort_order?: number
        }
        Update: {
          added_by?: string | null
          context_set_id?: string
          created_at?: string
          document_id?: string
          id?: string
          role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "context_set_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_set_members_context_set_id_fkey"
            columns: ["context_set_id"]
            isOneToOne: false
            referencedRelation: "context_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_set_members_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      context_sets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_sets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      corpus_revision_members: {
        Row: {
          analysis_space_id: string
          corpus_revision_id: string
          created_at: string
          id: string
          inclusion_state: string
          reason_json: Json
          resolved_by_id: string | null
          resolved_by_kind: string
          source_id: string
          source_kind: string
          source_revision_id: string | null
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          corpus_revision_id: string
          created_at?: string
          id?: string
          inclusion_state?: string
          reason_json?: Json
          resolved_by_id?: string | null
          resolved_by_kind?: string
          source_id: string
          source_kind: string
          source_revision_id?: string | null
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          corpus_revision_id?: string
          created_at?: string
          id?: string
          inclusion_state?: string
          reason_json?: Json
          resolved_by_id?: string | null
          resolved_by_kind?: string
          source_id?: string
          source_kind?: string
          source_revision_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corpus_revision_members_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corpus_revision_members_corpus_revision_id_fkey"
            columns: ["corpus_revision_id"]
            isOneToOne: false
            referencedRelation: "corpus_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corpus_revision_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      corpus_revisions: {
        Row: {
          analysis_space_id: string
          created_at: string
          created_by: string | null
          excluded_count: number
          id: string
          included_count: number
          manifest_hash: string
          revision_number: number
          source_manifest_json: Json
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          created_at?: string
          created_by?: string | null
          excluded_count?: number
          id?: string
          included_count?: number
          manifest_hash: string
          revision_number: number
          source_manifest_json?: Json
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          created_at?: string
          created_by?: string | null
          excluded_count?: number
          id?: string
          included_count?: number
          manifest_hash?: string
          revision_number?: number
          source_manifest_json?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corpus_revisions_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corpus_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corpus_revisions_workspace_id_fkey"
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
      data_locality_regions: {
        Row: {
          city: string
          compliance: Json
          country_code: string
          created_at: string
          display_order: number
          is_active: boolean
          lat: number
          lng: number
          provider: string
          region_code: string
          updated_at: string
        }
        Insert: {
          city: string
          compliance?: Json
          country_code: string
          created_at?: string
          display_order?: number
          is_active?: boolean
          lat: number
          lng: number
          provider?: string
          region_code: string
          updated_at?: string
        }
        Update: {
          city?: string
          compliance?: Json
          country_code?: string
          created_at?: string
          display_order?: number
          is_active?: boolean
          lat?: number
          lng?: number
          provider?: string
          region_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_bundle_members: {
        Row: {
          added_by: string | null
          bundle_id: string
          created_at: string
          document_id: string
          id: string
          role: string
          sort_order: number
        }
        Insert: {
          added_by?: string | null
          bundle_id: string
          created_at?: string
          document_id: string
          id?: string
          role?: string
          sort_order?: number
        }
        Update: {
          added_by?: string | null
          bundle_id?: string
          created_at?: string
          document_id?: string
          id?: string
          role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_bundle_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_bundle_members_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "document_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_bundle_members_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_bundles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string | null
          precedence_policy: string
          primary_document_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          precedence_policy?: string
          primary_document_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          precedence_policy?: string
          primary_document_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_bundles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_bundles_primary_document_id_fkey"
            columns: ["primary_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_bundles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          metadata_json: Json
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
          metadata_json?: Json
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
          metadata_json?: Json
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
        ]
      }
      document_relationships: {
        Row: {
          analysis_space_id: string | null
          applicability_json: Json
          confidence: number | null
          created_at: string
          created_by: string | null
          effective_at: string | null
          id: string
          lineage_json: Json
          relation_type: string
          review_status: string
          source_document_id: string
          target_document_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id?: string | null
          applicability_json?: Json
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          effective_at?: string | null
          id?: string
          lineage_json?: Json
          relation_type: string
          review_status?: string
          source_document_id: string
          target_document_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string | null
          applicability_json?: Json
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          effective_at?: string | null
          id?: string
          lineage_json?: Json
          relation_type?: string
          review_status?: string
          source_document_id?: string
          target_document_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_relationships_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_relationships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_relationships_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_relationships_target_document_id_fkey"
            columns: ["target_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_relationships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_revisions: {
        Row: {
          content_identity: string
          created_at: string
          document_id: string
          id: string
          source_kind: string
          source_metadata_json: Json
          workspace_id: string
        }
        Insert: {
          content_identity: string
          created_at?: string
          document_id: string
          id?: string
          source_kind?: string
          source_metadata_json?: Json
          workspace_id: string
        }
        Update: {
          content_identity?: string
          created_at?: string
          document_id?: string
          id?: string
          source_kind?: string
          source_metadata_json?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_revisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_revisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          document_tags: string[]
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
          document_tags?: string[]
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
          document_tags?: string[]
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
      enterprise_inquiries: {
        Row: {
          company: string | null
          company_size: string | null
          created_at: string | null
          email: string
          id: string
          message: string | null
          name: string
          notes: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company?: string | null
          company_size?: string | null
          created_at?: string | null
          email: string
          id?: string
          message?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company?: string | null
          company_size?: string | null
          created_at?: string | null
          email?: string
          id?: string
          message?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_inquiries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      evidence_refs: {
        Row: {
          api_source_json: Json
          bbox_json: Json
          char_end: number | null
          char_start: number | null
          chunk_id: string | null
          created_at: string
          document_revision_id: string | null
          fingerprint: string
          id: string
          page_number: number | null
          snippet: string | null
          source_document_id: string | null
          source_kind: string
          workspace_id: string
        }
        Insert: {
          api_source_json?: Json
          bbox_json?: Json
          char_end?: number | null
          char_start?: number | null
          chunk_id?: string | null
          created_at?: string
          document_revision_id?: string | null
          fingerprint: string
          id: string
          page_number?: number | null
          snippet?: string | null
          source_document_id?: string | null
          source_kind?: string
          workspace_id: string
        }
        Update: {
          api_source_json?: Json
          bbox_json?: Json
          char_end?: number | null
          char_start?: number | null
          chunk_id?: string | null
          created_at?: string
          document_revision_id?: string | null
          fingerprint?: string
          id?: string
          page_number?: number | null
          snippet?: string | null
          source_document_id?: string | null
          source_kind?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_refs_document_revision_id_fkey"
            columns: ["document_revision_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_refs_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_refs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      experience_access_grants: {
        Row: {
          created_at: string
          experience_id: string
          expires_at: string
          grant_id: string
          grant_kind: string
          issued_to_email: string | null
          issued_to_user_id: string | null
          metadata_json: Json | null
          revoked_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          experience_id: string
          expires_at: string
          grant_id?: string
          grant_kind: string
          issued_to_email?: string | null
          issued_to_user_id?: string | null
          metadata_json?: Json | null
          revoked_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          experience_id?: string
          expires_at?: string
          grant_id?: string
          grant_kind?: string
          issued_to_email?: string | null
          issued_to_user_id?: string | null
          metadata_json?: Json | null
          revoked_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_access_grants_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_access_grants_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_access_grants_issued_to_user_id_fkey"
            columns: ["issued_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_access_policies: {
        Row: {
          experience_id: string
          expires_at: string | null
          indexing_allowed: boolean
          org_restricted: boolean
          password_hash_ref: string | null
          password_protected: boolean
          updated_at: string
          visibility: string
        }
        Insert: {
          experience_id: string
          expires_at?: string | null
          indexing_allowed?: boolean
          org_restricted?: boolean
          password_hash_ref?: string | null
          password_protected?: boolean
          updated_at?: string
          visibility: string
        }
        Update: {
          experience_id?: string
          expires_at?: string | null
          indexing_allowed?: boolean
          org_restricted?: boolean
          password_hash_ref?: string | null
          password_protected?: boolean
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_access_policies_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: true
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_access_policies_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: true
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
        ]
      }
      experience_access_secrets: {
        Row: {
          created_at: string
          experience_id: string
          secret_hash: string
          secret_kind: string
          secret_ref: string
        }
        Insert: {
          created_at?: string
          experience_id: string
          secret_hash: string
          secret_kind: string
          secret_ref: string
        }
        Update: {
          created_at?: string
          experience_id?: string
          secret_hash?: string
          secret_kind?: string
          secret_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_access_secrets_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_access_secrets_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
        ]
      }
      experience_active_revisions: {
        Row: {
          activated_at: string
          activated_by: string | null
          active_revision_id: string
          experience_id: string
          previous_revision_id: string | null
        }
        Insert: {
          activated_at?: string
          activated_by?: string | null
          active_revision_id: string
          experience_id: string
          previous_revision_id?: string | null
        }
        Update: {
          activated_at?: string
          activated_by?: string | null
          active_revision_id?: string
          experience_id?: string
          previous_revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_active_revisions_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_active_revisions_active_revision_id_fkey"
            columns: ["active_revision_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_revisions"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "experience_active_revisions_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: true
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_active_revisions_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: true
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_active_revisions_previous_revision_id_fkey"
            columns: ["previous_revision_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_revisions"
            referencedColumns: ["revision_id"]
          },
        ]
      }
      experience_compilation_runs: {
        Row: {
          candidate_id: string
          compiler_bundle_json: Json
          created_at: string
          experience_id: string
          failure_json: Json | null
          request_id: string
          run_id: string
          status: string
          trigger_kind: string
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          compiler_bundle_json: Json
          created_at?: string
          experience_id: string
          failure_json?: Json | null
          request_id: string
          run_id?: string
          status: string
          trigger_kind?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          compiler_bundle_json?: Json
          created_at?: string
          experience_id?: string
          failure_json?: Json | null
          request_id?: string
          run_id?: string
          status?: string
          trigger_kind?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_compilation_runs_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_compilation_runs_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_compilation_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_hosts: {
        Row: {
          created_at: string
          experience_id: string
          host: string
          host_id: string
          host_mode: string
          is_primary: boolean
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          experience_id: string
          host: string
          host_id?: string
          host_mode: string
          is_primary?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          experience_id?: string
          host?: string
          host_id?: string
          host_mode?: string
          is_primary?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_hosts_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_hosts_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
        ]
      }
      experience_publication_candidates: {
        Row: {
          candidate_id: string
          compiler_bundle_json: Json
          created_at: string
          experience_id: string
          failure_json: Json | null
          revision_id: string
          run_id: string
          status: string
          updated_at: string
          validation_report_json: Json | null
        }
        Insert: {
          candidate_id?: string
          compiler_bundle_json: Json
          created_at?: string
          experience_id: string
          failure_json?: Json | null
          revision_id: string
          run_id: string
          status: string
          updated_at?: string
          validation_report_json?: Json | null
        }
        Update: {
          candidate_id?: string
          compiler_bundle_json?: Json
          created_at?: string
          experience_id?: string
          failure_json?: Json | null
          revision_id?: string
          run_id?: string
          status?: string
          updated_at?: string
          validation_report_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_publication_candidates_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_publication_candidates_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_publication_candidates_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_revisions"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "experience_publication_candidates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "experience_compilation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      experience_publication_events: {
        Row: {
          actor_id: string | null
          candidate_id: string | null
          created_at: string
          event_id: string
          event_kind: string
          experience_id: string
          payload_json: Json | null
          request_id: string | null
          revision_id: string | null
        }
        Insert: {
          actor_id?: string | null
          candidate_id?: string | null
          created_at?: string
          event_id?: string
          event_kind: string
          experience_id: string
          payload_json?: Json | null
          request_id?: string | null
          revision_id?: string | null
        }
        Update: {
          actor_id?: string | null
          candidate_id?: string | null
          created_at?: string
          event_id?: string
          event_kind?: string
          experience_id?: string
          payload_json?: Json | null
          request_id?: string | null
          revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_publication_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_publication_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_candidates"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "experience_publication_events_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_publication_events_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_publication_events_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_revisions"
            referencedColumns: ["revision_id"]
          },
        ]
      }
      experience_publication_revisions: {
        Row: {
          asset_manifest_ref: string
          compatibility_report_ref: string | null
          compatibility_status: string
          compiler_version: string
          created_at: string
          experience_id: string
          published_at: string | null
          renderer_version: string
          revision_id: string
          state_manifest_ref: string | null
          state_schema_version: string
          truth_manifest_ref: string
          validated_at: string | null
          validation_report_ref: string | null
          validity_status: string
        }
        Insert: {
          asset_manifest_ref: string
          compatibility_report_ref?: string | null
          compatibility_status?: string
          compiler_version: string
          created_at?: string
          experience_id: string
          published_at?: string | null
          renderer_version: string
          revision_id?: string
          state_manifest_ref?: string | null
          state_schema_version: string
          truth_manifest_ref: string
          validated_at?: string | null
          validation_report_ref?: string | null
          validity_status?: string
        }
        Update: {
          asset_manifest_ref?: string
          compatibility_report_ref?: string | null
          compatibility_status?: string
          compiler_version?: string
          created_at?: string
          experience_id?: string
          published_at?: string | null
          renderer_version?: string
          revision_id?: string
          state_manifest_ref?: string | null
          state_schema_version?: string
          truth_manifest_ref?: string
          validated_at?: string | null
          validation_report_ref?: string | null
          validity_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_publication_revisions_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_publication_revisions_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
        ]
      }
      experience_registry: {
        Row: {
          corpus_id: string
          created_at: string
          created_by: string | null
          default_visibility: string
          description: string | null
          experience_id: string
          experience_lane: string
          last_canonical_version_id: string | null
          last_overlay_sync_at: string | null
          materialization_status: string
          publication_lane: string
          publication_status: string
          scaffold_status: string
          source_document_id: string | null
          source_scope: string
          template_id: string
          template_version: string
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          corpus_id: string
          created_at?: string
          created_by?: string | null
          default_visibility?: string
          description?: string | null
          experience_id?: string
          experience_lane?: string
          last_canonical_version_id?: string | null
          last_overlay_sync_at?: string | null
          materialization_status?: string
          publication_lane?: string
          publication_status?: string
          scaffold_status?: string
          source_document_id?: string | null
          source_scope?: string
          template_id: string
          template_version: string
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          corpus_id?: string
          created_at?: string
          created_by?: string | null
          default_visibility?: string
          description?: string | null
          experience_id?: string
          experience_lane?: string
          last_canonical_version_id?: string | null
          last_overlay_sync_at?: string | null
          materialization_status?: string
          publication_lane?: string
          publication_status?: string
          scaffold_status?: string
          source_document_id?: string | null
          source_scope?: string
          template_id?: string
          template_version?: string
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_registry_last_canonical_version_id_fkey"
            columns: ["last_canonical_version_id"]
            isOneToOne: false
            referencedRelation: "verification_object_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_registry_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_registry_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_runtime_state_backups: {
        Row: {
          backup_id: string
          created_at: string
          experience_id: string
          last_d1_updated_at: string | null
          revision_id: string
          source_kind: string
          state_category: string
          state_hash: string | null
          state_json: Json
          state_key: string
          state_scope: string
          synced_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          backup_id?: string
          created_at?: string
          experience_id: string
          last_d1_updated_at?: string | null
          revision_id: string
          source_kind?: string
          state_category: string
          state_hash?: string | null
          state_json?: Json
          state_key: string
          state_scope: string
          synced_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          backup_id?: string
          created_at?: string
          experience_id?: string
          last_d1_updated_at?: string | null
          revision_id?: string
          source_kind?: string
          state_category?: string
          state_hash?: string | null
          state_json?: Json
          state_key?: string
          state_scope?: string
          synced_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_runtime_state_backups_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_runtime_state_backups_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_runtime_state_backups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_state_manifests: {
        Row: {
          created_at: string
          experience_id: string
          manifest_json: Json
          manifest_ref: string
          revision_id: string
        }
        Insert: {
          created_at?: string
          experience_id: string
          manifest_json: Json
          manifest_ref: string
          revision_id: string
        }
        Update: {
          created_at?: string
          experience_id?: string
          manifest_json?: Json
          manifest_ref?: string
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_state_manifests_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_state_manifests_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_state_manifests_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_revisions"
            referencedColumns: ["revision_id"]
          },
        ]
      }
      experience_validation_reports: {
        Row: {
          candidate_id: string
          created_at: string
          experience_id: string
          report_id: string
          report_json: Json
          report_kind: string
          report_status: string
          revision_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          experience_id: string
          report_id?: string
          report_json: Json
          report_kind: string
          report_status: string
          revision_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          experience_id?: string
          report_id?: string
          report_json?: Json
          report_kind?: string
          report_status?: string
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_validation_reports_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_candidates"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "experience_validation_reports_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_resolution_v1"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_validation_reports_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_registry"
            referencedColumns: ["experience_id"]
          },
          {
            foreignKeyName: "experience_validation_reports_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_revisions"
            referencedColumns: ["revision_id"]
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
          document_id: string | null
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
          document_id?: string | null
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
          document_id?: string | null
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
      fact_versions: {
        Row: {
          analysis_space_id: string
          created_at: string
          evidence_ref_ids: Json
          fact_id: string
          id: string
          lifecycle_status: string
          lineage_json: Json
          partition_key: string | null
          period_key: string | null
          provenance_class: string
          run_id: string | null
          snapshot_item_id: string | null
          snapshot_version_id: string | null
          state_hash: string
          subject_id: string | null
          value_json: Json
          verification_state: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          created_at?: string
          evidence_ref_ids?: Json
          fact_id: string
          id: string
          lifecycle_status?: string
          lineage_json?: Json
          partition_key?: string | null
          period_key?: string | null
          provenance_class: string
          run_id?: string | null
          snapshot_item_id?: string | null
          snapshot_version_id?: string | null
          state_hash?: string
          subject_id?: string | null
          value_json?: Json
          verification_state?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          created_at?: string
          evidence_ref_ids?: Json
          fact_id?: string
          id?: string
          lifecycle_status?: string
          lineage_json?: Json
          partition_key?: string | null
          period_key?: string | null
          provenance_class?: string
          run_id?: string | null
          snapshot_item_id?: string | null
          snapshot_version_id?: string | null
          state_hash?: string
          subject_id?: string | null
          value_json?: Json
          verification_state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_versions_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_versions_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_versions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_versions_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "verification_object_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_versions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "analysis_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      facts: {
        Row: {
          analysis_space_id: string
          created_at: string
          current_run_id: string | null
          current_snapshot_item_id: string | null
          current_version_id: string | null
          evidence_ref_ids: Json
          fact_kind: string
          id: string
          last_seen_run_id: string | null
          lifecycle_status: string
          lineage_json: Json
          logical_key: string
          partition_key: string | null
          period_key: string | null
          provenance_class: string
          state_hash: string
          subject_id: string | null
          updated_at: string
          value_json: Json
          verification_state: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          created_at?: string
          current_run_id?: string | null
          current_snapshot_item_id?: string | null
          current_version_id?: string | null
          evidence_ref_ids?: Json
          fact_kind: string
          id: string
          last_seen_run_id?: string | null
          lifecycle_status?: string
          lineage_json?: Json
          logical_key: string
          partition_key?: string | null
          period_key?: string | null
          provenance_class: string
          state_hash?: string
          subject_id?: string | null
          updated_at?: string
          value_json?: Json
          verification_state?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          created_at?: string
          current_run_id?: string | null
          current_snapshot_item_id?: string | null
          current_version_id?: string | null
          evidence_ref_ids?: Json
          fact_kind?: string
          id?: string
          last_seen_run_id?: string | null
          lifecycle_status?: string
          lineage_json?: Json
          logical_key?: string
          partition_key?: string | null
          period_key?: string | null
          provenance_class?: string
          state_hash?: string
          subject_id?: string | null
          updated_at?: string
          value_json?: Json
          verification_state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facts_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_current_run_id_fkey"
            columns: ["current_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "fact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_last_seen_run_id_fkey"
            columns: ["last_seen_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "analysis_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_workspace_id_fkey"
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
      folders: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          icon: string | null
          id: string
          name: string
          org_id: string | null
          owner_id: string
          parent_id: string | null
          sort_index: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          name: string
          org_id?: string | null
          owner_id: string
          parent_id?: string | null
          sort_index?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          org_id?: string | null
          owner_id?: string
          parent_id?: string | null
          sort_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string
          failed_attempts: number
          format: string
          id: string
          is_password_protected: boolean
          locked_until: string | null
          output_type: string
          password_hash: string | null
          password_hint: string | null
          password_salt: string | null
          share_token: string | null
          share_url: string | null
          storage_bucket: string | null
          storage_path: string | null
          subtitle: string | null
          template: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id: string
          failed_attempts?: number
          format?: string
          id?: string
          is_password_protected?: boolean
          locked_until?: string | null
          output_type?: string
          password_hash?: string | null
          password_hint?: string | null
          password_salt?: string | null
          share_token?: string | null
          share_url?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          subtitle?: string | null
          template?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string
          failed_attempts?: number
          format?: string
          id?: string
          is_password_protected?: boolean
          locked_until?: string | null
          output_type?: string
          password_hash?: string | null
          password_hint?: string | null
          password_salt?: string | null
          share_token?: string | null
          share_url?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          subtitle?: string | null
          template?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      issue_versions: {
        Row: {
          analysis_space_id: string
          created_at: string
          evidence_ref_ids: Json
          id: string
          issue_id: string
          lineage_json: Json
          partition_key: string | null
          payload_json: Json
          provenance_class: string
          run_id: string | null
          severity: string | null
          snapshot_item_id: string | null
          snapshot_version_id: string | null
          state_hash: string
          status: string
          subject_id: string | null
          summary: string | null
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          created_at?: string
          evidence_ref_ids?: Json
          id: string
          issue_id: string
          lineage_json?: Json
          partition_key?: string | null
          payload_json?: Json
          provenance_class: string
          run_id?: string | null
          severity?: string | null
          snapshot_item_id?: string | null
          snapshot_version_id?: string | null
          state_hash?: string
          status?: string
          subject_id?: string | null
          summary?: string | null
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          created_at?: string
          evidence_ref_ids?: Json
          id?: string
          issue_id?: string
          lineage_json?: Json
          partition_key?: string | null
          payload_json?: Json
          provenance_class?: string
          run_id?: string | null
          severity?: string | null
          snapshot_item_id?: string | null
          snapshot_version_id?: string | null
          state_hash?: string
          status?: string
          subject_id?: string | null
          summary?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_versions_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_versions_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_versions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_versions_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "verification_object_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_versions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "analysis_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      issues_current: {
        Row: {
          analysis_space_id: string
          created_at: string
          current_run_id: string | null
          current_snapshot_item_id: string | null
          current_version_id: string | null
          evidence_ref_ids: Json
          id: string
          issue_kind: string
          last_seen_run_id: string | null
          lineage_json: Json
          logical_key: string
          partition_key: string | null
          payload_json: Json
          provenance_class: string
          severity: string | null
          state_hash: string
          status: string
          subject_id: string | null
          summary: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          created_at?: string
          current_run_id?: string | null
          current_snapshot_item_id?: string | null
          current_version_id?: string | null
          evidence_ref_ids?: Json
          id: string
          issue_kind: string
          last_seen_run_id?: string | null
          lineage_json?: Json
          logical_key: string
          partition_key?: string | null
          payload_json?: Json
          provenance_class: string
          severity?: string | null
          state_hash?: string
          status?: string
          subject_id?: string | null
          summary?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          created_at?: string
          current_run_id?: string | null
          current_snapshot_item_id?: string | null
          current_version_id?: string | null
          evidence_ref_ids?: Json
          id?: string
          issue_kind?: string
          last_seen_run_id?: string | null
          lineage_json?: Json
          logical_key?: string
          partition_key?: string | null
          payload_json?: Json
          provenance_class?: string
          severity?: string | null
          state_hash?: string
          status?: string
          subject_id?: string | null
          summary?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_current_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_current_current_run_id_fkey"
            columns: ["current_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_current_last_seen_run_id_fkey"
            columns: ["last_seen_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_current_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "analysis_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "issue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_current_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
        ]
      }
      measure_versions: {
        Row: {
          analysis_space_id: string
          comparison_json: Json
          created_at: string
          display_value: string | null
          evidence_ref_ids: Json
          id: string
          lineage_json: Json
          measure_id: string
          numeric_value: number | null
          partition_key: string | null
          period_key: string | null
          provenance_class: string
          run_id: string | null
          snapshot_item_id: string | null
          snapshot_version_id: string | null
          state_hash: string
          status: string
          subject_id: string | null
          unit_kind: string | null
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          comparison_json?: Json
          created_at?: string
          display_value?: string | null
          evidence_ref_ids?: Json
          id: string
          lineage_json?: Json
          measure_id: string
          numeric_value?: number | null
          partition_key?: string | null
          period_key?: string | null
          provenance_class: string
          run_id?: string | null
          snapshot_item_id?: string | null
          snapshot_version_id?: string | null
          state_hash?: string
          status?: string
          subject_id?: string | null
          unit_kind?: string | null
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          comparison_json?: Json
          created_at?: string
          display_value?: string | null
          evidence_ref_ids?: Json
          id?: string
          lineage_json?: Json
          measure_id?: string
          numeric_value?: number | null
          partition_key?: string | null
          period_key?: string | null
          provenance_class?: string
          run_id?: string | null
          snapshot_item_id?: string | null
          snapshot_version_id?: string | null
          state_hash?: string
          status?: string
          subject_id?: string | null
          unit_kind?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "measure_versions_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measure_versions_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "measures_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measure_versions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measure_versions_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "verification_object_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measure_versions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "analysis_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measure_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      measures_current: {
        Row: {
          analysis_space_id: string
          comparison_json: Json
          created_at: string
          current_run_id: string | null
          current_snapshot_item_id: string | null
          current_version_id: string | null
          display_value: string | null
          evidence_ref_ids: Json
          id: string
          last_seen_run_id: string | null
          lineage_json: Json
          logical_key: string
          measure_key: string
          measure_type: string
          numeric_value: number | null
          partition_key: string | null
          period_key: string | null
          provenance_class: string
          state_hash: string
          status: string
          subject_id: string | null
          unit_kind: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          comparison_json?: Json
          created_at?: string
          current_run_id?: string | null
          current_snapshot_item_id?: string | null
          current_version_id?: string | null
          display_value?: string | null
          evidence_ref_ids?: Json
          id: string
          last_seen_run_id?: string | null
          lineage_json?: Json
          logical_key: string
          measure_key: string
          measure_type: string
          numeric_value?: number | null
          partition_key?: string | null
          period_key?: string | null
          provenance_class: string
          state_hash?: string
          status?: string
          subject_id?: string | null
          unit_kind?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          comparison_json?: Json
          created_at?: string
          current_run_id?: string | null
          current_snapshot_item_id?: string | null
          current_version_id?: string | null
          display_value?: string | null
          evidence_ref_ids?: Json
          id?: string
          last_seen_run_id?: string | null
          lineage_json?: Json
          logical_key?: string
          measure_key?: string
          measure_type?: string
          numeric_value?: number | null
          partition_key?: string | null
          period_key?: string | null
          provenance_class?: string
          state_hash?: string
          status?: string
          subject_id?: string | null
          unit_kind?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "measures_current_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measures_current_current_run_id_fkey"
            columns: ["current_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measures_current_last_seen_run_id_fkey"
            columns: ["last_seen_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measures_current_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "analysis_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measures_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "measure_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measures_current_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
      org_data_locality_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          job_payload: Json
          org_id: string
          progress: number
          region_code: string
          requested_by: string
          result: Json
          started_at: string | null
          status: string
          step: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_payload?: Json
          org_id: string
          progress?: number
          region_code: string
          requested_by: string
          result?: Json
          started_at?: string | null
          status: string
          step: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_payload?: Json
          org_id?: string
          progress?: number
          region_code?: string
          requested_by?: string
          result?: Json
          started_at?: string | null
          status?: string
          step?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_data_locality_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_data_locality_runs_region_code_fkey"
            columns: ["region_code"]
            isOneToOne: false
            referencedRelation: "data_locality_regions"
            referencedColumns: ["region_code"]
          },
          {
            foreignKeyName: "org_data_locality_runs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string
          org_id: string
          revoked_at: string | null
          revoked_by: string | null
          role: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          email: string
          expires_at: string
          id?: string
          invited_at?: string
          invited_by: string
          org_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string
          org_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invites_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          data_locality_documents_bucket_uri: string | null
          data_locality_enabled: boolean
          data_locality_exports_bucket_uri: string | null
          data_locality_kms_key_resource: string | null
          data_locality_region: string | null
          id: string
          is_active: boolean
          multi_user_enabled: boolean
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
          data_locality_documents_bucket_uri?: string | null
          data_locality_enabled?: boolean
          data_locality_exports_bucket_uri?: string | null
          data_locality_kms_key_resource?: string | null
          data_locality_region?: string | null
          id?: string
          is_active?: boolean
          multi_user_enabled?: boolean
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
          data_locality_documents_bucket_uri?: string | null
          data_locality_enabled?: boolean
          data_locality_exports_bucket_uri?: string | null
          data_locality_kms_key_resource?: string | null
          data_locality_region?: string | null
          id?: string
          is_active?: boolean
          multi_user_enabled?: boolean
          name?: string
          owner_id?: string
          plan_tier?: string
          slug?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_data_locality_region_fkey"
            columns: ["data_locality_region"]
            isOneToOne: false
            referencedRelation: "data_locality_regions"
            referencedColumns: ["region_code"]
          },
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pack_members: {
        Row: {
          added_by: string | null
          created_at: string
          document_id: string
          id: string
          pack_id: string
          role: string
          sort_order: number
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          document_id: string
          id?: string
          pack_id: string
          role?: string
          sort_order?: number
        }
        Update: {
          added_by?: string | null
          created_at?: string
          document_id?: string
          id?: string
          pack_id?: string
          role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pack_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pack_members_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pack_members_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["id"]
          },
        ]
      }
      packs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string | null
          legacy_context_set_id: string | null
          legacy_document_bundle_id: string | null
          name: string | null
          pack_type: string
          precedence_policy: string | null
          primary_document_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string | null
          legacy_context_set_id?: string | null
          legacy_document_bundle_id?: string | null
          name?: string | null
          pack_type: string
          precedence_policy?: string | null
          primary_document_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string | null
          legacy_context_set_id?: string | null
          legacy_document_bundle_id?: string | null
          name?: string | null
          pack_type?: string
          precedence_policy?: string | null
          primary_document_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packs_primary_document_id_fkey"
            columns: ["primary_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      panel_current: {
        Row: {
          analysis_space_id: string
          comparison_target_json: Json
          created_at: string
          id: string
          last_built_run_id: string | null
          panel_key: string
          partition_key: string | null
          payload_json: Json
          route_id: string
          staleness_status: string
          state_hash: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          comparison_target_json?: Json
          created_at?: string
          id: string
          last_built_run_id?: string | null
          panel_key: string
          partition_key?: string | null
          payload_json?: Json
          route_id: string
          staleness_status?: string
          state_hash?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          comparison_target_json?: Json
          created_at?: string
          id?: string
          last_built_run_id?: string | null
          panel_key?: string
          partition_key?: string | null
          payload_json?: Json
          route_id?: string
          staleness_status?: string
          state_hash?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "panel_current_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_current_last_built_run_id_fkey"
            columns: ["last_built_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_current_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
        ]
      }
      pipeline_artifacts: {
        Row: {
          artifact_state: string
          artifact_type: string
          content_encoding: string | null
          content_json: Json | null
          content_text: string | null
          created_at: string
          expires_at: string | null
          id: string
          metadata_json: Json
          node_id: string | null
          run_id: string
          sha256: string
          size_bytes: number
          storage_bucket: string | null
          storage_path: string | null
          workspace_id: string
        }
        Insert: {
          artifact_state?: string
          artifact_type?: string
          content_encoding?: string | null
          content_json?: Json | null
          content_text?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata_json?: Json
          node_id?: string | null
          run_id: string
          sha256: string
          size_bytes: number
          storage_bucket?: string | null
          storage_path?: string | null
          workspace_id: string
        }
        Update: {
          artifact_state?: string
          artifact_type?: string
          content_encoding?: string | null
          content_json?: Json | null
          content_text?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata_json?: Json
          node_id?: string | null
          run_id?: string
          sha256?: string
          size_bytes?: number
          storage_bucket?: string | null
          storage_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_connection_secrets: {
        Row: {
          alg: string
          connection_id: string
          created_at: string
          key_id: string
          secret_ciphertext: string
          secret_version: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alg?: string
          connection_id: string
          created_at?: string
          key_id?: string
          secret_ciphertext: string
          secret_version?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alg?: string
          connection_id?: string
          created_at?: string
          key_id?: string
          secret_ciphertext?: string
          secret_version?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "pipeline_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_connection_secrets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_connections: {
        Row: {
          auth_mode: string
          connection_type: string
          created_at: string
          created_by: string | null
          endpoint_url: string | null
          headers_json: Json
          id: string
          is_active: boolean
          last_test_error_code: string | null
          last_test_status: string | null
          last_tested_at: string | null
          metadata_json: Json
          name: string
          secret_ref: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auth_mode?: string
          connection_type: string
          created_at?: string
          created_by?: string | null
          endpoint_url?: string | null
          headers_json?: Json
          id?: string
          is_active?: boolean
          last_test_error_code?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          metadata_json?: Json
          name: string
          secret_ref?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auth_mode?: string
          connection_type?: string
          created_at?: string
          created_by?: string | null
          endpoint_url?: string | null
          headers_json?: Json
          id?: string
          is_active?: boolean
          last_test_error_code?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          metadata_json?: Json
          name?: string
          secret_ref?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_drafts: {
        Row: {
          created_at: string
          id: string
          pipeline_id: string
          spec_json: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          pipeline_id: string
          spec_json: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          pipeline_id?: string
          spec_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_drafts_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: true
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_outbox_messages: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          dedupe_key: string
          delivery_metadata_json: Json
          endpoint_ref: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          node_id: string
          payload_json: Json
          run_id: string
          status: string
          target_hash: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          channel: string
          created_at?: string
          dedupe_key: string
          delivery_metadata_json?: Json
          endpoint_ref: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          node_id: string
          payload_json?: Json
          run_id: string
          status?: string
          target_hash?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          dedupe_key?: string
          delivery_metadata_json?: Json
          endpoint_ref?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          node_id?: string
          payload_json?: Json
          run_id?: string
          status?: string
          target_hash?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_outbox_messages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_outbox_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_run_events: {
        Row: {
          created_at: string
          event_status: string | null
          event_type: string
          id: number
          node_id: string | null
          payload_preview_json: Json
          payload_ref_json: Json
          redaction_level: string
          run_id: string
        }
        Insert: {
          created_at?: string
          event_status?: string | null
          event_type: string
          id?: number
          node_id?: string | null
          payload_preview_json?: Json
          payload_ref_json?: Json
          redaction_level?: string
          run_id: string
        }
        Update: {
          created_at?: string
          event_status?: string | null
          event_type?: string
          id?: number
          node_id?: string | null
          payload_preview_json?: Json
          payload_ref_json?: Json
          redaction_level?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_run_nodes: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          id: string
          input_json: Json
          last_error_code: string | null
          last_error_message: string | null
          lease_token: string | null
          lease_worker_id: string | null
          leased_until: string | null
          max_attempts: number
          next_retry_at: string | null
          node_id: string
          node_kind: string
          output_json: Json
          output_preview_json: Json
          run_id: string
          started_at: string | null
          status: string
          topo_order: number
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          input_json?: Json
          last_error_code?: string | null
          last_error_message?: string | null
          lease_token?: string | null
          lease_worker_id?: string | null
          leased_until?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          node_id: string
          node_kind: string
          output_json?: Json
          output_preview_json?: Json
          run_id: string
          started_at?: string | null
          status?: string
          topo_order?: number
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          input_json?: Json
          last_error_code?: string | null
          last_error_message?: string | null
          lease_token?: string | null
          lease_worker_id?: string | null
          leased_until?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          node_id?: string
          node_kind?: string
          output_json?: Json
          output_preview_json?: Json
          run_id?: string
          started_at?: string | null
          status?: string
          topo_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_run_nodes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_runs: {
        Row: {
          action_id: string | null
          completed_at: string | null
          context_json: Json
          created_at: string
          data_plane_json: Json
          id: string
          input_json: Json
          output_summary_json: Json
          pipeline_id: string
          pipeline_version_id: string
          started_at: string | null
          status: string
          status_reason: string | null
          trigger_kind: string
          triggered_by: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_id?: string | null
          completed_at?: string | null
          context_json?: Json
          created_at?: string
          data_plane_json?: Json
          id?: string
          input_json?: Json
          output_summary_json?: Json
          pipeline_id: string
          pipeline_version_id: string
          started_at?: string | null
          status?: string
          status_reason?: string | null
          trigger_kind?: string
          triggered_by?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action_id?: string | null
          completed_at?: string | null
          context_json?: Json
          created_at?: string
          data_plane_json?: Json
          id?: string
          input_json?: Json
          output_summary_json?: Json
          pipeline_id?: string
          pipeline_version_id?: string
          started_at?: string | null
          status?: string
          status_reason?: string | null
          trigger_kind?: string
          triggered_by?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_pipeline_version_id_fkey"
            columns: ["pipeline_version_id"]
            isOneToOne: false
            referencedRelation: "pipeline_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_versions: {
        Row: {
          changelog: string | null
          compile_warnings: Json
          compiled_dag_json: Json
          created_at: string
          created_by: string | null
          id: string
          pipeline_id: string
          published_at: string | null
          published_by: string | null
          spec_hash: string
          spec_json: Json
          version_number: number
        }
        Insert: {
          changelog?: string | null
          compile_warnings?: Json
          compiled_dag_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          pipeline_id: string
          published_at?: string | null
          published_by?: string | null
          spec_hash: string
          spec_json: Json
          version_number: number
        }
        Update: {
          changelog?: string | null
          compile_warnings?: Json
          compiled_dag_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          pipeline_id?: string
          published_at?: string | null
          published_by?: string | null
          spec_hash?: string
          spec_json?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_versions_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          created_by: string | null
          current_version_id: string | null
          id: string
          is_system_preset: boolean
          kind: string
          name: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          is_system_preset?: boolean
          kind?: string
          name: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          is_system_preset?: boolean
          kind?: string
          name?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pipelines_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "pipeline_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_drafts: {
        Row: {
          created_at: string
          id: string
          playbook_id: string
          spec_json: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          playbook_id: string
          spec_json: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          playbook_id?: string
          spec_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playbook_drafts_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: true
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_versions: {
        Row: {
          changelog: string | null
          created_at: string
          created_by: string | null
          id: string
          playbook_id: string
          published_at: string | null
          published_by: string | null
          spec_json: Json
          version_number: number
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          playbook_id: string
          published_at?: string | null
          published_by?: string | null
          spec_json: Json
          version_number: number
        }
        Update: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          playbook_id?: string
          published_at?: string | null
          published_by?: string | null
          spec_json?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "playbook_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_versions_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      playbooks: {
        Row: {
          created_at: string
          created_by: string | null
          current_version_id: string | null
          id: string
          is_system_preset: boolean
          kind: string
          name: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          is_system_preset?: boolean
          kind?: string
          name: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          is_system_preset?: boolean
          kind?: string
          name?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_playbooks_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "playbook_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbooks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          guest_claimed_at: string | null
          guest_link_version: number
          id: string
          institution: string | null
          is_guest: boolean
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
          subscription_trial_consumed_at: string | null
          subscription_trial_started_at: string | null
          timezone: string | null
          total_explanations_lifetime: number
          total_xp: number
          updated_at: string
          user_type: string
          whatsapp_phone_number: string | null
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
          guest_claimed_at?: string | null
          guest_link_version?: number
          id: string
          institution?: string | null
          is_guest?: boolean
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
          subscription_trial_consumed_at?: string | null
          subscription_trial_started_at?: string | null
          timezone?: string | null
          total_explanations_lifetime?: number
          total_xp?: number
          updated_at?: string
          user_type?: string
          whatsapp_phone_number?: string | null
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
          guest_claimed_at?: string | null
          guest_link_version?: number
          id?: string
          institution?: string | null
          is_guest?: boolean
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
          subscription_trial_consumed_at?: string | null
          subscription_trial_started_at?: string | null
          timezone?: string | null
          total_explanations_lifetime?: number
          total_xp?: number
          updated_at?: string
          user_type?: string
          whatsapp_phone_number?: string | null
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
      review_overrides: {
        Row: {
          analysis_space_id: string
          applies_from_run_id: string | null
          applies_until_run_id: string | null
          created_at: string
          created_by: string | null
          id: string
          override_kind: string
          status: string
          target_kind: string
          target_logical_key: string
          value_json: Json
          workspace_id: string
        }
        Insert: {
          analysis_space_id: string
          applies_from_run_id?: string | null
          applies_until_run_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          override_kind: string
          status?: string
          target_kind: string
          target_logical_key: string
          value_json?: Json
          workspace_id: string
        }
        Update: {
          analysis_space_id?: string
          applies_from_run_id?: string | null
          applies_until_run_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          override_kind?: string
          status?: string
          target_kind?: string
          target_logical_key?: string
          value_json?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_overrides_analysis_space_id_fkey"
            columns: ["analysis_space_id"]
            isOneToOne: false
            referencedRelation: "analysis_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_overrides_applies_from_run_id_fkey"
            columns: ["applies_from_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_overrides_applies_until_run_id_fkey"
            columns: ["applies_until_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_overrides_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          gateway_event_id: string | null
          id: string
          is_renewal: boolean | null
          metadata: Json | null
          moyasar_invoice_id: string | null
          moyasar_payment_id: string | null
          payment_method_id: string | null
          retry_at: string | null
          status: string
          subscription_period: string
          subscription_tier: string
          updated_at: string | null
          user_id: string
          verification_source: string | null
          verified_at: string | null
        }
        Insert: {
          amount_cents: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          currency?: string
          failure_count?: number | null
          failure_reason?: string | null
          gateway_event_id?: string | null
          id?: string
          is_renewal?: boolean | null
          metadata?: Json | null
          moyasar_invoice_id?: string | null
          moyasar_payment_id?: string | null
          payment_method_id?: string | null
          retry_at?: string | null
          status?: string
          subscription_period: string
          subscription_tier: string
          updated_at?: string | null
          user_id: string
          verification_source?: string | null
          verified_at?: string | null
        }
        Update: {
          amount_cents?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          currency?: string
          failure_count?: number | null
          failure_reason?: string | null
          gateway_event_id?: string | null
          id?: string
          is_renewal?: boolean | null
          metadata?: Json | null
          moyasar_invoice_id?: string | null
          moyasar_payment_id?: string | null
          payment_method_id?: string | null
          retry_at?: string | null
          status?: string
          subscription_period?: string
          subscription_tier?: string
          updated_at?: string | null
          user_id?: string
          verification_source?: string | null
          verified_at?: string | null
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
          billing_model_version: string
          created_at: string
          description: string | null
          display_features: Json
          display_order: number
          features: Json
          guardrails: Json
          highlight_color: string | null
          id: string
          is_active: boolean
          is_default: boolean
          limits: Json
          meter_limits: Json
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
          billing_model_version?: string
          created_at?: string
          description?: string | null
          display_features?: Json
          display_order?: number
          features?: Json
          guardrails?: Json
          highlight_color?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          limits?: Json
          meter_limits?: Json
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
          billing_model_version?: string
          created_at?: string
          description?: string | null
          display_features?: Json
          display_order?: number
          features?: Json
          guardrails?: Json
          highlight_color?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          limits?: Json
          meter_limits?: Json
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
      support_tickets: {
        Row: {
          category: string
          created_at: string
          email: string | null
          id: string
          message: string
          metadata: Json | null
          priority: string
          resolved_at: string | null
          source: string
          status: string
          subject: string
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          message: string
          metadata?: Json | null
          priority?: string
          resolved_at?: string | null
          source?: string
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          priority?: string
          resolved_at?: string | null
          source?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      user_push_tokens: {
        Row: {
          created_at: string | null
          environment: string
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          environment?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          environment?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
          analysis_run_id: string | null
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
          analysis_run_id?: string | null
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
          analysis_run_id?: string | null
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
            foreignKeyName: "verification_object_versions_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
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
          document_id: string | null
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
          document_id?: string | null
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
          document_id?: string | null
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
      whatsapp_sessions: {
        Row: {
          active_document_id: string | null
          created_at: string
          last_inbound_message_id: string | null
          phone_number: string
          state_json: Json
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          active_document_id?: string | null
          created_at?: string
          last_inbound_message_id?: string | null
          phone_number: string
          state_json?: Json
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          active_document_id?: string | null
          created_at?: string
          last_inbound_message_id?: string | null
          phone_number?: string
          state_json?: Json
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sessions_active_document_id_fkey"
            columns: ["active_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sessions_workspace_id_fkey"
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
      workspace_agent_states: {
        Row: {
          conversation_id: string
          created_at: string
          opened_document_id: string | null
          pending_kind: string | null
          state_json: Json
          status: string
          ui_surface: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          opened_document_id?: string | null
          pending_kind?: string | null
          state_json?: Json
          status?: string
          ui_surface?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          opened_document_id?: string | null
          pending_kind?: string | null
          state_json?: Json
          status?: string
          ui_surface?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_agent_states_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_agent_states_opened_document_id_fkey"
            columns: ["opened_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_agent_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_agent_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_api_connection_secrets: {
        Row: {
          alg: string
          connection_id: string
          created_at: string
          id: string
          key_id: string
          secret_ciphertext: string
          updated_at: string
        }
        Insert: {
          alg?: string
          connection_id: string
          created_at?: string
          id?: string
          key_id: string
          secret_ciphertext: string
          updated_at?: string
        }
        Update: {
          alg?: string
          connection_id?: string
          created_at?: string
          id?: string
          key_id?: string
          secret_ciphertext?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_api_connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "workspace_api_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_api_connections: {
        Row: {
          auth_config_json: Json
          auth_mode: string
          body_template: Json | null
          consecutive_failure_count: number
          created_at: string
          created_by: string | null
          description: string | null
          endpoint_url: string
          headers_template: Json
          http_method: string
          id: string
          last_error: string | null
          last_fetched_at: string | null
          last_successful_fetch_at: string | null
          mapping_generated_at: string | null
          mapping_generated_from_prompt: string | null
          mapping_status: string
          mapping_summary_json: Json
          mcp_config_json: Json
          name: string
          normalization_config_json: Json
          query_params: Json
          refresh_policy: string
          response_schema_hint: string | null
          source_kind: string
          source_mode: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          auth_config_json?: Json
          auth_mode?: string
          body_template?: Json | null
          consecutive_failure_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          endpoint_url: string
          headers_template?: Json
          http_method?: string
          id?: string
          last_error?: string | null
          last_fetched_at?: string | null
          last_successful_fetch_at?: string | null
          mapping_generated_at?: string | null
          mapping_generated_from_prompt?: string | null
          mapping_status?: string
          mapping_summary_json?: Json
          mcp_config_json?: Json
          name: string
          normalization_config_json?: Json
          query_params?: Json
          refresh_policy?: string
          response_schema_hint?: string | null
          source_kind?: string
          source_mode?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          auth_config_json?: Json
          auth_mode?: string
          body_template?: Json | null
          consecutive_failure_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          endpoint_url?: string
          headers_template?: Json
          http_method?: string
          id?: string
          last_error?: string | null
          last_fetched_at?: string | null
          last_successful_fetch_at?: string | null
          mapping_generated_at?: string | null
          mapping_generated_from_prompt?: string | null
          mapping_status?: string
          mapping_summary_json?: Json
          mcp_config_json?: Json
          name?: string
          normalization_config_json?: Json
          query_params?: Json
          refresh_policy?: string
          response_schema_hint?: string | null
          source_kind?: string
          source_mode?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_api_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_api_source_attachments: {
        Row: {
          api_connection_id: string
          created_at: string
          created_by: string | null
          enabled_by_default: boolean
          id: string
          sort_index: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          api_connection_id: string
          created_at?: string
          created_by?: string | null
          enabled_by_default?: boolean
          id?: string
          sort_index?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          api_connection_id?: string
          created_at?: string
          created_by?: string | null
          enabled_by_default?: boolean
          id?: string
          sort_index?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_api_source_attachments_api_connection_id_fkey"
            columns: ["api_connection_id"]
            isOneToOne: false
            referencedRelation: "workspace_api_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_api_source_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_automation_events: {
        Row: {
          automation_id: string | null
          created_at: string
          dedupe_key: string
          error_message: string | null
          event_kind: string
          id: string
          local_day_bucket: string | null
          payload: Json
          processed_at: string | null
          requested_by_user_id: string | null
          source_document_id: string | null
          source_fingerprint: string | null
          status: string
          trigger_kind: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          automation_id?: string | null
          created_at?: string
          dedupe_key: string
          error_message?: string | null
          event_kind: string
          id?: string
          local_day_bucket?: string | null
          payload?: Json
          processed_at?: string | null
          requested_by_user_id?: string | null
          source_document_id?: string | null
          source_fingerprint?: string | null
          status?: string
          trigger_kind: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          automation_id?: string | null
          created_at?: string
          dedupe_key?: string
          error_message?: string | null
          event_kind?: string
          id?: string
          local_day_bucket?: string | null
          payload?: Json
          processed_at?: string | null
          requested_by_user_id?: string | null
          source_document_id?: string | null
          source_fingerprint?: string | null
          status?: string
          trigger_kind?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_automation_events_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "workspace_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_automation_events_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_automation_events_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_automation_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_automation_runs: {
        Row: {
          action_id: string | null
          activity_json: Json
          automation_id: string
          completed_at: string | null
          corpus_id: string | null
          created_at: string
          dedupe_key: string
          error_message: string | null
          event_id: string | null
          execution_plane: string | null
          id: string
          local_day_bucket: string | null
          metadata: Json
          parent_run_id: string | null
          previous_source_fingerprint: string | null
          skip_reason: string | null
          source_document_id: string | null
          source_fingerprint: string | null
          started_at: string | null
          status: string
          status_reason: string | null
          target_document_id: string | null
          template_id: string | null
          trigger_kind: string
          triggered_by_user_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_id?: string | null
          activity_json?: Json
          automation_id: string
          completed_at?: string | null
          corpus_id?: string | null
          created_at?: string
          dedupe_key: string
          error_message?: string | null
          event_id?: string | null
          execution_plane?: string | null
          id?: string
          local_day_bucket?: string | null
          metadata?: Json
          parent_run_id?: string | null
          previous_source_fingerprint?: string | null
          skip_reason?: string | null
          source_document_id?: string | null
          source_fingerprint?: string | null
          started_at?: string | null
          status?: string
          status_reason?: string | null
          target_document_id?: string | null
          template_id?: string | null
          trigger_kind: string
          triggered_by_user_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action_id?: string | null
          activity_json?: Json
          automation_id?: string
          completed_at?: string | null
          corpus_id?: string | null
          created_at?: string
          dedupe_key?: string
          error_message?: string | null
          event_id?: string | null
          execution_plane?: string | null
          id?: string
          local_day_bucket?: string | null
          metadata?: Json
          parent_run_id?: string | null
          previous_source_fingerprint?: string | null
          skip_reason?: string | null
          source_document_id?: string | null
          source_fingerprint?: string | null
          started_at?: string | null
          status?: string
          status_reason?: string | null
          target_document_id?: string | null
          template_id?: string | null
          trigger_kind?: string
          triggered_by_user_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_automation_runs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "workspace_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_automation_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "workspace_automation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_automation_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "extraction_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_automation_runs_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_automation_runs_target_document_id_fkey"
            columns: ["target_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_automation_runs_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_automation_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_automations: {
        Row: {
          auto_refresh_private_live: boolean
          created_at: string
          daily_schedule_enabled: boolean
          daily_schedule_local_time: string
          description: string | null
          enabled: boolean
          id: string
          last_seeded_from_legacy_policy_at: string | null
          last_source_fingerprint: string | null
          last_started_at: string | null
          last_succeeded_at: string | null
          manual_run_enabled: boolean
          name: string
          next_scheduled_run_at: string | null
          preset_key: string
          private_live_enabled: boolean
          raw_upload_scaffold_enabled: boolean
          require_review: boolean
          template_id: string | null
          template_strategy: string
          timezone: string
          trigger_document_ingestion_completed: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_refresh_private_live?: boolean
          created_at?: string
          daily_schedule_enabled?: boolean
          daily_schedule_local_time?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_seeded_from_legacy_policy_at?: string | null
          last_source_fingerprint?: string | null
          last_started_at?: string | null
          last_succeeded_at?: string | null
          manual_run_enabled?: boolean
          name: string
          next_scheduled_run_at?: string | null
          preset_key: string
          private_live_enabled?: boolean
          raw_upload_scaffold_enabled?: boolean
          require_review?: boolean
          template_id?: string | null
          template_strategy?: string
          timezone?: string
          trigger_document_ingestion_completed?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_refresh_private_live?: boolean
          created_at?: string
          daily_schedule_enabled?: boolean
          daily_schedule_local_time?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_seeded_from_legacy_policy_at?: string | null
          last_source_fingerprint?: string | null
          last_started_at?: string | null
          last_succeeded_at?: string | null
          manual_run_enabled?: boolean
          name?: string
          next_scheduled_run_at?: string | null
          preset_key?: string
          private_live_enabled?: boolean
          raw_upload_scaffold_enabled?: boolean
          require_review?: boolean
          template_id?: string | null
          template_strategy?: string
          timezone?: string
          trigger_document_ingestion_completed?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_automations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_corpora: {
        Row: {
          corpus_id: string
          corpus_kind: string
          created_at: string
          created_by: string | null
          filter_json: Json
          is_default: boolean
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          corpus_id: string
          corpus_kind?: string
          created_at?: string
          created_by?: string | null
          filter_json?: Json
          is_default?: boolean
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          corpus_id?: string
          corpus_kind?: string
          created_at?: string
          created_by?: string | null
          filter_json?: Json
          is_default?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_corpora_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_corpora_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_data_locality_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          job_payload: Json
          progress: number
          region_code: string
          requested_by: string
          result: Json
          started_at: string | null
          status: string
          step: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_payload?: Json
          progress?: number
          region_code: string
          requested_by: string
          result?: Json
          started_at?: string | null
          status: string
          step: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_payload?: Json
          progress?: number
          region_code?: string
          requested_by?: string
          result?: Json
          started_at?: string | null
          status?: string
          step?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_data_locality_runs_region_code_fkey"
            columns: ["region_code"]
            isOneToOne: false
            referencedRelation: "data_locality_regions"
            referencedColumns: ["region_code"]
          },
          {
            foreignKeyName: "workspace_data_locality_runs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_data_locality_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_data_planes: {
        Row: {
          config_json: Json
          created_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config_json: Json
          created_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_data_planes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_default_context_sets: {
        Row: {
          context_set_id: string
          created_at: string
          created_by: string | null
          id: string
          workspace_id: string
        }
        Insert: {
          context_set_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          workspace_id: string
        }
        Update: {
          context_set_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_default_context_sets_context_set_id_fkey"
            columns: ["context_set_id"]
            isOneToOne: false
            referencedRelation: "context_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_default_context_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_default_context_sets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_experience_automation_policies: {
        Row: {
          auto_analyze_by_type: boolean
          auto_classify_on_upload: boolean
          auto_generate_private_experience: boolean
          auto_refresh_private_experience: boolean
          created_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_analyze_by_type?: boolean
          auto_classify_on_upload?: boolean
          auto_generate_private_experience?: boolean
          auto_refresh_private_experience?: boolean
          created_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_analyze_by_type?: boolean
          auto_classify_on_upload?: boolean
          auto_generate_private_experience?: boolean
          auto_refresh_private_experience?: boolean
          created_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_experience_automation_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
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
      workspace_pinned_packs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          pack_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          pack_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          pack_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_pinned_packs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_pinned_packs_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_pinned_packs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_saved_views: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          filter_json: Json
          id: string
          is_default: boolean
          name: string
          sort_index: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          filter_json?: Json
          id?: string
          is_default?: boolean
          name: string
          sort_index?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          filter_json?: Json
          id?: string
          is_default?: boolean
          name?: string
          sort_index?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_saved_views_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_saved_views_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_whatsapp_bindings: {
        Row: {
          binding_name: string | null
          created_at: string
          id: string
          is_default: boolean
          last_used_at: string | null
          phone_number: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          binding_name?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          last_used_at?: string | null
          phone_number: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          binding_name?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          last_used_at?: string | null
          phone_number?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_whatsapp_bindings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_whatsapp_bindings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          analysis_brief: string | null
          color: string | null
          created_at: string
          default_playbook_id: string | null
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          org_id: string | null
          owner_id: string
          parent_folder_id: string | null
          preparation_metadata: Json
          preparation_status: string | null
          primary_plugin_family: string | null
          sort_index: number | null
          status: string
          updated_at: string
          workspace_type: string
        }
        Insert: {
          analysis_brief?: string | null
          color?: string | null
          created_at?: string
          default_playbook_id?: string | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          org_id?: string | null
          owner_id: string
          parent_folder_id?: string | null
          preparation_metadata?: Json
          preparation_status?: string | null
          primary_plugin_family?: string | null
          sort_index?: number | null
          status?: string
          updated_at?: string
          workspace_type?: string
        }
        Update: {
          analysis_brief?: string | null
          color?: string | null
          created_at?: string
          default_playbook_id?: string | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          org_id?: string | null
          owner_id?: string
          parent_folder_id?: string | null
          preparation_metadata?: Json
          preparation_status?: string | null
          primary_plugin_family?: string | null
          sort_index?: number | null
          status?: string
          updated_at?: string
          workspace_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_default_playbook_id_fkey"
            columns: ["default_playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "workspaces_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      experience_publication_resolution_v1: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          active_revision_id: string | null
          asset_manifest_ref: string | null
          compatibility_report_ref: string | null
          compatibility_status: string | null
          compiler_version: string | null
          corpus_id: string | null
          default_visibility: string | null
          experience_id: string | null
          experience_lane: string | null
          expires_at: string | null
          host: string | null
          host_id: string | null
          host_mode: string | null
          host_status: string | null
          indexing_allowed: boolean | null
          is_primary: boolean | null
          last_canonical_version_id: string | null
          last_overlay_sync_at: string | null
          materialization_status: string | null
          org_restricted: boolean | null
          password_hash_ref: string | null
          password_protected: boolean | null
          previous_revision_id: string | null
          publication_lane: string | null
          publication_status: string | null
          published_at: string | null
          renderer_version: string | null
          revision_created_at: string | null
          scaffold_status: string | null
          state_manifest_ref: string | null
          state_schema_version: string | null
          template_id: string | null
          template_version: string | null
          truth_manifest_ref: string | null
          validated_at: string | null
          validation_report_ref: string | null
          validity_status: string | null
          visibility: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_active_revisions_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_active_revisions_active_revision_id_fkey"
            columns: ["active_revision_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_revisions"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "experience_active_revisions_previous_revision_id_fkey"
            columns: ["previous_revision_id"]
            isOneToOne: false
            referencedRelation: "experience_publication_revisions"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "experience_registry_last_canonical_version_id_fkey"
            columns: ["last_canonical_version_id"]
            isOneToOne: false
            referencedRelation: "verification_object_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_registry_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _temp_publish_system_playbook_version_prompt_only: {
        Args: { p_changelog: string; p_name: string; p_spec_json: Json }
        Returns: undefined
      }
      apply_subscription_payment_success: {
        Args: {
          p_card_brand?: string
          p_card_holder_name?: string
          p_card_last_four?: string
          p_expires_at?: string
          p_force_auto_renew?: boolean
          p_gateway_event_id?: string
          p_moyasar_invoice_id: string
          p_moyasar_payment_id: string
          p_paid_at?: string
          p_payment_amount_cents: number
          p_payment_currency: string
          p_payment_method_token?: string
          p_payment_record_id: string
          p_subscription_period: string
          p_subscription_tier: string
          p_user_id: string
          p_verification_source: string
        }
        Returns: Json
      }
      billing_period_end: { Args: { p_period_start: string }; Returns: string }
      billing_period_start: { Args: { p_at?: string }; Returns: string }
      calculate_section_status: {
        Args: {
          p_marked_understood: boolean
          p_min_explanations: number
          p_section_opened: boolean
        }
        Returns: string
      }
      can_access_workspace: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      can_manage_workspace_members: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      can_write_workspace: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      check_and_charge_billable_op: {
        Args: {
          p_metadata?: Json
          p_operation_key: string
          p_source?: string
          p_units?: number
          p_user_id: string
          p_workspace_id?: string
        }
        Returns: Json
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
      default_workspace_corpus_id: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      downgrade_to_free: { Args: { p_user_id: string }; Returns: undefined }
      ensure_billing_usage_monthly: {
        Args: { p_at?: string; p_user_id: string }
        Returns: {
          billable_ops_used: number
          breakdown: Json
          created_at: string
          metered_tokens_used: number
          period_end: string
          period_start: string
          raw_cached_input_tokens: number
          raw_embedding_tokens: number
          raw_input_tokens: number
          raw_output_tokens: number
          storage_bytes_snapshot: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "billing_usage_monthly"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_home_workspace:
        | { Args: { p_user_id: string }; Returns: string }
        | {
            Args: {
              p_org_name?: string
              p_user_id: string
              p_workspace_name?: string
            }
            Returns: string
          }
      ensure_workspace_default_corpus: {
        Args: { p_workspace_id: string }
        Returns: string
      }
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
      get_effective_limit_plan_tier: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_effective_subscription_tier_for_user: {
        Args: { p_user_id: string }
        Returns: string
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
      get_subscription_plan_for_tier: {
        Args: { p_tier: string }
        Returns: {
          badge_text: string | null
          billing_model_version: string
          created_at: string
          description: string | null
          display_features: Json
          display_order: number
          features: Json
          guardrails: Json
          highlight_color: string | null
          id: string
          is_active: boolean
          is_default: boolean
          limits: Json
          meter_limits: Json
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
        SetofOptions: {
          from: "*"
          to: "subscription_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      get_user_subscription_state: {
        Args: { p_user_id: string }
        Returns: Json
      }
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
      is_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      is_workspace_org_multi_user_enabled: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: { Args: { p_workspace_id: string }; Returns: boolean }
      list_accessible_workspaces: {
        Args: never
        Returns: {
          access_role: string
          access_source: string
          color: string
          created_at: string
          deleted_at: string
          description: string
          icon: string
          id: string
          name: string
          org_id: string
          owner_id: string
          parent_folder_id: string
          primary_plugin_family: string
          sort_index: number
          status: string
          updated_at: string
          workspace_type: string
        }[]
      }
      merge_subscription_state: {
        Args: {
          p_candidate_auto_renew?: boolean
          p_candidate_cancelled_at?: string
          p_candidate_expires_at: string
          p_candidate_grace_period_ends_at?: string
          p_candidate_period: string
          p_candidate_source: string
          p_candidate_status?: string
          p_candidate_tier: string
          p_latest_transaction_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      normalize_limit_plan_tier: {
        Args: { p_raw_tier: string }
        Returns: string
      }
      normalize_subscription_plan_tier: {
        Args: { p_raw_tier: string }
        Returns: string
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
      pipeline_claim_ready_nodes: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_worker_id?: string
        }
        Returns: {
          attempt_count: number
          completed_at: string
          created_at: string
          id: string
          input_json: Json
          last_error_code: string
          last_error_message: string
          lease_token: string
          lease_worker_id: string
          leased_until: string
          max_attempts: number
          next_retry_at: string
          node_id: string
          node_kind: string
          output_json: Json
          output_preview_json: Json
          run_id: string
          started_at: string
          status: string
          topo_order: number
          updated_at: string
        }[]
      }
      record_metered_tokens: {
        Args: {
          p_cached_input_tokens?: number
          p_embedding_tokens?: number
          p_input_tokens?: number
          p_metadata?: Json
          p_model_key: string
          p_output_tokens?: number
          p_source?: string
          p_user_id: string
          p_workspace_id?: string
        }
        Returns: Json
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
      subscription_entitlement_is_active: {
        Args: {
          p_expires_at?: string
          p_grace_period_ends_at?: string
          p_status?: string
          p_tier: string
        }
        Returns: boolean
      }
      subscription_tier_rank: { Args: { p_tier: string }; Returns: number }
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
      workspace_member_role: {
        Args: { p_workspace_id: string }
        Returns: string
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
