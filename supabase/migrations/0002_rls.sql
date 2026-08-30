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
