# Infrastructure Runbook

## Local development
1. Clone repository.
2. Authenticate Infisical.
3. Link the project/environment with Infisical.
4. Run the app with runtime secret injection; never commit `.env` secrets.

## Vercel
Vercel's Git integration supports automatic deployments for GitHub branches and pull requests. Link `rtmendes/aviation-clarity` to the Vercel team/project and set the production branch to the repository default branch.

Recommended CLI sequence:

```bash
vercel login
vercel link
vercel env pull
vercel deploy
vercel --prod
```

Verify `/api/health` after deployment.

## Supabase

The deployment targets the self-hosted instance at
`https://supabase.insightprofit.live`. Row Level Security is enabled on every
table by `supabase/migrations/0002_rls.sql`, which must be applied before any
user-owned data exists.

All required logical tables are implemented in `supabase/migrations/0001_init.sql`:

| Table | Purpose |
| --- | --- |
| `profiles` | user records, linked to `auth.users` |
| `topics` | the work queue, with sensitivity and workflow status |
| `sources` | authoritative research registry |
| `claims` | statements, with the sources backing them |
| `claim_sources` | join table between the two |
| `knowledge_units` | verified, teachable units |
| `workflows` | auditable per-topic state machine |
| `content_assets` | generated assets and their QA findings |
| `products` | product catalogue |
| `product_events` | funnel and revenue events |
| `assessments` | question sets |
| `assessment_attempts` | learner attempts and scores |
| `agent_runs` | audit trail for every agent invocation |
| `analytics_events` | product analytics |

Two policy rules are enforced by database constraints rather than application
code, because application code can be bypassed by anything holding the secret
key: a content asset cannot reach `published` without a recorded approver and
timestamp, and a claim cannot be marked verified without recording who verified
it and when.

Verify a schema change before applying it to the instance:

```bash
npm run verify:schema
```

## OpenAI
Use runtime-injected credentials. Keep model selection and provider calls behind an adapter. Log request metadata and costs, not secret values.

## Stripe
Use test mode first. Verify webhook signatures. Treat webhook events as the source of truth for payment state.

## Deployment acceptance
A deployment is complete only when:
- build succeeds
- `/api/health` returns `ok: true`, which requires a real database round trip
  and the schema being present — it is not satisfied by environment variables
  merely being set
- critical routes load
- environment variables resolve
- no secrets appear in logs or the browser bundle
- `npm run smoke` passes against the deployment

See `docs/DEPLOYMENT.md` for the current verified state of each gate.

## Security
Never paste credentials into ChatGPT, GitHub issues, source files, prompts, or commit messages. Use Infisical or the deployment platform's secret mechanism.
