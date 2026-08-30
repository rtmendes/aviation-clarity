'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types';

/**
 * Browser client.
 *
 * The env references below are written out literally because Next.js inlines
 * `NEXT_PUBLIC_*` at build time only for static property accesses — a computed
 * lookup would resolve to `undefined` in the bundle.
 *
 * Only the publishable key is read here. The secret key must never reach a
 * browser bundle, so it is deliberately unreachable from this module.
 */
let cached: SupabaseClient<Database> | null = null;

export function getBrowserSupabase(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  cached ??= createClient<Database>(url, key);
  return cached;
}
