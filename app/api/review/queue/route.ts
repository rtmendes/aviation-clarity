import { fail, ok, respond } from '@/lib/http';
import { listReviewQueue } from '@/lib/repositories/review';

export const dynamic = 'force-dynamic';

/**
 * What is waiting for a qualified human, ordered by unverified risk so the
 * units carrying the most regulatory or operational exposure come first.
 */
export async function GET(request: Request) {
  const limitParam = new URL(request.url).searchParams.get('limit');

  let limit = 25;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return fail('"limit" must be an integer between 1 and 100.', 400);
    }
    limit = parsed;
  }

  const result = await listReviewQueue(limit);
  if (!result.ok) return respond(result);

  return ok({
    queue: result.data,
    count: result.data.length,
    awaitingReview: result.data.filter((e) => e.unverifiedCount > 0).length,
    readyToApprove: result.data.filter((e) => e.readyToApprove).length,
  });
}
