# Aviation Clarity™

AI-native aviation learning, growth, career, and content operating system.

**Mission:** Make aviation easier to understand, teach, grow, and live.

## Safety

Technical aviation, regulatory, medical, and safety-critical material requires
authoritative-source verification and appropriate qualified human review before
operational use or publication. Model output is never authoritative on its own.

This is enforced, not just stated:

- `/api/explain` runs every response through a QA gate and flags anything
  regulatory, operational, or medical as requiring human review.
- The database refuses to mark content `published` without a recorded approver,
  and refuses to mark a claim verified without recording who verified it.

## Getting started

```bash
npm ci
npm run dev
```

Secrets are injected at runtime and never written to disk:

```bash
infisical run --env=dev --path=/aviation-clarity -- npm run dev
```

The application starts and builds without Supabase credentials; API routes
return 503 naming the missing variables until they are provided. See
`.env.example` for the full contract.

## Layout

| Path | Contents |
| --- | --- |
| `app/` | Next.js App Router pages and API routes |
| `lib/` | environment resolution, Supabase clients, repositories, HTTP helpers |
| `src/core/` | provider-agnostic domain logic (QA, research registry, orchestration) |
| `supabase/migrations/` | database schema and Row Level Security |
| `scripts/` | verification and smoke-test tooling |
| `docs/` | product and infrastructure documentation |

## API

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/health` | GET | none | real database round trip; 503 unless reachable and migrated |
| `/api/topics` | GET | none | list topics |
| `/api/topics` | POST | bearer token | create a topic |
| `/api/sources` | GET | none | list authoritative sources |
| `/api/content-assets` | GET | none | list generated assets |
| `/api/explain` | POST | none | Aviation Explanation Engine — generates a content package, gates it, persists it |
| `/api/explain` | GET | none | whether generation is available, and on which model |
| `/api/knowledge-units` | GET | none | the generated knowledge base and the review queue |

Write routes use the Supabase secret key, which bypasses Row Level Security, so
they require `AVIATION_CLARITY_API_TOKEN` as a bearer token and fail closed when
it is unset.

## The Explanation Engine

`POST /api/explain` turns one aviation concept into a structured content
package: plain-language explanation, technical frame, a bounded analogy, a
visual model, a scenario, a memory hook, retrieval questions, misconceptions,
and an instructor prompt.

```bash
curl -sX POST https://<host>/api/explain \
  -H 'content-type: application/json' \
  -d '{"topic":"Why airplanes stall","sensitivity":"safety"}'
