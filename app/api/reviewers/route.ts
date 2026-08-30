import { ok, respond } from '@/lib/http';
import { listReviewers } from '@/lib/repositories/review';

export const dynamic = 'force-dynamic';

/** The credentialed people who can sign off on content. */
export async function GET() {
  const result = await listReviewers();
  if (!result.ok) return respond(result);
  return ok({ reviewers: result.data, count: result.data.length });
}
