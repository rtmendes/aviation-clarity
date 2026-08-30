# Deployment Runbook

Verified 2026-08-30. Every claim below was checked against the live services;
anything not yet verified is marked as outstanding rather than assumed.

## Current state

| Item | State |
| --- | --- |
| GitHub repository `rtmendes/aviation-clarity` | exists |
| Vercel project `aviation-clarity` (`prj_QZt1qE4ayYfAvhEnXskU8AcoFEqW`) | exists, linked to the repo, auto-deploys `main` |
| Vercel team | `Rashida Mendes' projects` (`team_RDc9rfG2nyUydjZvco8L06C9`) |
| Production deployments | were failing; the build fix is on this branch and not yet merged |
| Self-hosted Supabase `https://supabase.insightprofit.live` | gateway reachable over HTTPS, behind Kong and Cloudflare |
| Supabase schema | migrations written and tested locally, **not yet applied to the instance** |
| Vercel environment variables | **not yet set** |

## Why the deployments were failing

`typescript` was declared as `"latest"` with no lockfile committed, so each
build resolved a new version. It reached TypeScript 7, which removed the
`baseUrl` compiler option, and `next build` aborted with `TS5102`. Versions
are now pinned, `package-lock.json` is committed, and installs use `npm ci`.

## 1. Vercel environment variables

Set these in Project Settings → Environment Variables, for Production and
Preview. Take the values from Infisical; do not paste them anywhere else.

| Name | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | all | `https://supabase.insightprofit.live` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | all | publishable key; RLS applies |
| `SUPABASE_SECRET_KEY` | all | server-only, bypasses RLS |
| `AVIATION_CLARITY_API_TOKEN` | all | required for write routes |

If the instance predates the publishable/secret naming, set
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` instead. The
application accepts either pair.

`NEXT_PUBLIC_*` values are inlined at build time, so a change to one requires a
redeploy, not just a restart.

## 2. Apply the database schema

```bash
psql "$POSTGRES_URL" -f supabase/migrations/0001_init.sql
psql "$POSTGRES_URL" -f supabase/migrations/0002_rls.sql
```

Both files are idempotent. `0002` enables Row Level Security on every table, so
apply it before any real data exists.

To check the migrations against a throwaway database first:

```bash
npm run verify:schema
```

## 3. Deploy

Pushing to `main` deploys automatically. To deploy by hand:

```bash
vercel link
vercel deploy          # preview
vercel --prod          # production
```

## 4. Verify

```bash
# Gateway reachability and environment contract
infisical run --env=dev --path=/aviation-clarity -- npm run smoke

# Deployed application
APP_URL=https://<deployment-url> npm run smoke
curl -s https://<deployment-url>/api/health | jq
```

`/api/health` returns `ok: true` only when Supabase answers a real query **and**
the schema is present. It returns 503 otherwise, with `database.detail`
distinguishing the cases:

- `Not configured: missing ...` — environment variables are not set.
- `Unreachable: ...` — the gateway could not be contacted.
- `Connected, but the schema is not applied.` — run the migrations.
- `Connected and schema present.` — healthy.

## Acceptance gates

A deployment is complete only when all of these hold:

- [ ] Build succeeds.
- [ ] `/api/health` returns `ok: true` with `database.schemaReady: true`.
- [ ] `/api/topics` returns 200.
- [ ] A write to `/api/topics` without a bearer token returns 401.
- [ ] `npm run smoke` passes.
- [ ] No secret appears in the repository, build logs, or the browser bundle.
- [ ] Safety-critical content is blocked or escalated until authoritative
      verification and qualified review.

## OpenAI and Stripe

Neither is wired into the application yet. `/api/health` reports whether their
keys are present, nothing more. When they are added, keep them behind adapters,
use Stripe test mode first, and verify webhook signatures.