```

Two modes, and the response always says which one produced it:

- **`ai`** — real generation, when a provider is configured. Persisted to
  `knowledge_units` and recorded in `agent_runs` with prompt version, token
  counts and cost.
- **`scaffold`** — the deterministic outline, when no provider is configured.
  Never persisted, because it is a brief for a writer rather than teaching
  content.

Generated content is never stored as `verified`. Anything the QA gate flags —
regulatory, operational or medical claims, plus anything the model itself flags
— is stored as `review` and waits for a qualified human. That gate is the
difference between a sellable product and a liability.

Providers sit behind `GenerationProvider` in `lib/ai/`, so swapping vendors
does not touch product code. Adding one means implementing the interface and
registering it in `lib/ai/index.ts`.

## Assets

`GET /api/assets/{cover|social|worksheet}` renders artwork from templates —
no manual design step, and no headless browser. It uses `next/og` (satori plus
resvg), which Next already ships, so the renderer adds no dependency.

```bash
curl -o cover.png "https://<host>/api/assets/cover?\
title=Decode%20Aviation&eyebrow=Train%20the%20Trainer&state=approved"
```

Every asset is a pure function of its URL: same URL, byte-identical PNG. That
is what makes ~1,600 assets tractable — output can be cached hard, diffed, and
re-rendered on demand instead of stored as precious one-offs. Fonts are
vendored in `assets/fonts/` (both SIL Open Font Licence) rather than fetched,
because a render that depends on a network call is neither deterministic nor
reliable in production.

**Review state is part of the artwork.** Anything not approved carries an
unmistakable band — `DRAFT — NOT REVIEWED` in amber, or `BLOCKED — DO NOT
PUBLISH` in red. `state` defaults to `draft`, so an asset whose review status is
unknown never renders as if it were finished. An unreviewed worksheet that
looks publishable is how unverified aviation material reaches a student.

Design tokens live in `lib/design/tokens.ts` and are the single source of truth
for both the site and the artwork; `npm run verify:tokens` fails CI if
`globals.css` drifts from them.

Rendered assets are stored in two Supabase buckets rather than one with a flag:
`assets-draft` is private, `assets-approved` is public. Moving an object between
them *is* the publish step. Nothing can be stored without recording the template
version, the inputs and a checksum — a database constraint, so an asset that
cannot be reproduced cannot be saved.

## Buying

`POST /api/checkout` starts a purchase and returns a Stripe Checkout URL. It is
deliberately unauthenticated: requiring an account before payment loses buyers,
and Checkout collects a verified email anyway. The price comes from the product
row, never from the request — a client-supplied amount is a client-chosen
amount.

**Entitlements are keyed to an email, not an account.** The purchase grants
against the email Checkout captured; it resolves to a profile whenever that
person first signs in. Refunds set `revoked_at` rather than deleting, so the
history survives.

**Webhooks are the source of truth for payment state**, and they are verified
before anything touches the database:

1. Signature checked against the **raw** body, in constant time, with a
   five-minute replay window. Re-serialising parsed JSON changes key order and
   the signature will never match.
2. The event is recorded under Stripe's own id as primary key. Stripe retries
   until it gets a 2xx, so the same event arrives repeatedly as a matter of
   course; a retry collides by construction rather than granting twice.
3. Only then is it acted on.

Signature verification lives in `lib/payments/signature.ts`, free of any
environment access so it can be tested directly:

```bash
npm run verify:signature   # forgery, tampering, replay, secret rotation
```

**Access is enforced in Row Level Security**, not in a route. A signed-in buyer
reads a paid asset only while a live entitlement matches the verified email on
their token. `authenticated` is split by `public.is_staff()`: staff read the
working set, everyone signed in reads what is published plus what they paid
for.

Neither Stripe nor the model provider uses a vendor SDK. Both surfaces are a
couple of HTTP endpoints, and this project's builds were broken once already by
a dependency resolving a new major at deploy time.

## Verification and review

Generation is the cheap half. What makes aviation training material safe to
publish is that a qualified human checked its claims against authoritative
sources and signed their name to it.

Two rules are enforced by **database triggers**, not application code, because
anything holding the Supabase secret key can bypass application code:

- **A claim cannot be verified without a cited source.**
- **A knowledge unit cannot be approved while any of its claims is unverified.**

The flow:

1. Generation writes each `claimsRequiringVerification` entry into `claims`,
   linked to the unit it came from. Regulatory, safety and medical topics are
   recorded as high risk.
2. `GET /api/review/queue` lists what is waiting, ordered by unverified risk so
   the highest-exposure units surface first.
3. `POST /api/review/claims` verifies one claim against sources from the
   registry, recording which credentialed reviewer did it.
4. `POST /api/review/units` approves the unit — refused until every claim is
   verified.

Every decision is appended to `review_events`, because in a safety-critical
domain the sequence of decisions is itself evidence and state columns get
overwritten by the next one.

Reviewers live in their own table rather than `profiles`, which is keyed to
`auth.users` and so cannot be populated until Phase 04. It is also the better
model: what matters on an approval is which credentialed person signed it
(`CFI`, `CFII`, `AME`, `DPE`…) and their certificate number, not which account
was logged in.

### The source registry

`supabase/seed/authoritative-sources.sql` seeds 14 documents — 14 CFR parts,
FAA handbooks, the AIM, the ACS, NTSB investigations. Every URL was confirmed to
resolve before it was added; a citation registry with dead links is worse than
an empty one, because a reviewer trusts it.

```bash
npm run verify:sources   # re-check for link rot
```

## Verification

```bash
npm run typecheck
npm run build
npm run verify:api      # routes end to end against a PostgREST stub
npm run verify:schema   # migrations against a real PostgreSQL database
npm run verify:sources  # every registered citation still resolves
npm run verify:tokens   # globals.css has not drifted from the design tokens
npm run verify:signature # Stripe webhook signature verification
npm run smoke           # connectivity to the self-hosted Supabase instance
```

CI runs all of these, plus a scan for committed credentials.

## Architecture

Next.js + TypeScript on Vercel, backed by self-hosted Supabase at
`supabase.insightprofit.live`, with secrets in Infisical.

Business logic stays provider-agnostic: AI, database, payments, analytics,
email, and media integrations sit behind adapters.

See `docs/MASTER-PRD.md`, `docs/DEPLOYMENT.md`, and `docs/CHECKLIST.md`.
