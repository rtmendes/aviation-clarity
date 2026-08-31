-- =============================================================================
-- STEP 1 of 3 — PREFLIGHT.  Read-only. Changes nothing. Run this first.
-- =============================================================================
--
-- Answers three questions before you touch anything:
--   1. Has any of this been applied already?
--   2. What does the database look like now, so you can compare afterwards?
--   3. Is anything named in a way that would collide?
--
-- Copy the output somewhere. Step 3 compares against it.
-- =============================================================================

select 'Aviation Clarity objects already present (expect 0 on a first run)' as check,
       count(*)::text as value
  from pg_tables where schemaname = 'public' and tablename like 'ac\_%'

union all
select 'Total tables in public (your other apps)',
       count(*)::text from pg_tables where schemaname = 'public'

union all
select 'Aviation Clarity storage buckets (expect 0 on a first run)',
       count(*)::text from storage.buckets where id like 'aviation-assets-%'

union all
select 'Your other storage buckets',
       coalesce(string_agg(id, ', ' order by id), '(none)')
  from storage.buckets where id not like 'aviation-assets-%'

union all
-- The three names that collide. This schema no longer uses them, but knowing
-- their row counts now is what lets you prove afterwards that nothing moved.
select 'Row count: public.profiles (another app)',
       (select count(*)::text from public.profiles)

union all
select 'Row count: public.products (another app)',
       (select count(*)::text from public.products)

union all
select 'Row count: public.agent_runs (another app)',
       (select count(*)::text from public.agent_runs)

union all
select 'Tables in public WITHOUT row level security',
       count(*)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false

union all
-- If this is not 0, some other application already granted the browser-held
-- anon role blanket read. That is the same exposure this project just fixed in
-- its own migration, and it would be worth chasing down separately.
select 'Tables anon can already read (not caused by this schema)',
       count(distinct table_name)::text
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT';
