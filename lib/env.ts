/**
 * Environment resolution for the self-hosted Supabase deployment.
 *
 * Two things make this less trivial than reading `process.env` directly:
 *
 * 1. Supabase renamed its API keys. Recent releases issue a *publishable* key
 *    and a *secret* key; older ones issue *anon* and *service_role* JWTs. The
 *    self-hosted instance may be on either, so both namings are accepted, with
 *    the current naming taking precedence.
 *
 * 2. `NEXT_PUBLIC_*` values are inlined at build time only when referenced as a
 *    static property access. They are therefore listed literally below rather
 *    than looked up through a computed key.
 *
 * Nothing here throws at import time. A missing configuration has to surface as
 * a handled 503 from a route, not as a crash during `next build` — the build
 * runs without production secrets.
 */

export const DEFAULT_SUPABASE_URL = 'https://supabase.insightprofit.live';

export type SupabaseServerConfig = {
  url: string;
  /** Safe to expose to browsers. Subject to Row Level Security. */
  publishableKey: string;
  /** Server-only. Bypasses Row Level Security. Never send this to a client. */
  secretKey: string | null;
};

export type ConfigResult<T> =
  | { ok: true; config: T }
  | { ok: false; missing: string[]; invalid: string[] };

function firstPresent(...values: (string | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Public API URL of the Supabase gateway — not the Studio/admin URL. */
export function resolveSupabaseUrl(): string | null {
  return firstPresent(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  );
}

/** Publishable (formerly "anon") key. Row Level Security applies. */
export function resolvePublishableKey(): string | null {
  return firstPresent(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
  );
}

/** Secret (formerly "service_role") key. Bypasses Row Level Security. */
export function resolveSecretKey(): string | null {
  return firstPresent(
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * True when `value` is a URL supabase-js will accept.
 *
 * supabase-js throws on a malformed URL rather than returning an error, so a
 * value like `supabase.insightprofit.live` (no scheme) would otherwise escape
 * as an unhandled 500 from whichever route touched it first.
 */
export function isValidSupabaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getServerConfig(): ConfigResult<SupabaseServerConfig> {
  const url = resolveSupabaseUrl();
  const publishableKey = resolvePublishableKey();

  const missing: string[] = [];
  const invalid: string[] = [];

  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  else if (!isValidSupabaseUrl(url)) {
    invalid.push(
      'NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) must be an absolute http(s) URL, ' +
        'for example https://supabase.insightprofit.live',
    );
  }

  if (!publishableKey) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

  if (!url || !publishableKey || invalid.length > 0) {
    return { ok: false, missing, invalid };
  }

  return {
    ok: true,
    config: { url, publishableKey, secretKey: resolveSecretKey() },
  };
}

/**
 * Reports which integrations are configured, without ever revealing a value.
 * Used by the health endpoint.
 */
export function integrationStatus() {
  return {
    supabaseUrl: resolveSupabaseUrl(),
    supabasePublishableKey: Boolean(resolvePublishableKey()),
    supabaseSecretKey: Boolean(resolveSecretKey()),
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
  };
}
