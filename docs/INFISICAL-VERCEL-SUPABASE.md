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
SUPABASE_PUBLISHABLE_KEY=<secret-manager value>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_SECRET_KEY=<server-only secret>
SUPABASE_SERVICE_ROLE_KEY=<legacy server-only key if the deployment uses it>
POSTGRES_URL=<server-only connection string if migrations require it>
OPENAI_API_KEY=<server-only>
STRIPE_SECRET_KEY=<server-only>
STRIPE_WEBHOOK_SECRET=<server-only>
```

Only define the variables actually supported by the deployed Supabase version. New self-hosted Supabase releases use `SUPABASE_PUBLIC_URL` and `API_EXTERNAL_URL` for the service URLs; the application should use the public API URL, not the Studio/admin URL.

## Local verification

```bash
infisical run --env=dev --path=/aviation-clarity -- bash scripts/integration-smoke.sh
```

The script deliberately prints only presence/status and never secret values.

## Vercel

The connected Vercel account is accessible to the integration, but the current Vercel connector exposes deployment/project inspection rather than project creation/linking from an arbitrary GitHub repository. The Vercel team currently visible to the connector is `Rashida Mendes' projects` (`team_RDc9rfG2nyUydjZvco8L06C9`). No `aviation-clarity` Vercel project is currently visible.

Once the Vercel project exists and is linked to `rtmendes/aviation-clarity`, configure production/preview environment variables from the secret manager strategy and redeploy after changes.

## Self-hosted Supabase

The public endpoint must be reachable from Vercel. If the API is behind a reverse proxy, TLS must terminate correctly and the public URL must route to the Supabase API gateway. Verify `/rest/v1/` and `/auth/v1/settings` before declaring the integration healthy.

## Definition of done
1. Supabase URL resolves from the deployment environment.
2. REST and Auth endpoints are reachable over HTTPS.
3. Publishable key works for client-side requests.
4. Server-only secret works only from server code.
5. Database migration succeeds against the intended project.
6. Vercel preview deploy succeeds.
7. Production deploy succeeds.
8. Application health endpoint succeeds.
9. No secret appears in GitHub, build logs, browser bundles, or application logs.
