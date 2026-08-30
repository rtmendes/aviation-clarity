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
- [ ] Authentication (Supabase Auth sessions; writes token-gated in the interim)
- [ ] CRUD for products; update/delete for topics and assets
- [ ] Agent execution API beyond the explanation engine
- [ ] OpenAI production integration
- [x] Research/source registry (schema plus read API)
- [x] QA/approval gate (enforced in the database, not only in code)
- [ ] RAG knowledge base
- [ ] Explanation Engine UI
- [ ] Content package generator
- [ ] Assessment engine
- [ ] Book production generator
- [ ] Product checkout

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
