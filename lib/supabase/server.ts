import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getServerConfig } from '@/lib/env';
import type { Database } from './types';

export type Client = SupabaseClient<Database>;

export type ClientResult =
  | { ok: true; client: Client; privileged: boolean }
  | { ok: false; missing: string[] };

let cachedPublic: Client | null = null;
let cachedAdmin: Client | null = null;

const serverOptions = {
  auth: {
    // Route handlers are stateless; there is no browser storage to persist a
    // session into, and refreshing tokens in a serverless function leaks work
    // across requests.
    persistSession: false,
    autoRefreshToken: false,
  },
} as const;

/**
 * Client bound to the publishable key. Row Level Security applies, so this only
 * sees rows the `anon` role is allowed to see. Use for public reads.
 */
export function getSupabase(): ClientResult {
  const result = getServerConfig();
  if (!result.ok) return { ok: false, missing: result.missing };

  cachedPublic ??= createClient<Database>(
    result.config.url,
    result.config.publishableKey,
    serverOptions,
  );

  return { ok: true, client: cachedPublic, privileged: false };
}

/**
 * Client bound to the secret key. Bypasses Row Level Security entirely.
 *
 * Only ever call this from server-side code that has already authorised the
 * request. It must never be reachable from a route that echoes arbitrary
 * user-supplied filters back into a query.
 */
export function getAdminSupabase(): ClientResult {
  const result = getServerConfig();
  if (!result.ok) return { ok: false, missing: result.missing };

  const { url, secretKey } = result.config;
  if (!secretKey) return { ok: false, missing: ['SUPABASE_SECRET_KEY'] };

  cachedAdmin ??= createClient<Database>(url, secretKey, serverOptions);

  return { ok: true, client: cachedAdmin, privileged: true };
}

/** Test seam: clears the memoised clients so env changes take effect. */
export function resetSupabaseClients(): void {
  cachedPublic = null;
  cachedAdmin = null;
}
