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
--
-- The row counts go through query_to_xml rather than a plain `select count(*)`
-- because a plain one names the table at parse time: on any instance where a
-- neighbour table is absent the whole script would abort with "relation does
-- not exist", and an operator has no way to tell that apart from a real fault.
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
       case when to_regclass('public.profiles') is null then '(no such table here)'
            else (xpath('/row/c/text()',
                    query_to_xml('select count(*) as c from public.profiles',
                                 false, true, '')))[1]::text end

union all
select 'Row count: public.products (another app)',
       case when to_regclass('public.products') is null then '(no such table here)'
            else (xpath('/row/c/text()',
                    query_to_xml('select count(*) as c from public.products',
                                 false, true, '')))[1]::text end

union all
select 'Row count: public.agent_runs (another app)',
       case when to_regclass('public.agent_runs') is null then '(no such table here)'
            else (xpath('/row/c/text()',
                    query_to_xml('select count(*) as c from public.agent_runs',
                                 false, true, '')))[1]::text end

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
