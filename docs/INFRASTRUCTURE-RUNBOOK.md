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
Create development and production projects separately. Apply migrations through a controlled migration workflow. Enable Row Level Security before exposing user-owned data.

Required logical tables:
- profiles
- topics
- sources
- claims
- knowledge_units
- workflows
- content_assets
- products
- product_events
- assessments
- assessment_attempts
- analytics_events

## OpenAI
Use runtime-injected credentials. Keep model selection and provider calls behind an adapter. Log request metadata and costs, not secret values.

## Stripe
Use test mode first. Verify webhook signatures. Treat webhook events as the source of truth for payment state.

## Deployment acceptance
A deployment is complete only when:
- build succeeds
- health endpoint returns success
- critical routes load
- environment variables resolve
- database connectivity succeeds
- no secrets appear in logs
- smoke tests pass

## Security
Never paste credentials into ChatGPT, GitHub issues, source files, prompts, or commit messages. Use Infisical or the deployment platform's secret mechanism.
