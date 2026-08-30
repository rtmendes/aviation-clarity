/**
 * Hand-maintained types for the schema in supabase/migrations/.
 *
 * These mirror the migration files. Once the CLI is pointed at the self-hosted
 * instance they can be replaced by `supabase gen types typescript`, but the
 * generator needs live credentials, so the checked-in version is authored by
 * hand and kept in step with the migrations by review.
 */

export type Sensitivity =
  | 'general'
  | 'technical'
  | 'regulatory'
  | 'safety'
  | 'medical';

export type TopicStatus =
  | 'queued'
  | 'researching'
  | 'verified'
  | 'generating'
  | 'qa'
  | 'approved'
  | 'published'
  | 'blocked';

export type AssetType =
  | 'lesson'
  | 'youtube'
  | 'podcast'
  | 'article'
  | 'short'
  | 'social'
  | 'carousel'
  | 'email'
  | 'lead_magnet'
  | 'quiz'
  | 'worksheet'
  | 'book_chapter';

export type SourceType =
  | 'faa'
  | 'regulation'
  | 'government'
  | 'manufacturer'
  | 'school'
  | 'academic'
  | 'industry'
  | 'other';

export type AgentRunStatus = 'queued' | 'running' | 'blocked' | 'complete' | 'failed';

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type TopicRow = {
  id: string;
  title: string;
  slug: string | null;
  audience: string | null;
  pillar: string | null;
  sensitivity: Sensitivity;
  priority: number;
  status: TopicStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SourceRow = {
  id: string;
  title: string;
  url: string;
  source_type: SourceType;
  authority_score: number;
  published_at: string | null;
  checked_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClaimRow = {
  id: string;
  topic_id: string | null;
  body: string;
  risk: 'low' | 'medium' | 'high';
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeUnitRow = {
  id: string;
  topic_id: string | null;
  summary: string;
  learning_model: Json;
  status: 'draft' | 'verified' | 'review' | 'approved';
  created_at: string;
  updated_at: string;
};

export type ContentAssetRow = {
  id: string;
  topic_id: string | null;
  asset_type: AssetType;
  title: string | null;
  body: string | null;
  status: TopicStatus;
  qa_findings: Json;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentRunRow = {
  id: string;
  agent_name: string;
  topic_id: string | null;
  status: AgentRunStatus;
  input: Json;
  output: Json | null;
  safety_flags: Json;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type ProductRow = {
  id: string;
  name: string;
  slug: string | null;
  audience: string | null;
  kind: 'template' | 'checklist' | 'assessment' | 'toolkit' | 'course' | 'membership' | 'service';
  description: string | null;
  price_cents: number | null;
  currency: string;
  status: 'idea' | 'validating' | 'building' | 'live' | 'retired';
  created_at: string;
  updated_at: string;
};

/**
 * Insert shapes.
 *
 * These are written out rather than derived with `Pick & Partial<Omit<...>>`:
 * an intersection of object types does not gain the implicit index signature
 * that supabase-js's `GenericTable` constraint requires, which silently
 * degrades every query on the schema to `never`.
 */

export type TopicInsert = {
  title: string;
  slug?: string | null;
  audience?: string | null;
  pillar?: string | null;
  sensitivity?: Sensitivity;
  priority?: number;
  status?: TopicStatus;
  created_by?: string | null;
};

export type SourceInsert = {
  title: string;
  url: string;
  source_type?: SourceType;
  authority_score?: number;
  published_at?: string | null;
  checked_at?: string;
  notes?: string | null;
};

export type ClaimInsert = {
  body: string;
  topic_id?: string | null;
  risk?: 'low' | 'medium' | 'high';
  verified?: boolean;
  verified_at?: string | null;
  verified_by?: string | null;
};

export type KnowledgeUnitInsert = {
  summary: string;
  topic_id?: string | null;
  learning_model?: Json;
  status?: KnowledgeUnitRow['status'];
};

export type ContentAssetInsert = {
  asset_type: AssetType;
  topic_id?: string | null;
  title?: string | null;
  body?: string | null;
  status?: TopicStatus;
  qa_findings?: Json;
  approved_by?: string | null;
  approved_at?: string | null;
  published_at?: string | null;
};

export type AgentRunInsert = {
  agent_name: string;
  topic_id?: string | null;
  status?: AgentRunStatus;
  input?: Json;
  output?: Json | null;
  safety_flags?: Json;
  error?: string | null;
  duration_ms?: number | null;
};

export type ProductInsert = {
  name: string;
  slug?: string | null;
  audience?: string | null;
  kind?: ProductRow['kind'];
  description?: string | null;
  price_cents?: number | null;
  currency?: string;
  status?: ProductRow['status'];
};

type Table<Row extends Record<string, unknown>, Insert extends Record<string, unknown>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      topics: Table<TopicRow, TopicInsert>;
      sources: Table<SourceRow, SourceInsert>;
      claims: Table<ClaimRow, ClaimInsert>;
      knowledge_units: Table<KnowledgeUnitRow, KnowledgeUnitInsert>;
      content_assets: Table<ContentAssetRow, ContentAssetInsert>;
      agent_runs: Table<AgentRunRow, AgentRunInsert>;
      products: Table<ProductRow, ProductInsert>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
}
