# Aviation Clarity™ Progressive Build Checklist

Last updated: 2026-08-30

## Foundation
- [x] Product thesis
- [x] Brand architecture
- [x] Four book ecosystems
- [x] Product portfolio
- [x] Agent architecture
- [x] Master PRD
- [x] Master SOP
- [x] Technical stack
- [x] Safety/verification policy
- [x] Repository-wide AGENTS.md

## Platform
- [x] GitHub repository
- [x] Next.js scaffold
- [x] Command Center UI
- [x] Agent control-plane concept
- [x] Aviation Explanation Engine domain layer
- [x] Content Factory domain layer
- [x] Product Factory domain layer
- [x] Database schema draft
- [x] CI workflow scaffold
- [x] Persistent database adapter
- [x] Read/create API for topics; read API for sources and content assets
- [x] Authentication — server-side session verification
- [ ] Sign-in UI
- [ ] CRUD for products; update/delete for topics and assets
- [ ] Agent execution API beyond the explanation engine
- [x] Generation core — provider adapter, structured outputs, versioned
      prompts, token/cost accounting (Phase 01)
- [x] Research/source registry — 14 verified authoritative sources, write API,
      link-rot checker
- [x] QA/approval gate (enforced in the database, not only in code)
- [x] Claim-level verification with citations, credentialed reviewers, and an
      append-only decision log (Phase 02)
- [ ] RAG knowledge base
- [ ] Explanation Engine UI
- [x] Content package generator (single-concept; batch run is Phase 05)
- [ ] Content package generator across the topic backlog
- [ ] Assessment engine
- [ ] Book production generator
- [x] Product checkout (Stripe, verified webhooks, entitlements in RLS)

## Design and assets
- [x] Design system and tokens
- [x] Deterministic asset rendering (cover, social, worksheet)
- [x] Review state carried into the artwork
- [x] Asset storage split by approval, with provenance
- [ ] Chapter diagrams from the generated visual model
- [ ] Book interior layout / PDF export

## Content
- [x] Initial 100-topic seed
- [ ] 100-topic validated research backlog
- [ ] Four 100-page trainer books
- [ ] Marketing series
- [ ] Pilot Life / wellness series
- [ ] Aviation fun/experience series
- [ ] YouTube production system
- [ ] Podcast production system
- [ ] Short-form repurposing system

## Growth
- [ ] Diagnostic lead magnet
- [ ] Email nurture
- [ ] Product ladder implementation
- [ ] Analytics
- [ ] SEO/content clusters
- [ ] Automated publishing

## Infrastructure
- [x] GitHub repository
- [x] Vercel project linked and auto-deploying `main`
- [x] Production build passing
- [x] Self-hosted Supabase reachable over HTTPS
- [x] CI: typecheck, build, schema verification, API verification, secret scan
- [ ] Supabase schema applied to the live instance
- [ ] Vercel environment variables set
- [ ] Successful production deployment
- [ ] OpenAI production credential
- [ ] Stripe
- [ ] Domain

## Definition of done
A checkbox becomes [x] only after implementation and verification. External services are never marked complete from configuration alone; the live integration must be tested.
