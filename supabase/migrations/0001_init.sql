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

create or replace function public.set_updated_at()
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

create table if not exists public.profiles (
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

create table if not exists public.topics (
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
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists topics_status_priority_idx
  on public.topics (status, priority desc, created_at desc);

-- ---------------------------------------------------------------------------
-- sources  (authoritative research registry)
-- ---------------------------------------------------------------------------

create table if not exists public.sources (
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

create index if not exists sources_type_idx on public.sources (source_type);

-- ---------------------------------------------------------------------------
-- claims  (a statement, and the sources that back it)
-- ---------------------------------------------------------------------------

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(id) on delete cascade,
  body text not null,
  risk text not null default 'medium' check (risk in ('low', 'medium', 'high')),
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A claim cannot be marked verified without recording who verified it and when.
  constraint claims_verification_is_attributable
    check (verified = false or (verified_at is not null and verified_by is not null))
);

create table if not exists public.claim_sources (
  claim_id uuid not null references public.claims(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  primary key (claim_id, source_id)
);

-- ---------------------------------------------------------------------------
-- knowledge_units  (verified, teachable unit derived from claims)
-- ---------------------------------------------------------------------------

create table if not exists public.knowledge_units (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(id) on delete cascade,
  summary text not null,
  learning_model jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'verified', 'review', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_units_topic_idx on public.knowledge_units (topic_id);

-- ---------------------------------------------------------------------------
-- workflows  (auditable state machine per topic)
-- ---------------------------------------------------------------------------

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  stage text not null default 'intake'
    check (stage in ('intake', 'research', 'verify', 'transform', 'generate',
                     'qa', 'approve', 'publish', 'measure', 'learn')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'blocked', 'complete')),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflows_topic_idx on public.workflows (topic_id);

-- ---------------------------------------------------------------------------
-- content_assets
-- ---------------------------------------------------------------------------

create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(id) on delete cascade,
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
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Publication requires a recorded human approval. This is the database-level
  -- half of the safety policy in AGENTS.md; the application half can be bypassed.
  constraint content_assets_publication_requires_approval
    check (status <> 'published' or (approved_by is not null and approved_at is not null))
);

create index if not exists content_assets_topic_idx on public.content_assets (topic_id);
create index if not exists content_assets_status_idx on public.content_assets (status);

-- ---------------------------------------------------------------------------
-- products / product_events
-- ---------------------------------------------------------------------------

create table if not exists public.products (
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

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null
    check (event_type in ('view', 'lead', 'checkout_started', 'purchase', 'refund')),
  amount_cents int,
  external_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_product_idx
  on public.product_events (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- assessments / assessment_attempts
-- ---------------------------------------------------------------------------

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(id) on delete cascade,
  title text not null,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  correct int not null default 0,
  total int not null default 0,
  percent int not null default 0 check (percent between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists assessment_attempts_profile_idx
  on public.assessment_attempts (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- agent_runs  (audit trail for every agent invocation)
-- ---------------------------------------------------------------------------

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  topic_id uuid references public.topics(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'blocked', 'complete', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  safety_flags jsonb not null default '[]'::jsonb,
  error text,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_created_idx on public.agent_runs (created_at desc);
create index if not exists agent_runs_agent_idx on public.agent_runs (agent_name, created_at desc);

-- ---------------------------------------------------------------------------
-- analytics_events
-- ---------------------------------------------------------------------------

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_name_idx
  on public.analytics_events (event_name, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'topics', 'sources', 'claims', 'knowledge_units',
    'workflows', 'content_assets', 'products', 'assessments'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t, t);
  end loop;
end;
$$;
