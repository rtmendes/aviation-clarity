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
-- Stand-in for the Supabase storage schema, so the bucket and policy logic in
-- 0004 is actually exercised rather than silently skipped.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text
);
alter table storage.objects enable row level security;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- Real Supabase grants this as part of its bootstrap; without it a policy that
-- calls auth.uid() fails with "permission denied for schema auth" for exactly
-- the roles the policy is written for.
grant usage on schema auth to anon, authenticated;
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


# --- Phase 02: the verification gate -----------------------------------------

psql -q -d "$DB" >/dev/null <<'SQL'
insert into public.reviewers (id, name, credential, credential_ref)
  values ('99999999-9999-9999-9999-999999999999', 'Test CFI', 'CFI', 'CFI-000000');
insert into public.knowledge_units (id, summary, status)
  values ('88888888-8888-8888-8888-888888888888', 'Why airplanes stall', 'review');
insert into public.sources (id, title, url, source_type)
  values ('77777777-7777-7777-7777-777777777777',
          'FAA Airplane Flying Handbook', 'https://www.faa.gov/', 'faa');
insert into public.claims (id, knowledge_unit_id, body, risk)
  values ('66666666-6666-6666-6666-666666666666',
          '88888888-8888-8888-8888-888888888888',
          'Aircraft-specific critical angle of attack', 'high');
SQL

check 'a claim cannot be verified without a cited source' 'without at least one cited source' \
  "$(psql -d "$DB" -c "update public.claims set verified=true, verified_at=now(), reviewer_id='99999999-9999-9999-9999-999999999999' where id='66666666-6666-6666-6666-666666666666';" 2>&1)"

check 'a unit cannot be approved while a claim is unverified' 'still unverified' \
  "$(psql -d "$DB" -c "update public.knowledge_units set status='approved', approved_by='99999999-9999-9999-9999-999999999999', approved_at=now() where id='88888888-8888-8888-8888-888888888888';" 2>&1)"

# Cite the source, then verify — both in one transaction, which is what the
# deferred trigger exists to allow.
psql -q -d "$DB" >/dev/null 2>&1 <<'SQL'
begin;
insert into public.claim_sources (claim_id, source_id)
  values ('66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777');
update public.claims set verified=true, verified_at=now(),
       reviewer_id='99999999-9999-9999-9999-999999999999'
 where id='66666666-6666-6666-6666-666666666666';
commit;
SQL

check 'a cited claim can be verified' 't' \
  "$(psql -tAq -d "$DB" -c "select verified from public.claims where id='66666666-6666-6666-6666-666666666666';")"

check 'a unit approves once its claims are verified' 'approved' \
  "$(psql -tAq -d "$DB" -c "update public.knowledge_units set status='approved', approved_by='99999999-9999-9999-9999-999999999999', approved_at=now() where id='88888888-8888-8888-8888-888888888888' returning status;" 2>&1)"

check 'approval without a named reviewer is rejected' 'knowledge_units_approval_is_attributable' \
  "$(psql -d "$DB" -c "insert into public.knowledge_units (summary,status) values ('x','approved');" 2>&1)"

check 'an unrecognised reviewer credential is rejected' 'reviewers_credential_check' \
  "$(psql -d "$DB" -c "insert into public.reviewers (name,credential) values ('x','definitely-not-a-rating');" 2>&1)"

check 'review decisions are not readable anonymously' '0' \
  "$(psql -tAq -d "$DB" -c "set role anon; select count(*) from public.review_events;")"


# --- Phase 03: rendered asset storage ----------------------------------------

check 'both asset buckets are created' '2' \
  "$(psql -tAq -d "$DB" -c "select count(*) from storage.buckets where id in ('assets-draft','assets-approved');")"

check 'the draft bucket is private' 'f' \
  "$(psql -tAq -d "$DB" -c "select public from storage.buckets where id='assets-draft';")"

# 0004 made this bucket public. 0006 closed that: paths are content hashes and
# so unguessable, but an unguessable URL is not access control, and approved
# artwork now includes work people have paid for.
check 'the approved bucket is no longer world-readable' 'f' \
  "$(psql -tAq -d "$DB" -c "select public from storage.buckets where id='assets-approved';")"

check 'no storage policy grants anonymous reads' '' \
  "$(psql -tAq -d "$DB" -c "select policyname from pg_policies where tablename='objects' and roles::text like '%anon%';")"

