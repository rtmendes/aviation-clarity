# Infisical → Vercel → Self-hosted Supabase integration

## Target
- GitHub: `rtmendes/aviation-clarity`
- Vercel team: `Rashida Mendes' projects`
- Self-hosted Supabase: `https://supabase.insightprofit.live`
- Secret manager: Infisical

## Important
No secret values belong in GitHub, chat, `.env` files, or logs. Infisical supports runtime injection with `infisical run -- ...`; this is the preferred local/agent pattern.

## Required Infisical variables

```text
SUPABASE_URL=https://supabase.insightprofit.live
NEXT_PUBLIC_SUPABASE_URL=https://supabase.insightprofit.live
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_SECRET_KEY=<server-only secret>
AVIATION_CLARITY_API_TOKEN=<server-only; gates the write routes>
POSTGRES_URL=<server-only; used only to apply migrations>
OPENAI_API_KEY=<server-only>
STRIPE_SECRET_KEY=<server-only>
STRIPE_WEBHOOK_SECRET=<server-only>
```

If the instance predates the publishable/secret naming, substitute
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The
application reads either pair, preferring the current naming; see `lib/env.ts`.
`.env.example` is the canonical list of names.

Only define the variables actually supported by the deployed Supabase version. New self-hosted Supabase releases use `SUPABASE_PUBLIC_URL` and `API_EXTERNAL_URL` for the service URLs; the application should use the public API URL, not the Studio/admin URL.

## Local verification

```bash
# Gateway reachability plus the environment contract
infisical run --env=dev --path=/aviation-clarity -- npm run smoke

# Migrations against a throwaway PostgreSQL database
npm run verify:schema

# API routes end to end against a PostgREST-compatible stub
npm run build && npm run verify:api
```

The smoke script prints only presence and status, never secret values.

## Vercel

Verified 2026-08-30: the project **does** exist and is already linked.

- Team: `Rashida Mendes' projects` (`team_RDc9rfG2nyUydjZvco8L06C9`)
- Project: `aviation-clarity` (`prj_QZt1qE4ayYfAvhEnXskU8AcoFEqW`)
- Git link: `rtmendes/aviation-clarity`, auto-deploying `main`

An earlier revision of this document stated that no such project was visible.
That was wrong, and it mattered: the checklist carried "Vercel project linked"
as outstanding while the real problem was that every deployment was failing to
build. See `docs/DEPLOYMENT.md`.

What remains is configuration, not creation: set the production and preview
environment variables from Infisical, then redeploy. `NEXT_PUBLIC_*` values are
inlined at build time, so changing one requires a new deployment.

## Self-hosted Supabase

Verified 2026-08-30: `https://supabase.insightprofit.live` resolves, TLS
terminates correctly, and both `/rest/v1/` and `/auth/v1/settings` are served
by Kong behind Cloudflare.

Note that an unauthenticated request to a healthy gateway returns **HTTP 401**
with `{"message":"No API key found in request"}`. That is the correct response
and proves the gateway is alive. An earlier version of `scripts/integration-smoke.sh`
used `curl -fsS`, which treats 401 as a failure, and so reported this healthy
instance as unreachable. The script now accepts 401 as proof of life, and sends
the key when one is available.

## Definition of done

Checked items were verified against the live services on 2026-08-30.

1. [x] Supabase URL resolves and TLS terminates correctly.
2. [x] REST and Auth endpoints are reachable over HTTPS.
3. [ ] Publishable key works for client-side requests — needs the key.
4. [ ] Server-only secret works only from server code — needs the key.
5. [ ] Database migration applied to the instance — written and locally tested,
       not yet applied.
6. [ ] Vercel preview deploy succeeds — blocked until the build fix merges.
7. [ ] Production deploy succeeds — same.
8. [ ] Application health endpoint returns `ok: true` — requires 3 and 5.
9. [x] No secret appears in the repository; CI enforces this with
       `scripts/secret-scan.sh`.
