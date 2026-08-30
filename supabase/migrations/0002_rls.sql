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
grant select on all tables in schema public to anon, authenticated;
grant insert on public.assessment_attempts to authenticated;
grant update (display_name) on public.profiles to authenticated;

alter table public.profiles           enable row level security;
alter table public.topics             enable row level security;
alter table public.sources            enable row level security;
alter table public.claims             enable row level security;
alter table public.claim_sources      enable row level security;
alter table public.knowledge_units    enable row level security;
alter table public.workflows          enable row level security;
alter table public.content_assets     enable row level security;
alter table public.products           enable row level security;
alter table public.product_events     enable row level security;
alter table public.assessments        enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.agent_runs         enable row level security;
alter table public.analytics_events   enable row level security;

-- profiles ------------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- topics --------------------------------------------------------------------

drop policy if exists topics_select_published on public.topics;
create policy topics_select_published on public.topics
  for select to anon
  using (status = 'published');

drop policy if exists topics_select_authenticated on public.topics;
create policy topics_select_authenticated on public.topics
  for select to authenticated
  using (true);

-- sources / claims ----------------------------------------------------------
-- Sources are the citation trail behind published material, so they are
-- readable anonymously. Claims are not: an unverified claim must never be
-- reachable by a public client.

drop policy if exists sources_select_all on public.sources;
create policy sources_select_all on public.sources
  for select to anon, authenticated
  using (true);

drop policy if exists claims_select_verified on public.claims;
create policy claims_select_verified on public.claims
  for select to anon
  using (verified = true);

drop policy if exists claims_select_authenticated on public.claims;
create policy claims_select_authenticated on public.claims
  for select to authenticated
  using (true);

drop policy if exists claim_sources_select on public.claim_sources;
create policy claim_sources_select on public.claim_sources
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.claims c
      where c.id = claim_sources.claim_id
        and (c.verified = true or (select auth.role()) = 'authenticated')
    )
  );

-- knowledge_units -----------------------------------------------------------

drop policy if exists knowledge_units_select_approved on public.knowledge_units;
create policy knowledge_units_select_approved on public.knowledge_units
  for select to anon
  using (status = 'approved');

drop policy if exists knowledge_units_select_authenticated on public.knowledge_units;
create policy knowledge_units_select_authenticated on public.knowledge_units
  for select to authenticated
  using (true);

-- workflows -----------------------------------------------------------------
-- Internal production state. No anonymous access.

drop policy if exists workflows_select_authenticated on public.workflows;
create policy workflows_select_authenticated on public.workflows
  for select to authenticated
  using (true);

-- content_assets ------------------------------------------------------------

drop policy if exists content_assets_select_published on public.content_assets;
create policy content_assets_select_published on public.content_assets
  for select to anon
  using (status = 'published');

drop policy if exists content_assets_select_authenticated on public.content_assets;
create policy content_assets_select_authenticated on public.content_assets
  for select to authenticated
  using (true);

-- products ------------------------------------------------------------------

drop policy if exists products_select_live on public.products;
create policy products_select_live on public.products
  for select to anon
  using (status = 'live');

drop policy if exists products_select_authenticated on public.products;
create policy products_select_authenticated on public.products
  for select to authenticated
  using (true);

-- product_events ------------------------------------------------------------
-- Revenue data. Readable only for one's own events; written server-side.

drop policy if exists product_events_select_own on public.product_events;
create policy product_events_select_own on public.product_events
  for select to authenticated
  using (profile_id = (select auth.uid()));

-- assessments / attempts ----------------------------------------------------

drop policy if exists assessments_select_all on public.assessments;
create policy assessments_select_all on public.assessments
  for select to anon, authenticated
  using (true);

drop policy if exists assessment_attempts_select_own on public.assessment_attempts;
create policy assessment_attempts_select_own on public.assessment_attempts
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists assessment_attempts_insert_own on public.assessment_attempts;
create policy assessment_attempts_insert_own on public.assessment_attempts
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

-- agent_runs / analytics_events ---------------------------------------------
-- Operational audit trail. Server-side (service_role) writes only; no policy
-- is granted to anon or authenticated, so RLS denies all client access.

drop policy if exists agent_runs_select_authenticated on public.agent_runs;
create policy agent_runs_select_authenticated on public.agent_runs
  for select to authenticated
  using (true);
