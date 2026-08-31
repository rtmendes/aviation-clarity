# Aviation Clarity™ Build Status

Last updated: 2026-08-30 (verification counts taken from a passing run of every suite)

## Completed
- [x] Repository provisioned: `rtmendes/aviation-clarity`
- [x] Product architecture defined
- [x] Master PRD and SOP defined
- [x] Progressive execution checklist established
- [x] Command Center UI scaffolded
- [x] Agent operating model defined
- [x] Aviation Explanation Engine concept defined
- [x] Database schema drafted
- [x] Content opportunity seed created
- [x] Environment-variable contract created
- [x] CI workflow scaffold created

## Completed since
- [x] Production build repaired (was failing on every deployment)
- [x] Toolchain pinned and lockfile committed
- [x] Persistent data access layer (`lib/repositories`)
- [x] Supabase schema with Row Level Security, verified against PostgreSQL
- [x] Read/write API routes for topics, sources and content assets
- [x] Health endpoint that performs a real database round trip
- [x] Agent-run audit trail, written on every explanation request
- [x] Automated verification for the schema and the API routes, wired into CI

## Phase 01 — generation core (complete)
- [x] Provider-agnostic `GenerationProvider` boundary; OpenAI implementation
- [x] Content-package JSON schema bound to structured outputs, re-validated on return
- [x] Versioned prompts (`PROMPT_VERSION`) recorded against every run
- [x] Token counts and cost recorded per run; cost only when prices are configured
- [x] Generated packages persisted to `knowledge_units`, never as `verified`
- [x] Safety gate runs on generated output, not on the request
- [x] Graceful `scaffold` mode when no provider is configured
- [x] 20 verification checks covering success and every provider failure mode

## Phase 02 — verification pipeline (complete)
- [x] `reviewers` table: credentialed humans, independent of auth.users
- [x] Claims linked to the knowledge unit that produced them
- [x] Trigger: a claim cannot be verified without a cited source
- [x] Trigger: a unit cannot be approved with unverified claims
- [x] `review_events` append-only decision log
- [x] 14 authoritative sources seeded, every URL verified to resolve
- [x] Review queue ordered by unverified risk
- [x] 58 API checks and 16 schema checks

## Phase 03 — design system and asset rendering (complete)
- [x] Design tokens as one source of truth, with a CI drift check
- [x] Deterministic PNG rendering via next/og — no new dependency, no browser
- [x] Cover, social card and printable worksheet templates
- [x] Review state rendered into the artwork; unknown state renders as draft
- [x] Fonts vendored (OFL) so renders need no network and are byte-stable
- [x] Storage buckets split by review state; publish means moving between them
      (both made private in 0006 — every read is a signed URL)
- [x] Template version, inputs and checksum required on any stored asset
- [x] 69 API checks and 22 schema checks

## Phase 04 — monetization (core complete)
- [x] Orders, entitlements and a Stripe event ledger
- [x] Webhook signature verification: raw body, constant time, replay window
- [x] Idempotent fulfilment — a retry cannot grant twice
- [x] Guest checkout; entitlement keyed to email, resolved on sign-in
- [x] Refunds revoke rather than delete
- [x] Supabase Auth session verification, server-side
- [x] Entitlement-gated content enforced in RLS
- [x] `authenticated` split into staff and customer (corrects a 0002 assumption)
- [x] 86 API checks, 39 schema checks, 13 signature checks
- [ ] Sign-in UI and a purchase page (no UI framework in place yet)

## Phase 05 — closing the gaps the full-system audit found (complete)
Running every phase together for the first time surfaced three seams that each
phase's own tests could not see.

- [x] The review band is derived from the database, not asserted by the caller.
      `?state=approved` alone had been enough to stamp REVIEWED & APPROVED on
      an emergency procedure nobody had read; `unitId` now decides the band, a
      caller can only ever ask for *less* trust, and an ignored request is named
      in the response headers rather than silently downgraded
- [x] Renders are stored: `POST /api/assets/{kind}` writes to the bucket the
      review state chooses, keyed by the SHA-256 of the bytes, with the template
      version and inputs recorded — so a re-render is the same object, not a
      duplicate
- [x] Purchased assets are deliverable: `GET /api/delivery/{assetId}` verifies
      the session, reads the entitlement at request time, and mints a 5-minute
      signed URL. A refund removes access on the next click
- [x] Storage RLS corrected — `assets-draft` was readable by any signed-in user,
      which stopped being staff-only once customers had accounts; the same
      assumption 0005 corrected in `public`, missed in `storage`
- [x] Database-level backstop: a content asset naming a knowledge unit cannot
      sit at `approved` while that unit is not
- [x] 115 API checks, 44 schema checks, 13 signature checks, 21 browser checks

## In progress
- [ ] Replace placeholder content seed with prioritized aviation-specific opportunity database
- [ ] Supabase Auth sessions in the UI (writes are token-gated in the interim)
- [ ] Agent execution API beyond the explanation engine
- [ ] RAG knowledge base over approved sources
- [ ] Aviation Explanation Engine interface
- [ ] Content-package generation pipeline
- [ ] Book-production pipeline

## Phase 06 — namespaced for the shared database (complete)
- [x] Discovered `supabase.insightprofit.live` is shared: 626 tables in `public`
      from other InsightProfit apps, three colliding by name with this project's
- [x] Every object namespaced `ac_` — tables, indexes, constraints, triggers,
      functions, policies — and buckets to `aviation-assets-*`
- [x] The `set_updated_at` trigger loop built its table names as strings, so the
      rename could not reach it; left as it was it would have attached this
      project's trigger to the billing app's `profiles`
- [x] `supabase/APPLY-ALL.sql`: the whole schema in one file for the SQL editor
- [x] Verified by applying it beside stand-ins for the three foreign tables and
      asserting their rows, columns, RLS, policies and triggers are unchanged
- [x] `docs/GO-LIVE.md` records the three steps that need dashboard access

## External provisioning
- [x] GitHub repository
- [x] Vercel project linked to repository — `prj_QZt1qE4ayYfAvhEnXskU8AcoFEqW`,
      auto-deploying `main`. Verified from the Vercel API; an earlier revision
      of these docs recorded this as missing, which was incorrect.
- [x] Self-hosted Supabase reachable — `https://supabase.insightprofit.live`,
      REST and Auth gateways confirmed responding over HTTPS
- [ ] Supabase schema applied to the instance — migrations written and tested
      locally; applying them needs database credentials
- [ ] Vercel environment variables set — keys and `OPENAI_API_KEY` are present;
      the Supabase URL is stored without its `https://` scheme and must be
      corrected, and `AVIATION_CLARITY_API_TOKEN` is not set
- [x] Production build succeeds — verified on preview deployments from this
      branch, the first successful builds in the project
- [ ] Production deployment succeeding
- [ ] OpenAI production API credential
- [ ] Stripe production account/configuration
- [ ] Production domain

## Operating rule
Never mark an external deployment or credential as complete unless it is verified from the connected service. Aviation technical, regulatory, medical, and safety-critical claims require authoritative-source verification and appropriate qualified review before operational use or publication.
