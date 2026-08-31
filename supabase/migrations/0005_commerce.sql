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
