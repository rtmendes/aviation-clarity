import { buildLearningModel, safetyScan } from '@/lib/explanation-engine';
import { fail, ok, optionalEnum, readJson, requireString } from '@/lib/http';
import { recordAgentRun } from '@/lib/repositories';
import type { Sensitivity } from '@/lib/types';
import { detectRisk } from '@/src/core/aviation-explanation';
import { qaContent } from '@/src/core/qa';

export const dynamic = 'force-dynamic';

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
 * The response is an instructional scaffold, not verified aviation guidance.
 * Every run is passed through the QA gate and recorded in `agent_runs` so that
 * what was generated, and what it was flagged for, is auditable after the fact.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();

  const body = await readJson(request);
  if (!body.ok) return fail(body.message, 400);

  const topic = requireString(body.value, 'topic', { maxLength: 300 });
  if (!topic.ok) return fail(topic.message, 400);

  const sensitivity = optionalEnum(body.value, 'sensitivity', SENSITIVITIES, 'technical');
  if (!sensitivity.ok) return fail(sensitivity.message, 400);

  const model = buildLearningModel(topic.value, sensitivity.value);
  const serialized = JSON.stringify(model);

  const scan = safetyScan(serialized);
  const qa = qaContent(`${topic.value}\n${serialized}`);
  const riskFlags = detectRisk(`${topic.value} ${serialized}`);

  // Anything the QA gate blocks, or the safety scanner flags, requires
  // qualified human review before this can be published or used operationally.
  const requiresReview = scan.blocked || !qa.pass || riskFlags.length > 0;

  const payload = {
    topic: topic.value,
    sensitivity: sensitivity.value,
    model,
    safety: {
      ...scan,
      riskFlags,
      qa,
      requiresHumanReview: requiresReview,
      notice: requiresReview
        ? 'Instructional aid only. Verify against authoritative sources and obtain qualified review before operational use or publication.'
        : 'Instructional aid only. Not a substitute for authoritative guidance.',
    },
    generatedAt: new Date().toISOString(),
  };

  // The audit trail is best-effort: losing it must not cost the caller their
  // response, but a failure to record is reported so it is not silent.
  const audit = await recordAgentRun({
    agentName: 'aviation-translator',
    status: requiresReview ? 'blocked' : 'complete',
    input: { topic: topic.value, sensitivity: sensitivity.value },
    output: model,
    safetyFlags: [...scan.flags, ...riskFlags, ...qa.findings.map((f) => f.code)],
    durationMs: Date.now() - startedAt,
  });

  return ok({
    ...payload,
    audit: audit.ok
      ? { recorded: true, runId: audit.data.id }
      : { recorded: false, reason: audit.error.message },
  });
}
