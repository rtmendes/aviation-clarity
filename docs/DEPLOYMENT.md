# Deployment Runbook

## Vercel
1. Import `rtmendes/aviation-clarity` into the connected Vercel team.
2. Framework: Next.js. Root: `/`. Build: `next build`.
3. Add environment variables from `.env.example` in Vercel Project Settings.
4. Deploy preview, run `/api/health`, then promote to production.
5. Enable automatic deployments from the default branch.

## Supabase
1. Create a production project.
2. Apply `schemas/database.sql`.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` only in Vercel environment settings.

## OpenAI
Set `OPENAI_API_KEY` only as a Vercel secret/environment variable. Never commit it.

## Stripe
Set `STRIPE_SECRET_KEY` only in Vercel. Add webhook verification before accepting production payment events.

## Acceptance gates
- `/api/health` returns `ok:true`.
- No secrets appear in git history.
- CI passes.
- Safety-critical content is blocked or escalated until authoritative verification/review.
