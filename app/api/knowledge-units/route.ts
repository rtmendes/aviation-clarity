import { fail, ok, respond } from '@/lib/http';
import { listKnowledgeUnits } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

/**
 * The generated knowledge base. Units awaiting review are visible here so a
 * reviewer has a queue to work from; Row Level Security keeps anything not yet
 * approved away from anonymous callers.
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
