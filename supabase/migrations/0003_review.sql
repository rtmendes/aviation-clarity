-- Aviation Clarity — verification and review (Phase 02)
--
-- Apply after 0002_rls.sql:
--   psql "$POSTGRES_URL" -f supabase/migrations/0003_review.sql
--
-- This migration adds the gate that turns generated content into content that
-- can be published or sold. Generation is cheap; what makes aviation training
-- material safe to put in front of a student is that a qualified human checked
-- its claims against authoritative sources and signed their name to it.
--
-- Two invariants are enforced here rather than in application code, because
-- anything holding the Supabase secret key can bypass application code:
--   * a claim cannot be marked verified without a source backing it;
--   * a knowledge unit cannot be approved while any of its claims is unverified.

-- ---------------------------------------------------------------------------
-- reviewers
-- ---------------------------------------------------------------------------
--
-- Deliberately not `profiles`. A profile is keyed to auth.users, so no profile
-- can exist until Supabase Auth is wired in (Phase 04) — and review has to work
-- before then. It is also the better model on its own terms: for aviation
-- content, what matters on an approval is which credentialed person signed it,
-- not which account was logged in. Phase 04 links the two via profile_id
-- without disturbing anything recorded before it.

create table if not exists public.reviewers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  /* The credential that makes this person's sign-off meaningful. */
  credential text not null
    check (credential in ('CFI', 'CFII', 'MEI', 'ATP', 'DPE', 'AME', 'A&P', 'IA', 'editorial')),
  /* Certificate number or equivalent, so an approval is traceable off-system. */
  credential_ref text,
  profile_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reviewers_active_idx on public.reviewers (active, credential);

-- ---------------------------------------------------------------------------
-- sources: one row per document
-- ---------------------------------------------------------------------------
-- A citation registry that holds the same document twice cites it two ways.

create unique index if not exists sources_url_key on public.sources (url);

-- ---------------------------------------------------------------------------
-- claims: attach to the unit they came from, and to a credentialed reviewer
-- ---------------------------------------------------------------------------

alter table public.claims
  add column if not exists knowledge_unit_id uuid
    references public.knowledge_units(id) on delete cascade;

alter table public.claims
  add column if not exists reviewer_id uuid
    references public.reviewers(id) on delete restrict;

alter table public.claims
  add column if not exists review_note text;

create index if not exists claims_unit_idx on public.claims (knowledge_unit_id);
create index if not exists claims_unverified_idx on public.claims (verified, risk desc);

-- Attribution may now come from a reviewer as well as a profile; 0001 knew
-- only about profiles.
alter table public.claims drop constraint if exists claims_verification_is_attributable;
alter table public.claims add constraint claims_verification_is_attributable
  check (
    verified = false
    or (verified_at is not null and (verified_by is not null or reviewer_id is not null))
  );

-- ---------------------------------------------------------------------------
-- A verified claim must cite a source
-- ---------------------------------------------------------------------------
--
-- The citation lives in claim_sources, so this cannot be a row-level CHECK.
-- Enforced as a constraint trigger deferred to commit time, which lets a
-- transaction insert the claim_sources rows and flip `verified` in either
-- order — only the state at commit has to be sound.

create or replace function public.claim_requires_citation()
returns trigger
language plpgsql
as $$
begin
  if new.verified = true
     and not exists (select 1 from public.claim_sources cs where cs.claim_id = new.id)
  then
    raise exception
      'claim % cannot be verified without at least one cited source', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists claims_require_citation on public.claims;
create constraint trigger claims_require_citation
  after insert or update on public.claims
  deferrable initially deferred
  for each row execute function public.claim_requires_citation();

-- ---------------------------------------------------------------------------
-- knowledge_units: approval, gated on its claims
-- ---------------------------------------------------------------------------

alter table public.knowledge_units
  add column if not exists approved_by uuid
    references public.reviewers(id) on delete restrict;

alter table public.knowledge_units
  add column if not exists approved_at timestamptz;

alter table public.knowledge_units drop constraint if exists knowledge_units_approval_is_attributable;
alter table public.knowledge_units add constraint knowledge_units_approval_is_attributable
  check (status <> 'approved' or (approved_by is not null and approved_at is not null));

create or replace function public.unit_requires_verified_claims()
returns trigger
language plpgsql
as $$
declare
  unverified int;
begin
  if new.status = 'approved' then
    select count(*) into unverified
      from public.claims c
     where c.knowledge_unit_id = new.id
       and c.verified = false;

    if unverified > 0 then
      raise exception
        'knowledge unit % cannot be approved: % claim(s) still unverified', new.id, unverified
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists knowledge_units_require_verified_claims on public.knowledge_units;
create constraint trigger knowledge_units_require_verified_claims
  after insert or update on public.knowledge_units
  deferrable initially deferred
  for each row execute function public.unit_requires_verified_claims();

-- ---------------------------------------------------------------------------
-- review_events — an append-only record of human decisions
-- ---------------------------------------------------------------------------
--
-- The columns above hold current state; this holds how it got there. In a
-- safety-critical domain the sequence of decisions is itself evidence, and
-- state columns are overwritten by the next decision.

create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid references public.reviewers(id) on delete set null,
  entity_type text not null check (entity_type in ('claim', 'knowledge_unit', 'content_asset')),
  entity_id uuid not null,
  action text not null check (action in ('verified', 'rejected', 'approved', 'reopened')),
  note text,
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists review_events_entity_idx
  on public.review_events (entity_type, entity_id, created_at desc);

drop trigger if exists set_updated_at on public.reviewers;
create trigger set_updated_at before update on public.reviewers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security for the new tables
-- ---------------------------------------------------------------------------
--
-- Review state is internal. Anonymous callers get nothing here; the review
-- endpoints run server-side with the secret key.

alter table public.reviewers     enable row level security;
alter table public.review_events enable row level security;

grant select on public.reviewers, public.review_events to authenticated;

drop policy if exists reviewers_select_authenticated on public.reviewers;
create policy reviewers_select_authenticated on public.reviewers
  for select to authenticated
  using (true);

drop policy if exists review_events_select_authenticated on public.review_events;
create policy review_events_select_authenticated on public.review_events
  for select to authenticated
  using (true);
