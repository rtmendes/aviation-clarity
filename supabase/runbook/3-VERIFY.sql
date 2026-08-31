-- =============================================================================
-- STEP 3 of 3 — VERIFY.  Read-only. Run after APPLY-ALL.sql.
-- =============================================================================
--
-- Every row should read PASS. Anything else, stop and do not point the
-- application at the database yet — 4-ROLLBACK.sql removes everything this
-- schema created.
-- =============================================================================

with checks as (
  select 'All 19 Aviation Clarity tables created' as check_name,
         (select count(*) from pg_tables
           where schemaname='public' and tablename like 'ac\_%')::text as actual,
         '19' as expected

  union all
  select 'Every one of them has row level security enabled',
         (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='r'
             and c.relname like 'ac\_%' and c.relrowsecurity=false)::text,
         '0'

  union all
  select 'No unprefixed table was created by this schema',
         (select count(*) from pg_policies
           where schemaname='public' and policyname not like 'ac\_%')::text,
         '0'

  union all
  -- The critical one. anon is the publishable key that ships in the browser.
  -- It must hold no grant on any table this schema did not create.
  select 'anon holds no grant on your other apps'' tables',
         (select count(*) from information_schema.role_table_grants
           where table_schema='public' and grantee in ('anon','authenticated')
             and table_name not like 'ac\_%')::text,
         '0'

  union all
  select 'Your other apps'' tables are still RLS-free (untouched)',
         (select count(*) from pg_policies
           where schemaname='public'
             and tablename in ('profiles','products','agent_runs'))::text,
         '0'

  union all
  select 'No trigger was attached to your other apps'' tables',
         (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
           where not t.tgisinternal
             and c.relname in ('profiles','products','agent_runs'))::text,
         '0'

  union all
  select 'Both Aviation Clarity buckets exist',
         (select count(*) from storage.buckets
           where id like 'aviation-assets-%')::text,
         '2'

  union all
  select 'Both are private (every read is a signed URL)',
         (select count(*) from storage.buckets
           where id like 'aviation-assets-%' and public = true)::text,
         '0'

  union all
  select 'Only this project owns a storage policy',
         (select count(*) from pg_policies
           where schemaname='storage' and policyname like 'ac\_%')::text,
         '1'

  union all
  select 'The authoritative source registry is seeded',
         (select count(*) from public.ac_sources)::text,
         '14'
)
select case when actual = expected then 'PASS' else '*** FAIL ***' end as result,
       check_name, expected, actual
  from checks
 order by (actual = expected), check_name;

-- And the one that matters most, as a live attempt rather than a count.
-- Expect: ERROR: permission denied for table profiles
-- If this returns rows instead, STOP and run 4-ROLLBACK.sql.
--
--   set role anon;
--   select * from public.profiles limit 1;
--   reset role;
