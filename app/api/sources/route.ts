import { fail, ok, respond } from '@/lib/http';
import { listSources } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

/** The citation trail behind published material. Read-only and public. */
export async function GET(request: Request) {
  const limitParam = new URL(request.url).searchParams.get('limit');

  let limit = 50;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
      return fail('"limit" must be an integer between 1 and 200.', 400);
    }
    limit = parsed;
  }

  const result = await listSources(limit);
  if (!result.ok) return respond(result);
  return ok({ sources: result.data, count: result.data.length });
}
