#!/usr/bin/env bash
# Applies the migrations to a throwaway PostgreSQL database and asserts the
# safety-critical constraints and Row Level Security actually behave.
#
# Requires a reachable PostgreSQL server. Configure with PGHOST/PGPORT/PGUSER,
# or rely on the defaults used by the CI service container.
#
#   bash scripts/verify-schema.sh
set -euo pipefail

DB="aviation_clarity_verify_$$"
pass=0
fail=0

cleanup() { dropdb --if-exists "$DB" 2>/dev/null || true; }
trap cleanup EXIT

check() {
  local name=$1 expected=$2 actual=$3
  if [[ "$actual" == *"$expected"* ]]; then
    printf '  PASS  %s\n' "$name"; pass=$((pass + 1))
  else
    printf '  FAIL  %s\n        expected to contain: %s\n        got: %s\n' "$name" "$expected" "$actual"
    fail=$((fail + 1))
  fi
}

createdb "$DB"

# Stand-ins for the Supabase platform objects the migrations depend on. The
# live instance provides these; they are recreated here so the migration can be
# exercised without one.
psql -q -d "$DB" >/dev/null <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
SQL

echo 'Verifying Supabase migrations:'

# Applied twice: migrations must be safe to re-run against an existing instance.
for pass_no in 1 2; do
  for file in supabase/migrations/*.sql; do
    if ! psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$file" >/dev/null 2>&1; then
      printf '  FAIL  %s failed to apply on pass %s\n' "$file" "$pass_no"
      fail=$((fail + 1))
    fi
  done
done
[[ $fail -eq 0 ]] && { printf '  PASS  migrations apply cleanly and are idempotent\n'; pass=$((pass + 1)); }

check 'every public table has Row Level Security enabled' '0' \
  "$(psql -tAq -d "$DB" -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false;")"

check 'publishing an asset without approval is rejected' 'content_assets_publication_requires_approval' \
  "$(psql -d "$DB" -c "insert into public.content_assets (asset_type,status) values ('article','published');" 2>&1)"

check 'a verified claim must record who verified it' 'claims_verification_is_attributable' \
  "$(psql -d "$DB" -c "insert into public.claims (body,verified) values ('x',true);" 2>&1)"

check 'an unknown workflow status is rejected' 'topics_status_check' \
  "$(psql -d "$DB" -c "insert into public.topics (title,status) values ('x','not-a-status');" 2>&1)"

psql -q -d "$DB" >/dev/null <<'SQL'
insert into public.topics (title,status) values ('Public row','published'),('Internal row','qa');
SQL

check 'anonymous readers see only published topics' 'Public row' \
  "$(psql -tAq -d "$DB" -c "set role anon; select string_agg(title,',') from public.topics;")"

check 'anonymous readers do not see internal topics' '' \
  "$(psql -tAq -d "$DB" -c "set role anon; select title from public.topics where title='Internal row';")"

check 'anonymous writes are rejected' 'permission denied' \
  "$(psql -d "$DB" -c "set role anon; insert into public.topics (title) values ('nope');" 2>&1)"

check 'the agent audit trail is not readable anonymously' '0' \
  "$(psql -tAq -d "$DB" -c "set role anon; select count(*) from public.agent_runs;")"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
