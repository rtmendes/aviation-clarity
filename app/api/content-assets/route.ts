import { fail, ok, respond } from '@/lib/http';
import { listContentAssets } from '@/lib/repositories';
import type { TopicStatus } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

const STATUSES: readonly TopicStatus[] = [
  'queued',
  'researching',
  'verified',
  'generating',
  'qa',
  'approved',
  'published',
  'blocked',
];

export async function GET(request: Request) {
  const statusParam = new URL(request.url).searchParams.get('status');
  if (statusParam && !STATUSES.includes(statusParam as TopicStatus)) {
    return fail(`"status" must be one of: ${STATUSES.join(', ')}.`, 400);
  }

  const result = await listContentAssets(
    statusParam ? (statusParam as TopicStatus) : undefined,
  );
  if (!result.ok) return respond(result);
  return ok({ assets: result.data, count: result.data.length });
}