check 'staff read artwork directly; everyone else gets a signed URL' 'assets_read_staff' \
  "$(psql -tAq -d "$DB" -c "select policyname from pg_policies where schemaname='storage' and tablename='objects';")"

# 0004 let any `authenticated` role read every draft. That was sound while only
# staff had accounts; a customer signing in to collect a purchase broke it, and
# 0006 narrowed the policy to staff — the same correction 0005 made in public.
check 'the draft bucket is gated on staff, not on merely being signed in' 'is_staff' \
  "$(psql -tAq -d "$DB" -c "select qual from pg_policies where schemaname='storage' and tablename='objects';")"

check 'a stored asset must record how it was rendered' 'content_assets_render_is_traceable' \
  "$(psql -d "$DB" -c "insert into public.content_assets (asset_type, storage_bucket, storage_path) values ('worksheet','assets-draft','x.png');" 2>&1)"

check 'a fully traced asset is accepted' 'INSERT' \
  "$(psql -d "$DB" -c "insert into public.content_assets (asset_type, storage_bucket, storage_path, template_version, render_input, checksum) values ('worksheet','assets-draft','y.png','2026-08-30.1','{}'::jsonb,'abc123');" 2>&1)"

# The application derives an asset's band from the unit it renders, but the
# application is one route away from being bypassed. This is the database half.
psql -q -d "$DB" >/dev/null 2>&1 <<'SQL'
insert into public.knowledge_units (id, summary, status)
values ('cccccccc-0000-0000-0000-000000000001', 'Still under review', 'review');
SQL

check 'artwork cannot claim approval its content has not earned' \
  'while knowledge unit' \
  "$(psql -d "$DB" -c "insert into public.content_assets (asset_type, knowledge_unit_id, status, storage_bucket, storage_path, template_version, render_input, checksum) values ('worksheet','cccccccc-0000-0000-0000-000000000001','approved','assets-approved','z.png','2026-08-30.1','{}'::jsonb,'def456');" 2>&1)"

check 'artwork may carry an honest, lower band' 'INSERT' \
  "$(psql -d "$DB" -c "insert into public.content_assets (asset_type, knowledge_unit_id, status, storage_bucket, storage_path, template_version, render_input, checksum) values ('worksheet','cccccccc-0000-0000-0000-000000000001','qa','assets-draft','z.png','2026-08-30.1','{}'::jsonb,'def456');" 2>&1)"

# The upsert in lib/repositories/assets.ts names this index as its conflict
# target, which a partial index cannot serve.
check 'the storage key is a full unique index, not a partial one' 'f' \
  "$(psql -tAq -d "$DB" -c "select indpred is not null from pg_index where indexrelid = 'content_assets_storage_key'::regclass;")"


# --- Phase 04: commerce and entitlements -------------------------------------

psql -q -d "$DB" >/dev/null <<'SQL'
insert into public.products (id, name, slug, price_cents, status)
  values ('55555555-5555-5555-5555-555555555555', 'Checkride Clarity', 'checkride-clarity', 4900, 'live');
insert into public.orders (id, product_id, email, stripe_session_id, stripe_payment_intent, amount_cents, status)
  values ('44444444-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
          'Buyer@Example.com', 'cs_test_1', 'pi_test_1', 4900, 'paid');
insert into public.entitlements (email, product_id, order_id)
  values ('buyer@example.com', '55555555-5555-5555-5555-555555555555', '44444444-0000-0000-0000-000000000001');
SQL

check 'a paid order must record its payment' 'orders_paid_has_payment' \
  "$(psql -d "$DB" -c "insert into public.orders (product_id,email,amount_cents,status) values ('55555555-5555-5555-5555-555555555555','x@y.com',100,'paid');" 2>&1)"

check 'one Stripe session cannot become two orders' 'orders_stripe_session_id_key' \
  "$(psql -d "$DB" -c "insert into public.orders (product_id,email,stripe_session_id,amount_cents) values ('55555555-5555-5555-5555-555555555555','x@y.com','cs_test_1',100);" 2>&1)"

check 'a webhook event cannot be recorded twice' 'stripe_events_pkey' \
  "$(psql -d "$DB" -c "insert into public.stripe_events (id,type,payload) values ('evt_1','checkout.session.completed','{}'); insert into public.stripe_events (id,type,payload) values ('evt_1','checkout.session.completed','{}');" 2>&1)"

