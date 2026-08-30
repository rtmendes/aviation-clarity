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
| `/api/explain` | POST | none | Aviation Explanation Engine, with QA gate and audit trail |

Write routes use the Supabase secret key, which bypasses Row Level Security, so
they require `AVIATION_CLARITY_API_TOKEN` as a bearer token and fail closed when
it is unset.

## Verification

```bash
npm run typecheck
npm run build
npm run verify:api      # routes end to end against a PostgREST stub
npm run verify:schema   # migrations against a real PostgreSQL database
npm run smoke           # connectivity to the self-hosted Supabase instance
```

CI runs all of these, plus a scan for committed credentials.

## Architecture

Next.js + TypeScript on Vercel, backed by self-hosted Supabase at
`supabase.insightprofit.live`, with secrets in Infisical.

Business logic stays provider-agnostic: AI, database, payments, analytics,
email, and media integrations sit behind adapters.

See `docs/MASTER-PRD.md`, `docs/DEPLOYMENT.md`, and `docs/CHECKLIST.md`.
