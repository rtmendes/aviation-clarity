import { authorizeWrite } from '@/lib/auth';
import { fail, ok, readJson, requireString } from '@/lib/http';
import { approveKnowledgeUnit, getReviewer } from '@/lib/repositories/review';

export const dynamic = 'force-dynamic';

/**
 * Approve a knowledge unit.
 *
 * Refused while any of its claims is unverified — enforced by a database
 * trigger, so it holds even for a caller holding the secret key. This is the
 * gate that separates generated content from content that can be published.
 */
export async function POST(request: Request) {
  const auth = authorizeWrite(request);
  if (!auth.ok) return fail(auth.message, auth.status);

  const body = await readJson(request);
  if (!body.ok) return fail(body.message, 400);

  const unitId = requireString(body.value, 'unitId', { maxLength: 64 });
  if (!unitId.ok) return fail(unitId.message, 400);

  const reviewerId = requireString(body.value, 'reviewerId', { maxLength: 64 });
  if (!reviewerId.ok) return fail(reviewerId.message, 400);

  const reviewer = await getReviewer(reviewerId.value);
  if (!reviewer.ok) {
    return fail(reviewer.error.message, reviewer.error.code === 'not_found' ? 404 : 400);
  }

  const note = typeof body.value.note === 'string' ? body.value.note : undefined;

  const result = await approveKnowledgeUnit({
    unitId: unitId.value,
    reviewerId: reviewerId.value,
    ...(note ? { note } : {}),
  });

  if (!result.ok) {
    const status =
      result.error.code === 'invalid' ? 422
      : result.error.code === 'not_found' ? 404
      : result.error.code === 'not_configured' ? 503
      : 502;
    return fail(result.error.message, status);
  }

  return ok({
    unit: result.data,
    approvedBy: {
      id: reviewer.data.id,
      name: reviewer.data.name,
      credential: reviewer.data.credential,
      credentialRef: reviewer.data.credential_ref,
    },
  });
}
