import { authorizeWrite } from '@/lib/auth';
import { fail, ok, readJson, requireString } from '@/lib/http';
import { getReviewer, verifyClaim } from '@/lib/repositories/review';

export const dynamic = 'force-dynamic';

/**
 * Verify one claim against the sources a reviewer cites.
 *
 * Two things must be true and both are checked before anything is written: the
 * reviewer exists and is active, and at least one real source is cited. The
 * database refuses the write regardless — this only makes the refusal legible.
 */
export async function POST(request: Request) {
  const auth = authorizeWrite(request);
  if (!auth.ok) return fail(auth.message, auth.status);

  const body = await readJson(request);
  if (!body.ok) return fail(body.message, 400);

  const claimId = requireString(body.value, 'claimId', { maxLength: 64 });
  if (!claimId.ok) return fail(claimId.message, 400);

  const reviewerId = requireString(body.value, 'reviewerId', { maxLength: 64 });
  if (!reviewerId.ok) return fail(reviewerId.message, 400);

  const raw = body.value.sourceIds;
  if (!Array.isArray(raw) || raw.some((s) => typeof s !== 'string')) {
    return fail('"sourceIds" must be an array of source ids.', 400);
  }
  // Citing nothing is a review decision, not a malformed request, so it gets
  // the same wording the rule uses everywhere else.
  if (raw.length === 0) {
    return fail('Cite at least one source before verifying this claim.', 422);
  }

  // Establish the reviewer before writing: an approval that cannot name a
  // credentialed person is not an approval.
  const reviewer = await getReviewer(reviewerId.value);
  if (!reviewer.ok) {
    return fail(reviewer.error.message, reviewer.error.code === 'not_found' ? 404 : 400);
  }

  const note = typeof body.value.note === 'string' ? body.value.note : undefined;

  const result = await verifyClaim({
    claimId: claimId.value,
    reviewerId: reviewerId.value,
    sourceIds: raw as string[],
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
    claim: result.data,
    verifiedBy: { id: reviewer.data.id, name: reviewer.data.name, credential: reviewer.data.credential },
  });
}
