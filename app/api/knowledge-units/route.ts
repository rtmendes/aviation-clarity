import { fail, ok, respond } from '@/lib/http';
import { listKnowledgeUnits } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

/**
 * The approved knowledge base — what a reader is allowed to see.
 *
 * This reads through the anon key, and Row Level Security admits only units at
 * `approved`, so nothing awaiting review appears here however the caller is
 * signed in. An earlier comment claimed this doubled as a reviewer's queue; it
 * never could, because the key it reads with is the same for every caller. The
 * queue is `/api/review/queue`, which reads privileged and is token-gated.
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

  const result = await listKnowledgeUnits(limit);
  if (!result.ok) return respond(result);
  return ok({ units: result.data, count: result.data.length });
}
