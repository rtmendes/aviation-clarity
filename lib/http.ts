import { NextResponse } from 'next/server';

import type { RepoError, Result } from '@/lib/repositories';

/** Responses from these routes are per-request state; never cache them. */
const noStore = { 'Cache-Control': 'no-store' } as const;

export function ok<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: noStore });
}

export function fail(
  message: string,
  status: number,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status, headers: noStore });
}

/**
 * Maps a repository failure onto an HTTP status.
 *
 * `not_configured` is 503 rather than 500: the deployment is missing
 * environment variables, which is an operator action, not a bug in the code.
 */
export function failFromRepo(error: RepoError): NextResponse {
  switch (error.code) {
    case 'not_configured':
      return fail(error.message, 503, {
        missing: error.missing ?? [],
        invalid: error.invalid ?? [],
      });
    case 'not_found':
      return fail(error.message, 404);
    case 'invalid':
      return fail(error.message, 400);
    case 'unavailable':
    default:
      return fail('Upstream database error.', 502);
  }
}

export function respond<T>(result: Result<T>, status = 200): NextResponse {
  return result.ok ? ok(result.data, status) : failFromRepo(result.error);
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export async function readJson(request: Request): Promise<Parsed<Record<string, unknown>>> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { ok: false, message: 'Request body must be a JSON object.' };
    }
    return { ok: true, value: body as Record<string, unknown> };
  } catch {
    return { ok: false, message: 'Request body must be valid JSON.' };
  }
}

export function requireString(
  body: Record<string, unknown>,
  key: string,
  { maxLength = 500 }: { maxLength?: number } = {},
): Parsed<string> {
  const raw = body[key];
  if (typeof raw !== 'string') return { ok: false, message: `"${key}" must be a string.` };
  const value = raw.trim();
  if (!value) return { ok: false, message: `"${key}" is required.` };
  if (value.length > maxLength) {
    return { ok: false, message: `"${key}" must be at most ${maxLength} characters.` };
  }
  return { ok: true, value };
}

export function optionalEnum<T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): Parsed<T> {
  const raw = body[key];
  if (raw === undefined || raw === null) return { ok: true, value: fallback };
  if (typeof raw !== 'string' || !allowed.includes(raw as T)) {
    return { ok: false, message: `"${key}" must be one of: ${allowed.join(', ')}.` };
  }
  return { ok: true, value: raw as T };
}

export function optionalInt(
  body: Record<string, unknown>,
  key: string,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): Parsed<number> {
  const raw = body[key];
  if (raw === undefined || raw === null) return { ok: true, value: fallback };
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    return { ok: false, message: `"${key}" must be an integer between ${min} and ${max}.` };
  }
  return { ok: true, value };
}
