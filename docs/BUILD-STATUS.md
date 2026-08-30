# Aviation Clarity™ Build Status

Last updated: 2026-08-30 (infrastructure state verified against the live services)

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
- [x] Template version, inputs and checksum required on any stored asset
- [x] 69 API checks and 22 schema checks

## In progress
- [ ] Replace placeholder content seed with prioritized aviation-specific opportunity database
- [ ] Supabase Auth sessions in the UI (writes are token-gated in the interim)
- [ ] Agent execution API beyond the explanation engine
- [ ] RAG knowledge base over approved sources
- [ ] Aviation Explanation Engine interface
- [ ] Content-package generation pipeline
- [ ] Book-production pipeline

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
