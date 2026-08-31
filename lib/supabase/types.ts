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

/** Credentials whose holder can sign off on aviation content. */
export type Credential =
  | 'CFI' | 'CFII' | 'MEI' | 'ATP' | 'DPE' | 'AME' | 'A&P' | 'IA' | 'editorial';

export type ReviewAction = 'verified' | 'rejected' | 'approved' | 'reopened';
export type ReviewEntity = 'claim' | 'knowledge_unit' | 'content_asset';

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
  knowledge_unit_id: string | null;
  body: string;
  risk: 'low' | 'medium' | 'high';
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  reviewer_id: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewerRow = {
  id: string;
  name: string;
  email: string | null;
  credential: Credential;
  credential_ref: string | null;
  profile_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ReviewEventRow = {
  id: string;
  reviewer_id: string | null;
  entity_type: ReviewEntity;
  entity_id: string;
  action: ReviewAction;
  note: string | null;
  source_ids: string[];
  created_at: string;
};

export type OrderRow = {
  id: string;
  product_id: string | null;
  email: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'paid' | 'refunded' | 'failed';
  created_at: string;
  updated_at: string;
};

export type EntitlementRow = {
  id: string;
  email: string;
  product_id: string;
  order_id: string | null;
  profile_id: string | null;
  granted_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
};

export type StripeEventRow = {
  id: string;
  type: string;
  payload: Json;
  processed_at: string | null;
  error: string | null;
  received_at: string;
};

export type ClaimSourceRow = {
  claim_id: string;
  source_id: string;
};

export type KnowledgeUnitRow = {
  id: string;
  topic_id: string | null;
  summary: string;
  learning_model: Json;
  status: 'draft' | 'verified' | 'review' | 'approved';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A staff or customer account, keyed to auth.users.
 *
 * `role` is what `ac_is_staff()` reads, so it decides which half of the
 * staff/customer RLS split a signed-in person falls on.
 */
export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: 'member' | 'instructor' | 'reviewer' | 'admin';
  created_at: string;
  updated_at: string;
};

export type ContentAssetRow = {
  id: string;
  topic_id: string | null;
  product_id: string | null;
  asset_type: AssetType;
  title: string | null;
  body: string | null;
  status: TopicStatus;
  qa_findings: Json;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  /* Provenance (0004_assets.sql): what made this artwork, and where it went.
     Without these an asset cannot be reproduced, re-rendered after a design
     change, or checked against what was actually published. */
  knowledge_unit_id: string | null;
  template_version: string | null;
  render_input: Json | null;
  storage_bucket: string | null;
  storage_path: string | null;
  checksum: string | null;
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
  knowledge_unit_id?: string | null;
  risk?: 'low' | 'medium' | 'high';
  verified?: boolean;
  verified_at?: string | null;
  verified_by?: string | null;
  reviewer_id?: string | null;
  review_note?: string | null;
};

export type ReviewerInsert = {
  name: string;
  credential: Credential;
  email?: string | null;
  credential_ref?: string | null;
  profile_id?: string | null;
  active?: boolean;
};

export type ReviewEventInsert = {
  entity_type: ReviewEntity;
  entity_id: string;
  action: ReviewAction;
  reviewer_id?: string | null;
  note?: string | null;
  source_ids?: string[];
};

export type OrderInsert = {
  email: string;
  amount_cents: number;
  product_id?: string | null;
  stripe_session_id?: string | null;
  stripe_payment_intent?: string | null;
  currency?: string;
  status?: OrderRow['status'];
};

export type EntitlementInsert = {
  email: string;
  product_id: string;
  order_id?: string | null;
  profile_id?: string | null;
  revoked_at?: string | null;
  revoked_reason?: string | null;
};

export type StripeEventInsert = {
  id: string;
  type: string;
  payload: Json;
  processed_at?: string | null;
  error?: string | null;
};

export type ClaimSourceInsert = {
  claim_id: string;
  source_id: string;
};

export type KnowledgeUnitInsert = {
  summary: string;
  topic_id?: string | null;
  learning_model?: Json;
  status?: KnowledgeUnitRow['status'];
  approved_by?: string | null;
  approved_at?: string | null;
};

export type ProfileInsert = {
  id: string;
  email?: string | null;
  display_name?: string | null;
  role?: ProfileRow['role'];
};

export type ContentAssetInsert = {
  asset_type: AssetType;
  topic_id?: string | null;
  product_id?: string | null;
  title?: string | null;
  body?: string | null;
  status?: TopicStatus;
  qa_findings?: Json;
  approved_by?: string | null;
  approved_at?: string | null;
  published_at?: string | null;
  knowledge_unit_id?: string | null;
  template_version?: string | null;
  render_input?: Json | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  checksum?: string | null;
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
      ac_profiles: Table<ProfileRow, ProfileInsert>;
      ac_topics: Table<TopicRow, TopicInsert>;
      ac_sources: Table<SourceRow, SourceInsert>;
      ac_claims: Table<ClaimRow, ClaimInsert>;
      ac_knowledge_units: Table<KnowledgeUnitRow, KnowledgeUnitInsert>;
      ac_content_assets: Table<ContentAssetRow, ContentAssetInsert>;
      ac_agent_runs: Table<AgentRunRow, AgentRunInsert>;
      ac_products: Table<ProductRow, ProductInsert>;
      ac_reviewers: Table<ReviewerRow, ReviewerInsert>;
      ac_review_events: Table<ReviewEventRow, ReviewEventInsert>;
      ac_claim_sources: Table<ClaimSourceRow, ClaimSourceInsert>;
      ac_orders: Table<OrderRow, OrderInsert>;
      ac_entitlements: Table<EntitlementRow, EntitlementInsert>;
      ac_stripe_events: Table<StripeEventRow, StripeEventInsert>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
}