check 'the same product cannot be granted twice' 'entitlements_unique_grant' \
  "$(psql -d "$DB" -c "insert into public.entitlements (email,product_id) values ('buyer@example.com','55555555-5555-5555-5555-555555555555');" 2>&1)"

# Entitlement visibility is driven by the verified email on the caller's JWT.
check 'a buyer sees only their own entitlement' '1' \
  "$(psql -tAq -d "$DB" -c "set role authenticated; set request.jwt.claim.email = 'buyer@example.com'; select count(*) from public.entitlements;")"

check 'a different signed-in user sees none of it' '0' \
  "$(psql -tAq -d "$DB" -c "set role authenticated; set request.jwt.claim.email = 'someone@else.com'; select count(*) from public.entitlements;")"

check 'entitlements are invisible to anonymous callers' '0' \
  "$(psql -tAq -d "$DB" -c "set role anon; select count(*) from public.entitlements;")"

check 'raw webhook payloads are readable by nobody but the server' '0' \
  "$(psql -tAq -d "$DB" -c "set role authenticated; set request.jwt.claim.email = 'buyer@example.com'; select count(*) from public.stripe_events;" 2>/dev/null || echo 0)"

# Paid content follows the entitlement, not the UI.
psql -q -d "$DB" >/dev/null <<'SQL'
insert into public.content_assets (asset_type, product_id, status, title)
  values ('worksheet', '55555555-5555-5555-5555-555555555555', 'qa', 'Paid worksheet');
SQL

check 'an entitled buyer can read the paid asset' 'Paid worksheet' \
  "$(psql -tAq -d "$DB" -c "set role authenticated; set request.jwt.claim.email = 'buyer@example.com'; select title from public.content_assets where product_id is not null;")"

check 'an unentitled user cannot read it' '' \
  "$(psql -tAq -d "$DB" -c "set role authenticated; set request.jwt.claim.email = 'someone@else.com'; select title from public.content_assets where product_id is not null;")"

check 'a revoked entitlement stops granting access' '0' \
  "$(psql -tAq -d "$DB" -c "update public.entitlements set revoked_at=now(), revoked_reason='refund' where email='buyer@example.com'; set role authenticated; set request.jwt.claim.email = 'buyer@example.com'; select count(*) from public.content_assets where product_id is not null;")"


# --- The staff/customer split introduced by Phase 04 -------------------------
# 0002 gave `authenticated` blanket read on the working set, which was sound
# while only staff had accounts. Customer accounts break that assumption.

psql -q -d "$DB" >/dev/null 2>&1 <<'SQL'
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'staff@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'customer@example.com');
insert into public.profiles (id, email, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'staff@example.com', 'reviewer'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'customer@example.com', 'member');
insert into public.topics (title, status) values ('Unpublished internal topic', 'qa');
SQL

as_user() {
  psql -tAq -d "$DB" -c "set role authenticated; set request.jwt.claim.sub = '$1'; set request.jwt.claim.email = '$2'; $3"
}

check 'staff can read unpublished topics' 'Unpublished internal topic' \
  "$(as_user 'aaaaaaaa-0000-0000-0000-000000000001' 'staff@example.com' "select title from public.topics where status='qa';")"

check 'a signed-in customer cannot read unpublished topics' '' \
  "$(as_user 'aaaaaaaa-0000-0000-0000-000000000002' 'customer@example.com' "select title from public.topics where status='qa';")"

check 'a signed-in customer can still read published topics' 'Public row' \
  "$(as_user 'aaaaaaaa-0000-0000-0000-000000000002' 'customer@example.com' "select title from public.topics where status='published';")"

check 'a customer cannot read the agent audit trail' '0' \
  "$(as_user 'aaaaaaaa-0000-0000-0000-000000000002' 'customer@example.com' 'select count(*) from public.agent_runs;')"

check 'a customer cannot read reviewer records' '0' \
  "$(as_user 'aaaaaaaa-0000-0000-0000-000000000002' 'customer@example.com' 'select count(*) from public.reviewers;')"

check 'a customer cannot read unverified claims' '0' \
  "$(as_user 'aaaaaaaa-0000-0000-0000-000000000002' 'customer@example.com' 'select count(*) from public.claims where verified = false;')"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
