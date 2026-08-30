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

create table if not exists public.stripe_events (
  /* Stripe's own event id. Primary key, so a retry collides by construction. */
  id text primary key,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now()
);

create index if not exists stripe_events_unprocessed_idx
  on public.stripe_events (received_at desc)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete restrict,
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
  constraint orders_paid_has_payment
    check (status <> 'paid' or stripe_payment_intent is not null)
);

create index if not exists orders_email_idx on public.orders (lower(email), created_at desc);

-- ---------------------------------------------------------------------------
-- entitlements
-- ---------------------------------------------------------------------------

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  /* Lower-cased on write; the citext extension is not guaranteed present on a
     self-hosted instance, so case-folding is done explicitly. */
  email text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  /* Linked when the buyer first signs in. Null until then, which is the normal
     state for a guest checkout. */
  profile_id uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  /* Set rather than deleted on refund, so the history survives. */
  revoked_at timestamptz,
  revoked_reason text
);

create unique index if not exists entitlements_unique_grant
  on public.entitlements (email, product_id)
  where revoked_at is null;

create index if not exists entitlements_email_idx on public.entitlements (email);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.stripe_events enable row level security;
alter table public.orders        enable row level security;
alter table public.entitlements  enable row level security;

grant select on public.orders, public.entitlements to authenticated;

/*
 * The email on the caller's JWT, lower-cased.
 *
 * This is what ties a guest purchase to a signed-in session: Checkout captured
 * the email, and Supabase Auth puts the verified email on the token.
 */
create or replace function public.current_email()
returns text
language sql
stable
as $$
  select lower(nullif(current_setting('request.jwt.claim.email', true), ''))
$$;

drop policy if exists entitlements_select_own on public.entitlements;
create policy entitlements_select_own on public.entitlements
  for select to authenticated
  using (email = public.current_email());

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated
  using (lower(email) = public.current_email());

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

alter table public.content_assets
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists content_assets_product_idx on public.content_assets (product_id);

drop policy if exists content_assets_select_entitled on public.content_assets;
create policy content_assets_select_entitled on public.content_assets
  for select to authenticated
  using (
    product_id is not null
    and exists (
      select 1
        from public.entitlements e
       where e.product_id = content_assets.product_id
         and e.revoked_at is null
         and e.email = public.current_email()
    )
  );

drop trigger if exists set_updated_at on public.orders;
create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

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

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role in ('instructor', 'reviewer', 'admin')
  )
$$;

-- Internal working state: staff only.
drop policy if exists topics_select_authenticated on public.topics;
create policy topics_select_authenticated on public.topics
  for select to authenticated using (public.is_staff());

drop policy if exists claims_select_authenticated on public.claims;
create policy claims_select_authenticated on public.claims
  for select to authenticated using (public.is_staff());

drop policy if exists knowledge_units_select_authenticated on public.knowledge_units;
create policy knowledge_units_select_authenticated on public.knowledge_units
  for select to authenticated using (public.is_staff());

drop policy if exists workflows_select_authenticated on public.workflows;
create policy workflows_select_authenticated on public.workflows
  for select to authenticated using (public.is_staff());

drop policy if exists content_assets_select_authenticated on public.content_assets;
create policy content_assets_select_authenticated on public.content_assets
  for select to authenticated using (public.is_staff());

drop policy if exists products_select_authenticated on public.products;
create policy products_select_authenticated on public.products
  for select to authenticated using (public.is_staff());

drop policy if exists agent_runs_select_authenticated on public.agent_runs;
create policy agent_runs_select_authenticated on public.agent_runs
  for select to authenticated using (public.is_staff());

drop policy if exists reviewers_select_authenticated on public.reviewers;
create policy reviewers_select_authenticated on public.reviewers
  for select to authenticated using (public.is_staff());

drop policy if exists review_events_select_authenticated on public.review_events;
create policy review_events_select_authenticated on public.review_events
  for select to authenticated using (public.is_staff());

-- Public-facing rows were scoped `to anon` alone, which meant a signed-in
-- customer — role `authenticated`, not `anon` — lost access to published
-- content the moment they logged in. They now cover both roles.
drop policy if exists topics_select_published on public.topics;
create policy topics_select_published on public.topics
  for select to anon, authenticated using (status = 'published');

drop policy if exists knowledge_units_select_approved on public.knowledge_units;
create policy knowledge_units_select_approved on public.knowledge_units
  for select to anon, authenticated using (status = 'approved');

drop policy if exists content_assets_select_published on public.content_assets;
create policy content_assets_select_published on public.content_assets
  for select to anon, authenticated
  using (status = 'published' and product_id is null);

drop policy if exists products_select_live on public.products;
create policy products_select_live on public.products
  for select to anon, authenticated using (status = 'live');

drop policy if exists claims_select_verified on public.claims;
create policy claims_select_verified on public.claims
  for select to anon, authenticated using (verified = true);
