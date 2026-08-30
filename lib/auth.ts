import 'server-only';

import { timingSafeEqual } from 'node:crypto';

/**
 * Authorisation for mutating API routes.
 *
 * Write routes run with the Supabase secret key, which bypasses Row Level
 * Security. An unauthenticated caller must therefore never reach one. Until
 * Supabase Auth sessions are wired into the UI, writes are gated behind a
 * single operator token supplied through the secret manager.
 *
 * If `AVIATION_CLARITY_API_TOKEN` is unset, writes are refused rather than
 * allowed — an unconfigured deployment fails closed.
 */

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authorizeWrite(request: Request): AuthResult {
  const expected = process.env.AVIATION_CLARITY_API_TOKEN?.trim();

  if (!expected) {
    return {
      ok: false,
      status: 503,
      message:
        'Write access is not configured. Set AVIATION_CLARITY_API_TOKEN in the deployment environment.',
    };
  }

  const header = request.headers.get('authorization') ?? '';
  const [scheme, ...rest] = header.split(' ');
  const presented = rest.join(' ').trim();

  if (scheme?.toLowerCase() !== 'bearer' || !presented || !safeEqual(presented, expected)) {
    return { ok: false, status: 401, message: 'Unauthorized.' };
  }

  return { ok: true };
}
