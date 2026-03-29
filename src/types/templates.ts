export type TemplateLibraryGroup =
  | 'zohal_templates'
  | 'specializations'
  | 'custom';

export type TemplateFilter = 'all' | TemplateLibraryGroup;

export type TemplateScope = 'single' | 'bundle' | 'either';

export type TemplateBundleSchemaRole = {
  role: string;
  required: boolean;
  multiple: boolean;
};

export type TemplateBundleSchema = {
  roles?: TemplateBundleSchemaRole[];
  allowed_document_types?: string[];
};

export type TemplateOptions = {
  strictness?: 'default' | 'strict';
  enable_verifier?: boolean;
  language?: 'en' | 'ar';
};

export type TemplateVariable = {
  key: string;
  type: string;
  required?: boolean;
  source_scope?: string;
  source_scopes?: string[];
  constraints?: { min?: number; max?: number; allowed_values?: string[] };
};

export type TemplateCheck =
  | { id: string; type: 'required'; variable_key: string; severity: 'blocker' | 'warning' }
  | {
      id: string;
      type: 'range';
      variable_key: string;
      severity: 'blocker' | 'warning';
      min?: number;
      max?: number;
    }
  | {
      id: string;
      type: 'enum';
      variable_key: string;
      severity: 'blocker' | 'warning';
      allowed_values: string[];
    };

export type TemplateModuleV2 = {
  id: string;
  title: string;
  prompt: string;
  json_schema: Record<string, unknown>;
  enabled?: boolean;
  show_in_report?: boolean;
};

export type TemplateRecordType = {
  id: string;
  title: string;
  json_schema?: Record<string, unknown>;
  show_in_report?: boolean;
  source_scope?: string;
  source_scopes?: string[];
};

export type TemplateRule = Record<string, unknown>;

export type TemplateSource = {
  version: string;
  text: string;
  compiler_version?: string;
  generated_from?: string;
  updated_at?: string;
};

export type TemplateSpecV1 = {
  template_id?: string;
  template_source?: TemplateSource;
  meta: { name: string; kind: string } & Record<string, unknown>;
  options?: TemplateOptions;
  scope?: TemplateScope;
  bundle_schema?: TemplateBundleSchema;
  modules?: string[];
  outputs?: string[];
  modules_v2?: TemplateModuleV2[];
  custom_modules?: TemplateModuleV2[];
  variables: TemplateVariable[];
  record_types?: TemplateRecordType[];
  rules?: TemplateRule[];
  checks?: TemplateCheck[];
} & Record<string, unknown>;

export type TemplateCurrentVersion = {
  id: string;
  version_number: number;
  spec_json?: TemplateSpecV1 | Record<string, unknown> | null;
  published_at?: string | null;
};

export type TemplateRecord = {
  id: string;
  name: string;
  kind?: string;
  status?: 'draft' | 'published' | 'deprecated';
  is_system_preset?: boolean;
  workspace_id?: string | null;
  current_version_id?: string | null;
  current_version?: TemplateCurrentVersion | null;
};

export type TemplateLibraryPlaybookLike = {
  name: string;
  is_system_preset?: boolean;
  current_version?: { spec_json?: TemplateSpecV1 | Record<string, unknown> | null } | null;
};

export type PlaybookRecord = TemplateRecord;
export type PlaybookScope = TemplateScope;
export type BundleSchemaRole = TemplateBundleSchemaRole;
