-- =============================================================================
-- ROLLBACK — removes everything APPLY-ALL.sql created, and nothing else.
-- =============================================================================
--
-- Only needed if 3-VERIFY.sql reports a failure, or you want the schema gone.
--
-- THIS DELETES AVIATION CLARITY DATA. Every knowledge unit, review decision,
-- order and entitlement goes with the tables. On a fresh install that is
-- nothing; after the application has been running it is not. Take the snapshot
-- first either way.
--
-- It names only `ac_`-prefixed objects and the two `aviation-assets-*` buckets.
--
-- One honest caveat about `cascade`: dropping a table also drops anything that
-- depends on it, and that includes objects another application might have built
-- ON one of these tables — a view, most plausibly. Nothing can drop a table
-- while a view selects from it, so this is unavoidable rather than a flaw; what
-- would be a flaw is doing it silently. The guard below therefore refuses to
-- run if any object outside this project depends on these tables, and names
-- them, so the decision is yours rather than the script's.
-- =============================================================================

-- Refuse rather than cascade into someone else's object.
do $$
declare
  dependents text;
begin
  select string_agg(distinct dependent, ', ')
    into dependents
    from (
      select case cl.relkind when 'v' then 'view ' when 'm' then 'materialised view '
                             when 'r' then 'table ' else 'object ' end
             || cl.relnamespace::regnamespace || '.' || cl.relname as dependent
        from pg_depend d
        join pg_rewrite rw on rw.oid = d.objid
        join pg_class cl on cl.oid = rw.ev_class
        join pg_class ref on ref.oid = d.refobjid
        join pg_namespace refn on refn.oid = ref.relnamespace
       where refn.nspname = 'public'
         and ref.relname like 'ac\_%'
         and cl.relname not like 'ac\_%'
      union
      select 'table ' || con.conrelid::regclass::text
        from pg_constraint con
        join pg_class ref on ref.oid = con.confrelid
        join pg_namespace refn on refn.oid = ref.relnamespace
       where con.contype = 'f'
         and refn.nspname = 'public'
         and ref.relname like 'ac\_%'
         and con.conrelid::regclass::text not like '%ac\_%'
    ) x;

  if dependents is not null then
    raise exception
      'Refusing to roll back: % depends on this schema. Dropping with cascade would take it too. Remove or repoint it first, then re-run.',
      dependents;
  end if;
end;
$$;

-- Storage first: objects reference buckets, so they go before them.
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists ac_assets_read_staff on storage.objects';
    execute 'drop policy if exists ac_assets_draft_read_authenticated on storage.objects';
    execute 'drop policy if exists ac_assets_approved_read_public on storage.objects';
    delete from storage.objects where bucket_id in ('aviation-assets-draft', 'aviation-assets-approved');
  end if;
  if to_regclass('storage.buckets') is not null then
    delete from storage.buckets where id in ('aviation-assets-draft', 'aviation-assets-approved');
  end if;
end;
$$;

-- Tables. `cascade` clears their own policies, triggers, indexes and the
-- foreign keys between them.
drop table if exists public.ac_claim_sources     cascade;
drop table if exists public.ac_review_events     cascade;
drop table if exists public.ac_claims            cascade;
drop table if exists public.ac_reviewers         cascade;
drop table if exists public.ac_entitlements      cascade;
drop table if exists public.ac_orders            cascade;
drop table if exists public.ac_stripe_events     cascade;
drop table if exists public.ac_content_assets    cascade;
drop table if exists public.ac_knowledge_units   cascade;
drop table if exists public.ac_assessment_attempts cascade;
drop table if exists public.ac_assessments       cascade;
drop table if exists public.ac_product_events    cascade;
drop table if exists public.ac_products          cascade;
drop table if exists public.ac_workflows         cascade;
drop table if exists public.ac_agent_runs        cascade;
drop table if exists public.ac_analytics_events  cascade;
drop table if exists public.ac_topics            cascade;
drop table if exists public.ac_sources           cascade;
drop table if exists public.ac_profiles          cascade;

-- Functions. Named individually so a same-named function belonging to another
-- application could never be caught by a pattern match.
drop function if exists public.ac_set_updated_at()                cascade;
drop function if exists public.ac_is_staff()                      cascade;
drop function if exists public.ac_current_email()                 cascade;
drop function if exists public.ac_claim_requires_citation()       cascade;
drop function if exists public.ac_unit_requires_verified_claims() cascade;
drop function if exists public.ac_assert_asset_not_overclaiming() cascade;

-- pgcrypto is deliberately left installed: it predates this schema on any real
-- Supabase instance, and other applications will be using it.

-- Confirm. Both should read 0.
select 'Aviation Clarity tables remaining' as check, count(*)::text as value
  from pg_tables where schemaname='public' and tablename like 'ac\_%'
union all
select 'Aviation Clarity buckets remaining',
       (select count(*)::text from storage.buckets where id like 'aviation-assets-%');
