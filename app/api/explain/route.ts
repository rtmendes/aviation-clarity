import { describeProvider } from '@/lib/ai';
import { explain } from '@/lib/generation/explain';
import { fail, ok, optionalEnum, readJson, requireString } from '@/lib/http';
import type { Sensitivity } from '@/lib/types';

export const dynamic = 'force-dynamic';
// Generation is slower than a normal request; the default function timeout
// would cut a long completion off mid-flight.
export const maxDuration = 60;

const SENSITIVITIES: readonly Sensitivity[] = [
  'general',
  'technical',
  'regulatory',
  'safety',
  'medical',
];

/**
 * Aviation Explanation Engine.
 *
 * Produces a structured content package for one concept. Output is an
 * instructional aid, never operational guidance: every package is run through
 * the QA gate, and anything flagged is persisted as needing review rather than
 * as usable content.
 *
 * With no AI provider configured the route still answers, in `scaffold` mode,
 * returning the deterministic outline. The response always says which mode
 * produced it so a caller is never misled about what it is holding.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body.ok) return fail(body.message, 400);

  const topic = requireString(body.value, 'topic', { maxLength: 300 });
  if (!topic.ok) return fail(topic.message, 400);

  const sensitivity = optionalEnum(body.value, 'sensitivity', SENSITIVITIES, 'technical');
  if (!sensitivity.ok) return fail(sensitivity.message, 400);

  const audience = typeof body.value.audience === 'string' ? body.value.audience : undefined;
  const topicId = typeof body.value.topicId === 'string' ? body.value.topicId : undefined;
  const forceScaffold = body.value.mode === 'scaffold';

  const outcome = await explain({
    topic: topic.value,
    sensitivity: sensitivity.value,
    ...(audience ? { audience } : {}),
    ...(topicId ? { topicId } : {}),
    ...(forceScaffold ? { forceScaffold: true } : {}),
  });

  if (!outcome.ok) {
    // 502 for an upstream problem, 422 when the model answered but the answer
    // was unusable — these need different operator responses.
    const status = outcome.error.code === 'upstream' ? 502 : 422;
    return fail(outcome.error.message, status, { code: outcome.error.code });
  }

  return ok(outcome.result);
}

/** Reports whether generation is available, without exposing credentials. */
export async function GET() {
  const provider = describeProvider();
  return ok({
    engine: 'aviation-explanation-engine',
    generation: provider.configured
      ? { available: true, provider: provider.name, model: provider.modelId }
      : { available: false, mode: 'scaffold', reason: 'No AI provider is configured.' },
  });
}
