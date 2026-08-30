import 'server-only';

import { getServerConfig } from '@/lib/env';

/**
 * Supabase Auth session verification.
 *
 * The access token is verified by asking Supabase who it belongs to, rather
 * than by decoding the JWT here. Decoding locally would mean holding the JWT
 * secret in the application and reimplementing expiry, revocation and audience
 * checks — three things that are easy to get subtly wrong and that Supabase
 * already does. The cost is a network call per request; the benefit is that a
 * revoked session stops working immediately.
 */

export type SessionUser = {
  id: string;
  email: string;
};

export type SessionResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401 | 503; message: string };

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;
  const token = rest.join(' ').trim();
  return token || null;
}

export async function getSessionUser(request: Request): Promise<SessionResult> {
  const config = getServerConfig();
  if (!config.ok) {
    return { ok: false, status: 503, message: 'Supabase is not configured for this environment.' };
  }

  const token = bearerToken(request);
  if (!token) {
    return { ok: false, status: 401, message: 'Sign in to continue.' };
  }

  try {
    const response = await fetch(`${config.config.url}/auth/v1/user`, {
      headers: {
        apikey: config.config.publishableKey,
        authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return { ok: false, status: 401, message: 'That session is not valid.' };
    }

    const user = (await response.json()) as { id?: string; email?: string };
    if (!user.id || !user.email) {
      return { ok: false, status: 401, message: 'That session has no usable identity.' };
    }

    return { ok: true, user: { id: user.id, email: user.email.toLowerCase() } };
  } catch {
    return { ok: false, status: 503, message: 'Could not reach the authentication service.' };
  }
}
