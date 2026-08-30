import { authorizeWrite } from '@/lib/auth';
import { fail, ok, optionalEnum, readJson, requireString, respond } from '@/lib/http';
import { listSources } from '@/lib/repositories';
import { createSource } from '@/lib/repositories/review';
import type { SourceType } from '@/lib/supabase/types';

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

const SOURCE_TYPES: readonly SourceType[] = [
  'faa',
  'regulation',
  'government',
  'manufacturer',
  'school',
  'academic',
  'industry',
  'other',
];

/** Register a document reviewers can cite. */
export async function POST(request: Request) {
  const auth = authorizeWrite(request);
  if (!auth.ok) return fail(auth.message, auth.status);

  const body = await readJson(request);
  if (!body.ok) return fail(body.message, 400);

  const title = requireString(body.value, 'title', { maxLength: 300 });
  if (!title.ok) return fail(title.message, 400);

  const url = requireString(body.value, 'url', { maxLength: 2000 });
  if (!url.ok) return fail(url.message, 400);

  // A citation nobody can open is not a citation.
  let parsed: URL;
  try {
    parsed = new URL(url.value);
  } catch {
    return fail('"url" must be an absolute http(s) URL.', 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail('"url" must be an absolute http(s) URL.', 400);
  }

  const sourceType = optionalEnum(body.value, 'sourceType', SOURCE_TYPES, 'other');
  if (!sourceType.ok) return fail(sourceType.message, 400);

  const notes = typeof body.value.notes === 'string' ? body.value.notes : undefined;

  const result = await createSource({
    title: title.value,
    url: url.value,
    sourceType: sourceType.value,
    ...(notes ? { notes } : {}),
  });

  if (!result.ok) {
    const status =
      result.error.code === 'invalid' ? 409
      : result.error.code === 'not_configured' ? 503
      : 502;
    return fail(result.error.message, status);
  }

  return ok(result.data, 201);
}
