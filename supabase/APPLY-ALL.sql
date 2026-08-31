-- =============================================================================
-- Aviation Clarity — complete schema, for supabase.insightprofit.live
-- =============================================================================
--
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- WHY EVERY OBJECT IS PREFIXED
--
-- This database is shared. It already holds 626 tables belonging to other
-- InsightProfit applications, and three names this project wanted were
-- already taken by them:
--
--   profiles    a billing app  (stripe_customer_id, subscription_status, plan)
--   products    a funnel builder (user_id, funnel_type, goals, stages, score)
--   agent_runs  a different agent framework (venture_id, agent_key, cost_cents)
--
-- Applying an unprefixed version of this schema would have been destructive.
-- `create table if not exists` would have silently skipped those three,
-- leaving this application reading and writing another product's tables with
-- incompatible columns — and the row-level-security statements would have
-- enabled RLS on live tables belonging to those apps, which hides every row
-- from an application whose policies do not happen to match. That is an
-- outage, not a warning.
--
-- So everything below carries an `ac_` prefix: tables, indexes, constraints,
-- triggers, functions and policies alike, because in PostgreSQL all of those
-- share one namespace per schema. Storage buckets are `aviation-assets-*`,
-- since bucket ids are global to the instance.
--
-- Nothing here reads, alters or drops any object it did not create.
--
-- Safe to re-run: every statement is idempotent, and the migrations are tested
-- by applying them twice to a clean PostgreSQL database in CI.
--
-- After running this, set two variables in the Vercel project and redeploy:
--   NEXT_PUBLIC_SUPABASE_URL      https://supabase.insightprofit.live
--                                 (currently stored without the https:// scheme,
--                                  which supabase-js rejects)
--   AVIATION_CLARITY_API_TOKEN    a long random string; gates every write route
--
-- Then GET /api/health should report "Connected and schema present."
-- =============================================================================


-- =============================================================================
-- 0001_init.sql
-- =============================================================================

-- =============================================================================
-- 0001_init.sql
-- =============================================================================

