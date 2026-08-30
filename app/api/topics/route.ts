import { authorizeWrite } from '@/lib/auth';
import {
  fail,
  ok,
  optionalEnum,
  optionalInt,
  readJson,
  requireString,
  respond,
} from '@/lib/http';
import { createTopic, listTopics } from '@/lib/repositories';
import type { Sensitivity, TopicStatus } from '@/lib/supabase/types';

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

const SENSITIVITIES: readonly Sensitivity[] = [
  'general',
  'technical',
  'regulatory',
  'safety',
  'medical',
];

export async function GET(request: Request) {
  const url = new URL(request.url);

  const statusParam = url.searchParams.get('status');
  if (statusParam && !STATUSES.includes(statusParam as TopicStatus)) {
    return fail(`"status" must be one of: ${STATUSES.join(', ')}.`, 400);
  }

  const limitParam = url.searchParams.get('limit');
  let limit: number | undefined;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
      return fail('"limit" must be an integer between 1 and 200.', 400);
    }
    limit = parsed;
  }

  const result = await listTopics({
    ...(statusParam ? { status: statusParam as TopicStatus } : {}),
    ...(limit ? { limit } : {}),
  });

  if (!result.ok) return respond(result);
  return ok({ topics: result.data, count: result.data.length });
}

export async function POST(request: Request) {
  // Creating a topic writes with the secret key, which bypasses RLS.
  const auth = authorizeWrite(request);
  if (!auth.ok) return fail(auth.message, auth.status);

  const body = await readJson(request);
  if (!body.ok) return fail(body.message, 400);

  const title = requireString(body.value, 'title', { maxLength: 300 });
  if (!title.ok) return fail(title.message, 400);

  const sensitivity = optionalEnum(body.value, 'sensitivity', SENSITIVITIES, 'technical');
  if (!sensitivity.ok) return fail(sensitivity.message, 400);

  const priority = optionalInt(body.value, 'priority', { min: 1, max: 5, fallback: 3 });
  if (!priority.ok) return fail(priority.message, 400);

  const audience = typeof body.value.audience === 'string' ? body.value.audience : undefined;
  const pillar = typeof body.value.pillar === 'string' ? body.value.pillar : undefined;

  const result = await createTopic({
    title: title.value,
    sensitivity: sensitivity.value,
    priority: priority.value,
    ...(audience ? { audience } : {}),
    ...(pillar ? { pillar } : {}),
  });

  return respond(result, 201);
}
