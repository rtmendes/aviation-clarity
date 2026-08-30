import { integrationStatus } from '@/lib/env';
import { ok } from '@/lib/http';
import { probeDatabase } from '@/lib/repositories';

import pkg from '@/package.json';

// A health check must reflect the state of this instance right now, so it is
// never prerendered or cached.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Deployment acceptance gate.
 *
 * This performs a real round trip to Supabase rather than reporting whether
 * environment variables happen to be set — "database connectivity succeeds" is
 * only meaningful if something actually connected.
 *
 * `ok` is true only when the database is reachable AND the schema is applied,
 * so a deploy against an unmigrated instance fails the gate.
 */
export async function GET() {
  const integrations = integrationStatus();
  const database = await probeDatabase();

  const healthy = database.reachable && database.schemaReady;

  return ok(
    {
      ok: healthy,
      service: 'aviation-clarity',
      version: pkg.version,
      timestamp: new Date().toISOString(),
      database,
      integrations: {
        // The URL is not a secret and is useful for confirming which instance
        // a deployment is pointed at. Keys are reported as booleans only.
        supabaseUrl: integrations.supabaseUrl,
        supabasePublishableKey: integrations.supabasePublishableKey,
        supabaseSecretKey: integrations.supabaseSecretKey,
        openai: integrations.openai,
        stripe: integrations.stripe,
      },
    },
    healthy ? 200 : 503,
  );
}