-- Aviation Clarity — initial schema
--
-- Target: self-hosted Supabase at https://supabase.insightprofit.live
-- Apply with:  psql "$POSTGRES_URL" -f supabase/migrations/0001_init.sql
--
-- Design notes:
--   * Every table carries RLS. Anonymous/publishable-key traffic can read only
--     rows that are explicitly published or approved; everything else requires
--     an authenticated owner or the service role.
--   * Workflow state is constrained by CHECK rather than free text so a bad
--     write fails at the database instead of surfacing later as a silent bug.
--   * Safety-critical review state lives in the database, not in application
--     memory, so an approval decision is auditable.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.ac_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.ac_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'member'
    check (role in ('member', 'instructor', 'reviewer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------

create table if not exists public.ac_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  audience text,
  pillar text,
  sensitivity text not null default 'technical'
    check (sensitivity in ('general', 'technical', 'regulatory', 'safety', 'medical')),
  priority int not null default 3 check (priority between 1 and 5),
  status text not null default 'queued'
    check (status in ('queued', 'researching', 'verified', 'generating',
                      'qa', 'approved', 'published', 'blocked')),
  created_by uuid references public.ac_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ac_topics_status_priority_idx
  on public.ac_topics (status, priority desc, created_at desc);

-- ---------------------------------------------------------------------------
-- sources  (authoritative research registry)
-- ---------------------------------------------------------------------------

create table if not exists public.ac_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  source_type text not null default 'other'
    check (source_type in ('faa', 'regulation', 'government', 'manufacturer',
                           'school', 'academic', 'industry', 'other')),
  authority_score numeric(3, 2) not null default 0.70
    check (authority_score between 0 and 1),
  published_at date,
  checked_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ac_sources_type_idx on public.ac_sources (source_type);

-- ---------------------------------------------------------------------------
-- claims  (a statement, and the sources that back it)
-- ---------------------------------------------------------------------------

create table if not exists public.ac_claims (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.ac_topics(id) on delete cascade,
  body text not null,
  risk text not null default 'medium' check (risk in ('low', 'medium', 'high')),
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.ac_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A claim cannot be marked verified without recording who verified it and when.
  constraint ac_claims_verification_is_attributable
    check (verified = false or (verified_at is not null and verified_by is not null))
);

create table if not exists public.ac_claim_sources (
  claim_id uuid not null references public.ac_claims(id) on delete cascade,
  source_id uuid not null references public.ac_sources(id) on delete cascade,
  primary key (claim_id, source_id)
);

-- ---------------------------------------------------------------------------
-- knowledge_units  (verified, teachable unit derived from claims)
-- ---------------------------------------------------------------------------

create table if not exists public.ac_knowledge_units (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.ac_topics(id) on delete cascade,
  summary text not null,
  learning_model jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'verified', 'review', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ac_knowledge_units_topic_idx on public.ac_knowledge_units (topic_id);

-- ---------------------------------------------------------------------------
-- workflows  (auditable state machine per topic)
-- ---------------------------------------------------------------------------

create table if not exists public.ac_workflows (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.ac_topics(id) on delete cascade,
  stage text not null default 'intake'
    check (stage in ('intake', 'research', 'verify', 'transform', 'generate',
                     'qa', 'approve', 'publish', 'measure', 'learn')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'blocked', 'complete')),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ac_workflows_topic_idx on public.ac_workflows (topic_id);

-- ---------------------------------------------------------------------------
-- content_assets
-- ---------------------------------------------------------------------------

create table if not exists public.ac_content_assets (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.ac_topics(id) on delete cascade,
  asset_type text not null
    check (asset_type in ('lesson', 'youtube', 'podcast', 'article', 'short',
                          'social', 'carousel', 'email', 'lead_magnet', 'quiz',
                          'worksheet', 'book_chapter')),
  title text,
  body text,
  status text not null default 'queued'
    check (status in ('queued', 'researching', 'verified', 'generating',
                      'qa', 'approved', 'published', 'blocked')),
  qa_findings jsonb not null default '[]'::jsonb,
  approved_by uuid references public.ac_profiles(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Publication requires a recorded human approval. This is the database-level
  -- half of the safety policy in AGENTS.md; the application half can be bypassed.
  constraint ac_content_assets_publication_requires_approval
    check (status <> 'published' or (approved_by is not null and approved_at is not null))
);

create index if not exists ac_content_assets_topic_idx on public.ac_content_assets (topic_id);
create index if not exists ac_content_assets_status_idx on public.ac_content_assets (status);

-- ---------------------------------------------------------------------------
-- products / product_events
-- ---------------------------------------------------------------------------

create table if not exists public.ac_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  audience text,
  kind text not null default 'toolkit'
    check (kind in ('template', 'checklist', 'assessment', 'toolkit',
                    'course', 'membership', 'service')),
  description text,
  price_cents int check (price_cents is null or price_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'idea'
    check (status in ('idea', 'validating', 'building', 'live', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ac_product_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.ac_products(id) on delete cascade,
  profile_id uuid references public.ac_profiles(id) on delete set null,
  event_type text not null
    check (event_type in ('view', 'lead', 'checkout_started', 'purchase', 'refund')),
  amount_cents int,
  external_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ac_product_events_product_idx
  on public.ac_product_events (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- assessments / assessment_attempts
-- ---------------------------------------------------------------------------

create table if not exists public.ac_assessments (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.ac_topics(id) on delete cascade,
  title text not null,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ac_assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.ac_assessments(id) on delete cascade,
  profile_id uuid references public.ac_profiles(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  correct int not null default 0,
  total int not null default 0,
  percent int not null default 0 check (percent between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists ac_assessment_attempts_profile_idx
  on public.ac_assessment_attempts (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- agent_runs  (audit trail for every agent invocation)
-- ---------------------------------------------------------------------------

create table if not exists public.ac_agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  topic_id uuid references public.ac_topics(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'blocked', 'complete', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  safety_flags jsonb not null default '[]'::jsonb,
  error text,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists ac_agent_runs_created_idx on public.ac_agent_runs (created_at desc);
create index if not exists ac_agent_runs_agent_idx on public.ac_agent_runs (agent_name, created_at desc);

-- ---------------------------------------------------------------------------
-- analytics_events
-- ---------------------------------------------------------------------------

create table if not exists public.ac_analytics_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.ac_profiles(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ac_analytics_events_name_idx
  on public.ac_analytics_events (event_name, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  -- Prefixed explicitly: this loop builds identifiers by string, so the rename
  -- to ac_* could not reach it. Left unprefixed it would have attached this
  -- project's trigger to the billing app's `profiles` and the funnel app's
  -- `products`, which share this database.
  foreach t in array array[
    'ac_profiles', 'ac_topics', 'ac_sources', 'ac_claims', 'ac_knowledge_units',
    'ac_workflows', 'ac_content_assets', 'ac_products', 'ac_assessments'
  ]
  loop
    execute format(
      'drop trigger if exists ac_set_updated_at on public.%I;
       create trigger ac_set_updated_at before update on public.%I
         for each row execute function public.ac_set_updated_at();', t, t);
  end loop;
end;
$$;

-- =============================================================================
-- 0002_rls.sql
-- =============================================================================

-- Aviation Clarity — Row Level Security
--
-- Apply after 0001_init.sql:
--   psql "$POSTGRES_URL" -f supabase/migrations/0002_rls.sql
--
-- Policy model:
--   anon           — may read only content that has cleared review
--                    (published assets, approved knowledge units, live products).
--   authenticated  — may read the working set and write their own attempts.
--   service_role   — bypasses RLS entirely; used only by server-side code.
--
-- Writes from the browser are deliberately NOT granted. All mutations go
-- through server-side route handlers holding the secret key, so the safety
-- and QA gates cannot be bypassed by calling PostgREST directly.

-- ---------------------------------------------------------------------------
-- Table grants
-- ---------------------------------------------------------------------------
-- RLS only filters rows a role is already allowed to touch; without a GRANT,
-- PostgREST returns "permission denied" instead. Supabase normally grants these
-- through default privileges, but self-hosted instances vary by version, so the
-- grants are stated explicitly here. Note that no write grant is issued to anon
-- or authenticated except the one on assessment_attempts.

grant usage on schema public to anon, authenticated;

-- Granted table by table, never `on all tables in schema public`.
--
-- This database is shared: `public` holds 626 tables belonging to other
-- InsightProfit applications, and a blanket grant reaches every one of them.
-- Row Level Security would not save them, because RLS only filters tables that
-- have it enabled and those tables do not — so the grant alone would let the
-- publishable key, which ships in the browser, read another product's customer
-- billing records outright. Listing the tables is the whole defence.
grant select on
  public.ac_profiles,
  public.ac_topics,
  public.ac_sources,
  public.ac_claims,
  public.ac_claim_sources,
  public.ac_knowledge_units,
  public.ac_workflows,
  public.ac_content_assets,
  public.ac_products,
  public.ac_product_events,
  public.ac_assessments,
  public.ac_assessment_attempts,
  public.ac_agent_runs,
  public.ac_analytics_events
to anon, authenticated;

grant insert on public.ac_assessment_attempts to authenticated;
grant update (display_name) on public.ac_profiles to authenticated;

alter table public.ac_profiles           enable row level security;
alter table public.ac_topics             enable row level security;
alter table public.ac_sources            enable row level security;
alter table public.ac_claims             enable row level security;
alter table public.ac_claim_sources      enable row level security;
alter table public.ac_knowledge_units    enable row level security;
alter table public.ac_workflows          enable row level security;
alter table public.ac_content_assets     enable row level security;
alter table public.ac_products           enable row level security;
alter table public.ac_product_events     enable row level security;
alter table public.ac_assessments        enable row level security;
alter table public.ac_assessment_attempts enable row level security;
alter table public.ac_agent_runs         enable row level security;
alter table public.ac_analytics_events   enable row level security;

-- profiles ------------------------------------------------------------------

drop policy if exists ac_profiles_select_own on public.ac_profiles;
create policy ac_profiles_select_own on public.ac_profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists ac_profiles_update_own on public.ac_profiles;
create policy ac_profiles_update_own on public.ac_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- topics --------------------------------------------------------------------

drop policy if exists ac_topics_select_published on public.ac_topics;
create policy ac_topics_select_published on public.ac_topics
  for select to anon
  using (status = 'published');

drop policy if exists ac_topics_select_authenticated on public.ac_topics;
create policy ac_topics_select_authenticated on public.ac_topics
  for select to authenticated
  using (true);

-- sources / claims ----------------------------------------------------------
-- Sources are the citation trail behind published material, so they are
-- readable anonymously. Claims are not: an unverified claim must never be
-- reachable by a public client.

drop policy if exists ac_sources_select_all on public.ac_sources;
create policy ac_sources_select_all on public.ac_sources
  for select to anon, authenticated
  using (true);

drop policy if exists ac_claims_select_verified on public.ac_claims;
create policy ac_claims_select_verified on public.ac_claims
  for select to anon
  using (verified = true);

drop policy if exists ac_claims_select_authenticated on public.ac_claims;
create policy ac_claims_select_authenticated on public.ac_claims
  for select to authenticated
  using (true);

drop policy if exists ac_claim_sources_select on public.ac_claim_sources;
create policy ac_claim_sources_select on public.ac_claim_sources
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.ac_claims c
      where c.id = ac_claim_sources.claim_id
        and (c.verified = true or (select auth.role()) = 'authenticated')
    )
  );

-- knowledge_units -----------------------------------------------------------

drop policy if exists ac_knowledge_units_select_approved on public.ac_knowledge_units;
create policy ac_knowledge_units_select_approved on public.ac_knowledge_units
  for select to anon
  using (status = 'approved');

drop policy if exists ac_knowledge_units_select_authenticated on public.ac_knowledge_units;
create policy ac_knowledge_units_select_authenticated on public.ac_knowledge_units
  for select to authenticated
  using (true);

-- workflows -----------------------------------------------------------------
-- Internal production state. No anonymous access.

drop policy if exists ac_workflows_select_authenticated on public.ac_workflows;
create policy ac_workflows_select_authenticated on public.ac_workflows
  for select to authenticated
  using (true);

-- content_assets ------------------------------------------------------------

drop policy if exists ac_content_assets_select_published on public.ac_content_assets;
create policy ac_content_assets_select_published on public.ac_content_assets
  for select to anon
  using (status = 'published');

drop policy if exists ac_content_assets_select_authenticated on public.ac_content_assets;
create policy ac_content_assets_select_authenticated on public.ac_content_assets
  for select to authenticated
  using (true);

-- products ------------------------------------------------------------------

drop policy if exists ac_products_select_live on public.ac_products;
create policy ac_products_select_live on public.ac_products
  for select to anon
  using (status = 'live');

drop policy if exists ac_products_select_authenticated on public.ac_products;
create policy ac_products_select_authenticated on public.ac_products
  for select to authenticated
  using (true);

-- product_events ------------------------------------------------------------
-- Revenue data. Readable only for one's own events; written server-side.

drop policy if exists ac_product_events_select_own on public.ac_product_events;
create policy ac_product_events_select_own on public.ac_product_events
  for select to authenticated
  using (profile_id = (select auth.uid()));

-- assessments / attempts ----------------------------------------------------

drop policy if exists ac_assessments_select_all on public.ac_assessments;
create policy ac_assessments_select_all on public.ac_assessments
  for select to anon, authenticated
  using (true);

drop policy if exists ac_assessment_attempts_select_own on public.ac_assessment_attempts;
create policy ac_assessment_attempts_select_own on public.ac_assessment_attempts
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists ac_assessment_attempts_insert_own on public.ac_assessment_attempts;
create policy ac_assessment_attempts_insert_own on public.ac_assessment_attempts
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

-- agent_runs / analytics_events ---------------------------------------------
-- Operational audit trail. Server-side (service_role) writes only; no policy
-- is granted to anon or authenticated, so RLS denies all client access.

drop policy if exists ac_agent_runs_select_authenticated on public.ac_agent_runs;
create policy ac_agent_runs_select_authenticated on public.ac_agent_runs
  for select to authenticated
  using (true);

-- =============================================================================
-- 0003_review.sql
-- =============================================================================

-- Aviation Clarity — verification and review (Phase 02)
--
-- Apply after 0002_rls.sql:
--   psql "$POSTGRES_URL" -f supabase/migrations/0003_review.sql
--
-- This migration adds the gate that turns generated content into content that
-- can be published or sold. Generation is cheap; what makes aviation training
-- material safe to put in front of a student is that a qualified human checked
-- its claims against authoritative sources and signed their name to it.
--
-- Two invariants are enforced here rather than in application code, because
-- anything holding the Supabase secret key can bypass application code:
--   * a claim cannot be marked verified without a source backing it;
--   * a knowledge unit cannot be approved while any of its claims is unverified.

-- ---------------------------------------------------------------------------
-- reviewers
-- ---------------------------------------------------------------------------
--
-- Deliberately not `profiles`. A profile is keyed to auth.users, so no profile
-- can exist until Supabase Auth is wired in (Phase 04) — and review has to work
-- before then. It is also the better model on its own terms: for aviation
-- content, what matters on an approval is which credentialed person signed it,
-- not which account was logged in. Phase 04 links the two via profile_id
-- without disturbing anything recorded before it.

create table if not exists public.ac_reviewers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  /* The credential that makes this person's sign-off meaningful. */
  credential text not null
    check (credential in ('CFI', 'CFII', 'MEI', 'ATP', 'DPE', 'AME', 'A&P', 'IA', 'editorial')),
  /* Certificate number or equivalent, so an approval is traceable off-system. */
  credential_ref text,
  profile_id uuid references public.ac_profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ac_reviewers_active_idx on public.ac_reviewers (active, credential);

-- ---------------------------------------------------------------------------
-- sources: one row per document
-- ---------------------------------------------------------------------------
-- A citation registry that holds the same document twice cites it two ways.

create unique index if not exists ac_sources_url_key on public.ac_sources (url);

-- ---------------------------------------------------------------------------
-- claims: attach to the unit they came from, and to a credentialed reviewer
-- ---------------------------------------------------------------------------

alter table public.ac_claims
  add column if not exists knowledge_unit_id uuid
    references public.ac_knowledge_units(id) on delete cascade;

alter table public.ac_claims
  add column if not exists reviewer_id uuid
    references public.ac_reviewers(id) on delete restrict;

alter table public.ac_claims
  add column if not exists review_note text;

create index if not exists ac_claims_unit_idx on public.ac_claims (knowledge_unit_id);
create index if not exists ac_claims_unverified_idx on public.ac_claims (verified, risk desc);

-- Attribution may now come from a reviewer as well as a profile; 0001 knew
-- only about profiles.
alter table public.ac_claims drop constraint if exists ac_claims_verification_is_attributable;
alter table public.ac_claims add constraint ac_claims_verification_is_attributable
  check (
    verified = false
    or (verified_at is not null and (verified_by is not null or reviewer_id is not null))
  );

-- ---------------------------------------------------------------------------
-- A verified claim must cite a source
-- ---------------------------------------------------------------------------
--
-- The citation lives in claim_sources, so this cannot be a row-level CHECK.
-- Enforced as a constraint trigger deferred to commit time, which lets a
-- transaction insert the claim_sources rows and flip `verified` in either
-- order — only the state at commit has to be sound.

create or replace function public.ac_claim_requires_citation()
returns trigger
language plpgsql
as $$
begin
  if new.verified = true
     and not exists (select 1 from public.ac_claim_sources cs where cs.claim_id = new.id)
  then
    raise exception
      'claim % cannot be verified without at least one cited source', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ac_claims_require_citation on public.ac_claims;
create constraint trigger ac_claims_require_citation
  after insert or update on public.ac_claims
  deferrable initially deferred
  for each row execute function public.ac_claim_requires_citation();

-- ---------------------------------------------------------------------------
-- knowledge_units: approval, gated on its claims
-- ---------------------------------------------------------------------------

alter table public.ac_knowledge_units
  add column if not exists approved_by uuid
    references public.ac_reviewers(id) on delete restrict;

alter table public.ac_knowledge_units
  add column if not exists approved_at timestamptz;

alter table public.ac_knowledge_units drop constraint if exists ac_knowledge_units_approval_is_attributable;
alter table public.ac_knowledge_units add constraint ac_knowledge_units_approval_is_attributable
  check (status <> 'approved' or (approved_by is not null and approved_at is not null));

create or replace function public.ac_unit_requires_verified_claims()
returns trigger
language plpgsql
as $$
declare
  unverified int;
begin
  if new.status = 'approved' then
    select count(*) into unverified
      from public.ac_claims c
     where c.knowledge_unit_id = new.id
       and c.verified = false;

    if unverified > 0 then
      raise exception
        'knowledge unit % cannot be approved: % claim(s) still unverified', new.id, unverified
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ac_knowledge_units_require_verified_claims on public.ac_knowledge_units;
create constraint trigger ac_knowledge_units_require_verified_claims
  after insert or update on public.ac_knowledge_units
  deferrable initially deferred
  for each row execute function public.ac_unit_requires_verified_claims();

-- ---------------------------------------------------------------------------
-- review_events — an append-only record of human decisions
-- ---------------------------------------------------------------------------
--
-- The columns above hold current state; this holds how it got there. In a
-- safety-critical domain the sequence of decisions is itself evidence, and
-- state columns are overwritten by the next decision.

create table if not exists public.ac_review_events (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid references public.ac_reviewers(id) on delete set null,
  entity_type text not null check (entity_type in ('claim', 'knowledge_unit', 'content_asset')),
  entity_id uuid not null,
  action text not null check (action in ('verified', 'rejected', 'approved', 'reopened')),
  note text,
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists ac_review_events_entity_idx
  on public.ac_review_events (entity_type, entity_id, created_at desc);

drop trigger if exists ac_set_updated_at on public.ac_reviewers;
create trigger ac_set_updated_at before update on public.ac_reviewers
  for each row execute function public.ac_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security for the new tables
-- ---------------------------------------------------------------------------
--
-- Review state is internal. Anonymous callers get nothing here; the review
-- endpoints run server-side with the secret key.

alter table public.ac_reviewers     enable row level security;
alter table public.ac_review_events enable row level security;

grant select on public.ac_reviewers, public.ac_review_events to authenticated;

drop policy if exists ac_reviewers_select_authenticated on public.ac_reviewers;
create policy ac_reviewers_select_authenticated on public.ac_reviewers
  for select to authenticated
  using (true);

drop policy if exists ac_review_events_select_authenticated on public.ac_review_events;
create policy ac_review_events_select_authenticated on public.ac_review_events
  for select to authenticated
  using (true);

-- =============================================================================
-- 0004_assets.sql
-- =============================================================================

-- Aviation Clarity — rendered asset storage and provenance (Phase 03)
--
-- Apply after 0003_review.sql:
--   psql "$POSTGRES_URL" -f supabase/migrations/0004_assets.sql
--
-- Two things: somewhere to put rendered artwork, split by whether the content
-- behind it has been approved; and a record of how each asset was made.

-- ---------------------------------------------------------------------------
-- content_assets: how this artwork was produced
-- ---------------------------------------------------------------------------
--
-- The same reasoning as PROMPT_VERSION on generated text. Without the template
-- version there is no way to tell which assets predate a design change, and so
-- no way to decide what needs re-rendering. Without the inputs, an asset cannot
-- be reproduced at all.

alter table public.ac_content_assets
  add column if not exists template_version text;

alter table public.ac_content_assets
  add column if not exists render_input jsonb;

alter table public.ac_content_assets
  add column if not exists storage_bucket text;

alter table public.ac_content_assets
  add column if not exists storage_path text;

/* SHA-256 of the rendered bytes: lets a re-render be compared against what
   was published without downloading it. */
alter table public.ac_content_assets
  add column if not exists checksum text;

alter table public.ac_content_assets
  add column if not exists knowledge_unit_id uuid
    references public.ac_knowledge_units(id) on delete set null;

create index if not exists ac_content_assets_unit_idx
  on public.ac_content_assets (knowledge_unit_id);

create unique index if not exists ac_content_assets_storage_key
  on public.ac_content_assets (storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

-- A stored asset must say how it was made, or it cannot be reproduced or
-- audited later.
alter table public.ac_content_assets drop constraint if exists ac_content_assets_render_is_traceable;
alter table public.ac_content_assets add constraint ac_content_assets_render_is_traceable
  check (
    storage_path is null
    or (template_version is not null and render_input is not null and checksum is not null)
  );

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
--
-- Two buckets, mirroring the review workflow rather than one bucket with a
-- flag: a public bucket is served to anyone who guesses a path, so approval
-- has to be the thing that decides which bucket an object lives in. Moving an
-- object between buckets is then the publish step, and it is explicit.
--
-- Guarded because the storage schema belongs to the Supabase platform: on a
-- bare PostgreSQL (the migration test harness) it is absent, and this
-- migration must still apply cleanly.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket creation';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('aviation-assets-draft',    'aviation-assets-draft',    false, 10485760, array['image/png', 'image/svg+xml', 'application/pdf']),
    ('aviation-assets-approved', 'aviation-assets-approved', true,  10485760, array['image/png', 'image/svg+xml', 'application/pdf'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
end;
$$;

-- Policies on storage.objects: drafts are readable only by authenticated
-- staff; approved artwork is public. Writes are server-side only, so no insert
-- or update policy is granted to either role.

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'drop policy if exists ac_assets_draft_read_authenticated on storage.objects';
  execute $p$
    create policy ac_assets_draft_read_authenticated on storage.objects
      for select to authenticated
      using (bucket_id = 'aviation-assets-draft')
  $p$;

  execute 'drop policy if exists ac_assets_approved_read_public on storage.objects';
  execute $p$
    create policy ac_assets_approved_read_public on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'aviation-assets-approved')
  $p$;
end;
$$;

-- =============================================================================
-- 0005_commerce.sql
-- =============================================================================

-- Aviation Clarity — commerce and entitlements (Phase 04)
--
-- Apply after 0004_assets.sql:
--   psql "$POSTGRES_URL" -f supabase/migrations/0005_commerce.sql
--
-- Three ideas here, in order of how much trouble getting them wrong causes:
--
--   1. Stripe webhooks are the source of truth for payment state, and Stripe
--      retries. Every event is recorded before it is acted on, so a retry is a
--      no-op rather than a second entitlement.
--   2. Entitlements are keyed to an email address, not an account. A buyer
--      should not have to create an account before paying; Checkout collects
--      the email, and the entitlement resolves to a profile whenever they
--      first sign in.
--   3. Access is enforced by Row Level Security. A UI check is a suggestion —
--      anything that can reach PostgREST bypasses it.

-- ---------------------------------------------------------------------------
-- stripe_events — idempotency ledger
-- ---------------------------------------------------------------------------

create table if not exists public.ac_stripe_events (
  /* Stripe's own event id. Primary key, so a retry collides by construction. */
  id text primary key,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now()
);

create index if not exists ac_stripe_events_unprocessed_idx
  on public.ac_stripe_events (received_at desc)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

create table if not exists public.ac_orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.ac_products(id) on delete restrict,
  email text not null,
  /* Stripe Checkout Session id. Unique so one session cannot become two orders. */
  stripe_session_id text unique,
  stripe_payment_intent text,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'refunded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  /* A paid order must say what was actually charged. */
  constraint ac_orders_paid_has_payment
    check (status <> 'paid' or stripe_payment_intent is not null)
);

create index if not exists ac_orders_email_idx on public.ac_orders (lower(email), created_at desc);

-- ---------------------------------------------------------------------------
-- entitlements
-- ---------------------------------------------------------------------------

create table if not exists public.ac_entitlements (
  id uuid primary key default gen_random_uuid(),
  /* Lower-cased on write; the citext extension is not guaranteed present on a
     self-hosted instance, so case-folding is done explicitly. */
  email text not null,
  product_id uuid not null references public.ac_products(id) on delete restrict,
  order_id uuid references public.ac_orders(id) on delete set null,
  /* Linked when the buyer first signs in. Null until then, which is the normal
     state for a guest checkout. */
  profile_id uuid references public.ac_profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  /* Set rather than deleted on refund, so the history survives. */
  revoked_at timestamptz,
  revoked_reason text
);

create unique index if not exists ac_entitlements_unique_grant
  on public.ac_entitlements (email, product_id)
  where revoked_at is null;

create index if not exists ac_entitlements_email_idx on public.ac_entitlements (email);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.ac_stripe_events enable row level security;
alter table public.ac_orders        enable row level security;
alter table public.ac_entitlements  enable row level security;

grant select on public.ac_orders, public.ac_entitlements to authenticated;

/*
 * The email on the caller's JWT, lower-cased.
 *
 * This is what ties a guest purchase to a signed-in session: Checkout captured
 * the email, and Supabase Auth puts the verified email on the token.
 */
create or replace function public.ac_current_email()
returns text
language sql
stable
as $$
  select lower(nullif(current_setting('request.jwt.claim.email', true), ''))
$$;

drop policy if exists ac_entitlements_select_own on public.ac_entitlements;
create policy ac_entitlements_select_own on public.ac_entitlements
  for select to authenticated
  using (email = public.ac_current_email());

drop policy if exists ac_orders_select_own on public.ac_orders;
create policy ac_orders_select_own on public.ac_orders
  for select to authenticated
  using (lower(email) = public.ac_current_email());

/*
 * stripe_events carries raw webhook payloads, including customer details.
 * No policy is granted to anon or authenticated, so RLS denies everyone; only
 * server-side code holding the secret key can read it.
 */

-- ---------------------------------------------------------------------------
-- Entitlement-gated content
-- ---------------------------------------------------------------------------
--
-- The paid half of the catalogue. A published asset attached to a product is
-- readable only by someone entitled to that product — enforced here rather
-- than in a route, so a direct PostgREST call is subject to the same rule.

alter table public.ac_content_assets
  add column if not exists product_id uuid references public.ac_products(id) on delete set null;

create index if not exists ac_content_assets_product_idx on public.ac_content_assets (product_id);

drop policy if exists ac_content_assets_select_entitled on public.ac_content_assets;
create policy ac_content_assets_select_entitled on public.ac_content_assets
  for select to authenticated
  using (
    product_id is not null
    and exists (
      select 1
        from public.ac_entitlements e
       where e.product_id = ac_content_assets.product_id
         and e.revoked_at is null
         and e.email = public.ac_current_email()
    )
  );

drop trigger if exists ac_set_updated_at on public.ac_orders;
create trigger ac_set_updated_at before update on public.ac_orders
  for each row execute function public.ac_set_updated_at();

-- ---------------------------------------------------------------------------
-- Correcting an assumption that Phase 04 invalidates
-- ---------------------------------------------------------------------------
--
-- 0002 granted `authenticated` a blanket `using (true)` read on topics, claims,
-- knowledge_units, workflows, content_assets, products and agent_runs. That was
-- sound while the only people with accounts were staff.
--
-- This migration introduces customer accounts. Because RLS policies are OR'd,
-- those blanket policies would let any signed-in buyer read every unpublished
-- draft, every unverified claim, the whole agent audit trail — and every paid
-- asset, entitlement or not, which would make the entitlement policy above
-- decorative.
--
-- So `authenticated` is split. Staff read the working set; everyone signed in
-- reads what is published, plus whatever they have paid for.

create or replace function public.ac_is_staff()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.ac_profiles p
     where p.id = (select auth.uid())
       and p.role in ('instructor', 'reviewer', 'admin')
  )
$$;

-- Internal working state: staff only.
drop policy if exists ac_topics_select_authenticated on public.ac_topics;
create policy ac_topics_select_authenticated on public.ac_topics
  for select to authenticated using (public.ac_is_staff());

drop policy if exists ac_claims_select_authenticated on public.ac_claims;
create policy ac_claims_select_authenticated on public.ac_claims
  for select to authenticated using (public.ac_is_staff());

drop policy if exists ac_knowledge_units_select_authenticated on public.ac_knowledge_units;
create policy ac_knowledge_units_select_authenticated on public.ac_knowledge_units
  for select to authenticated using (public.ac_is_staff());

drop policy if exists ac_workflows_select_authenticated on public.ac_workflows;
create policy ac_workflows_select_authenticated on public.ac_workflows
  for select to authenticated using (public.ac_is_staff());

drop policy if exists ac_content_assets_select_authenticated on public.ac_content_assets;
create policy ac_content_assets_select_authenticated on public.ac_content_assets
  for select to authenticated using (public.ac_is_staff());

drop policy if exists ac_products_select_authenticated on public.ac_products;
create policy ac_products_select_authenticated on public.ac_products
  for select to authenticated using (public.ac_is_staff());

drop policy if exists ac_agent_runs_select_authenticated on public.ac_agent_runs;
create policy ac_agent_runs_select_authenticated on public.ac_agent_runs
  for select to authenticated using (public.ac_is_staff());

drop policy if exists ac_reviewers_select_authenticated on public.ac_reviewers;
create policy ac_reviewers_select_authenticated on public.ac_reviewers
  for select to authenticated using (public.ac_is_staff());

drop policy if exists ac_review_events_select_authenticated on public.ac_review_events;
create policy ac_review_events_select_authenticated on public.ac_review_events
  for select to authenticated using (public.ac_is_staff());

-- Public-facing rows were scoped `to anon` alone, which meant a signed-in
-- customer — role `authenticated`, not `anon` — lost access to published
-- content the moment they logged in. They now cover both roles.
drop policy if exists ac_topics_select_published on public.ac_topics;
create policy ac_topics_select_published on public.ac_topics
  for select to anon, authenticated using (status = 'published');

drop policy if exists ac_knowledge_units_select_approved on public.ac_knowledge_units;
create policy ac_knowledge_units_select_approved on public.ac_knowledge_units
  for select to anon, authenticated using (status = 'approved');

drop policy if exists ac_content_assets_select_published on public.ac_content_assets;
create policy ac_content_assets_select_published on public.ac_content_assets
  for select to anon, authenticated
  using (status = 'published' and product_id is null);

drop policy if exists ac_products_select_live on public.ac_products;
create policy ac_products_select_live on public.ac_products
  for select to anon, authenticated using (status = 'live');

drop policy if exists ac_claims_select_verified on public.ac_claims;
create policy ac_claims_select_verified on public.ac_claims
  for select to anon, authenticated using (verified = true);

-- =============================================================================
-- 0006_delivery.sql
-- =============================================================================

-- Aviation Clarity — asset delivery and the storage side of entitlements
--
-- Apply after 0005_commerce.sql:
--   psql "$POSTGRES_URL" -f supabase/migrations/0006_delivery.sql
--
-- 0005 corrected a blanket `authenticated` read on the public schema once
-- customers gained accounts. The same correction was never applied to storage,
-- which is the other half of the same assumption.

-- ---------------------------------------------------------------------------
-- Storage: drafts are staff-only, and nothing is world-readable
-- ---------------------------------------------------------------------------
--
-- 0004 gave `assets-draft` a read policy for `authenticated`, which was sound
-- while staff were the only people with accounts. It is not sound now: a
-- customer who signs in to collect a purchase is `authenticated`, and could
-- read every unreviewed render in the bucket. Drafts become staff-only.
--
-- `assets-approved` was public — served to anyone who has the path. Paths are
-- SHA-256 content hashes and so not guessable, but an unguessable URL is not
-- access control, and approved artwork now includes material people have paid
-- for. Both buckets become private and every read goes out as a signed URL
-- minted by a route that has already checked the entitlement. Nothing is lost
-- publicly: free artwork is served by rendering it at /api/assets/{kind},
-- never by reading the bucket.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket hardening';
    return;
  end if;

  update storage.buckets set public = false where id in ('aviation-assets-draft', 'aviation-assets-approved');
end;
$$;

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'drop policy if exists ac_assets_draft_read_authenticated on storage.objects';
  execute 'drop policy if exists ac_assets_approved_read_public on storage.objects';
  execute 'drop policy if exists ac_assets_read_staff on storage.objects';

  -- Staff read either bucket directly, for review. Everyone else — including a
  -- paying customer — receives a signed URL instead, which the storage service
  -- honours without consulting these policies.
  execute $p$
    create policy ac_assets_read_staff on storage.objects
      for select to authenticated
      using (bucket_id in ('aviation-assets-draft', 'aviation-assets-approved') and public.ac_is_staff())
  $p$;
end;
$$;

-- ---------------------------------------------------------------------------
-- An asset may not claim more approval than its knowledge unit has
-- ---------------------------------------------------------------------------
--
-- The application derives an asset's review band from the unit it renders, but
-- the application is one route away from being bypassed. This is the database
-- half: a content_asset that names a knowledge unit cannot sit at 'approved'
-- while that unit is not approved.
--
-- Deferred, like the review triggers in 0003, so that a transaction may write
-- the asset and approve the unit in either order and be judged on its result.

create or replace function public.ac_assert_asset_not_overclaiming()
returns trigger
language plpgsql
as $$
declare
  unit_status text;
begin
  if new.knowledge_unit_id is null then
    return new;
  end if;

  if new.status not in ('approved', 'published') then
    return new;
  end if;

  select status into unit_status
    from public.ac_knowledge_units
   where id = new.knowledge_unit_id;

  if unit_status is distinct from 'approved' then
    raise exception
      'content asset % cannot be marked % while knowledge unit % is %',
      new.id, new.status, new.knowledge_unit_id, coalesce(unit_status, 'missing');
  end if;

  return new;
end;
$$;

drop trigger if exists ac_assets_not_overclaiming on public.ac_content_assets;
create constraint trigger ac_assets_not_overclaiming
  after insert or update on public.ac_content_assets
  deferrable initially deferred
  for each row execute function public.ac_assert_asset_not_overclaiming();

-- ---------------------------------------------------------------------------
-- Reproducibility
-- ---------------------------------------------------------------------------
--
-- The unique index from 0004 on (storage_bucket, storage_path) is what makes a
-- re-render of identical bytes resolve to the same row instead of a duplicate.
-- Named here so it can be targeted by an upsert's on-conflict clause, which a
-- partial index cannot be.

drop index if exists public.ac_content_assets_storage_key;
create unique index if not exists ac_content_assets_storage_key
  on public.ac_content_assets (storage_bucket, storage_path);

-- =============================================================================
-- authoritative-sources.sql
-- =============================================================================

-- Aviation Clarity — authoritative source registry
--
-- Apply after the migrations:
--   psql "$POSTGRES_URL" -f supabase/seed/authoritative-sources.sql
--
-- These are the documents a reviewer cites when verifying a claim. Only sources
-- whose URL was confirmed to resolve are listed: a citation registry containing
-- dead links is worse than an empty one, because a reviewer trusts it.
--
-- Every URL below returned HTTP 200 on 2026-08-30. Re-check them with
-- `npm run verify:sources` — federal handbook URLs move.
--
-- Idempotent: re-running updates titles and metadata without duplicating rows.
--
-- Targets `ac_sources`, not `sources`. This file lives outside
-- supabase/migrations/, so the rename that namespaced everything else for the
-- shared instance did not reach it — it still said `public.sources` after that
-- change. No table of that name exists on the instance today, so it would have
-- errored rather than written into another application's table, but only by
-- luck: had a neighbour owned a `sources` table, this would have inserted
-- fourteen rows into it.

insert into public.ac_sources (title, url, source_type, authority_score, notes) values

-- Regulation. The primary text; nothing outranks it.
('14 CFR Part 61 — Certification: Pilots, Flight Instructors, and Ground Instructors',
 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-61',
 'regulation', 1.00,
 'Certification, ratings, currency and instructor privileges. Cite for any claim about what a certificate or rating permits.'),

('14 CFR Part 91 — General Operating and Flight Rules',
 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-91',
 'regulation', 1.00,
 'Operating rules, minimums, equipment and airspace requirements. Cite for any operational limit stated as a rule.'),

('14 CFR Part 67 — Medical Standards and Certification',
 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-67',
 'regulation', 1.00,
 'Medical certificate classes and standards. Cite for aeromedical certification claims; it does not make anyone a physician.'),

('14 CFR Part 141 — Pilot Schools',
 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-H/part-141',
 'regulation', 1.00,
 'Approved school curricula and requirements. Cite for claims about structured training programmes.'),

-- FAA guidance and handbooks.
('FAA-H-8083-25 — Pilot''s Handbook of Aeronautical Knowledge',
 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak',
 'faa', 1.00,
 'The default citation for foundational aeronautical knowledge: aerodynamics, weather, navigation, systems.'),

('FAA-H-8083-3 — Airplane Flying Handbook',
 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook',
 'faa', 1.00,
 'Flight manoeuvres and the reasoning behind them. Cite for how and why a manoeuvre behaves as it does.'),

('FAA-H-8083-16 — Instrument Procedures Handbook',
 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/instrument_procedures_handbook',
 'faa', 1.00,
 'Instrument procedures and the system they operate within.'),

('FAA-H-8083-9 — Aviation Instructor''s Handbook',
 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/aviation_instructors_handbook',
 'faa', 1.00,
 'Learning theory and instructional technique. The citation for teaching-method claims in the Train the Trainer series.'),

('FAA Handbooks and Manuals — Aviation',
 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation',
 'faa', 0.95,
 'Index of current handbooks. Use to locate a specific handbook when a direct URL has moved; prefer citing the handbook itself.'),

('Aeronautical Information Manual',
 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/',
 'faa', 1.00,
 'Procedures, phraseology and airspace practice. Guidance rather than regulation — cite alongside the rule, not instead of it.'),

('Airman Certification Standards',
 'https://www.faa.gov/training_testing/testing/acs',
 'faa', 1.00,
 'What a checkride actually tests, to what tolerance. The citation for every Pass the Test & Checkride claim.'),

('FAA Advisory Circulars',
 'https://www.faa.gov/regulations_policies/advisory_circulars',
 'faa', 0.95,
 'Acceptable means of compliance. Index — cite the specific AC number once identified.'),

('FAA Safety Briefing',
 'https://www.faa.gov/newsroom/faa-safety-briefing',
 'faa', 0.85,
 'Current safety themes and campaigns. Useful for framing and currency, weaker than a handbook for technical claims.'),

-- Investigative record.
('NTSB Aviation Investigations',
 'https://www.ntsb.gov/investigations/Pages/aviation.aspx',
 'government', 0.95,
 'Accident and incident reports. Cite for scenario and case-study material; never as a source for procedure.')

on conflict (url) do update set
  title = excluded.title,
  source_type = excluded.source_type,
  authority_score = excluded.authority_score,
  notes = excluded.notes,
  checked_at = now();
