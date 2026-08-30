import { getSessionUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http';
import { listEntitlements } from '@/lib/repositories/commerce';

export const dynamic = 'force-dynamic';

/**
 * What the signed-in buyer owns.
 *
 * Scoped to the email on their verified session — never to an email supplied
 * in the request, which would let anyone read anyone else's purchases.
 */
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session.ok) return fail(session.message, session.status);

  const result = await listEntitlements(session.user.email);
  if (!result.ok) {
    const status = result.error.code === 'not_configured' ? 503 : 502;
    return fail(result.error.message, status);
  }

  return ok({
    email: session.user.email,
    entitlements: result.data,
    count: result.data.length,
  });
}
