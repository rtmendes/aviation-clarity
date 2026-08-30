import 'server-only';

import { getGenerationProvider } from '@/lib/ai';
import { PROMPT_VERSION, buildSystemPrompt, buildUserPrompt } from '@/lib/ai/prompts';
import type { GeneratedLearningModel } from '@/lib/ai/schema';
import { buildLearningModel } from '@/lib/explanation-engine';
import { createKnowledgeUnit, recordAgentRun } from '@/lib/repositories';
import type { Sensitivity } from '@/lib/types';
import { detectRisk } from '@/src/core/aviation-explanation';
import { qaContent, type QAReport } from '@/src/core/qa';

/**
 * The Aviation Explanation Engine.
 *
 * Order matters here. Generation happens first, then the safety gate runs on
 * what was actually produced — not on the request. Gating the prompt would
 * check the wrong artifact: the risk lives in the output.
 *
 * Nothing generated is ever written as verified. The QA gate can only decide
 * between "needs review" and "not yet flagged"; only a qualified human moves
 * content past that, which is why `knowledge_units.status` never receives
 * 'verified' from this path.
 */

export type ExplainMode = 'ai' | 'scaffold';

export type ExplainInput = {
  topic: string;
  sensitivity: Sensitivity;
  audience?: string;
  topicId?: string | null;
  /** Skip generation and return the deterministic outline. */
  forceScaffold?: boolean;
};

export type Safety = {
  requiresHumanReview: boolean;
  qa: QAReport;
  riskFlags: string[];
  /** Claims the model itself flagged as needing an authoritative source. */
  claimsRequiringVerification: string[];
  notice: string;
};

export type ExplainResult = {
  topic: string;
  sensitivity: Sensitivity;
  mode: ExplainMode;
  model: GeneratedLearningModel;
  safety: Safety;
  generation: {
    provider: string | null;
    modelId: string | null;
    promptVersion: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    durationMs: number;
  };
  persistence: { stored: boolean; knowledgeUnitId?: string; reason?: string };
  audit: { recorded: boolean; runId?: string; reason?: string };
  generatedAt: string;
};

export type ExplainFailure = {
  code: 'refused' | 'malformed' | 'upstream';
  message: string;
};

const REVIEW_NOTICE =
  'Instructional aid only. Generated content — verify against authoritative sources and obtain qualified review before operational use or publication.';
const BASE_NOTICE =
  'Instructional aid only. Generated content, not a substitute for authoritative guidance.';

/**
 * Adapts the deterministic outline to the generated shape so both modes return
 * the same contract. The outline is a brief for a writer, not teaching content,
 * which is why the fields it cannot honestly fill say so.
 */
function scaffoldModel(topic: string, sensitivity: Sensitivity): GeneratedLearningModel {
  const base = buildLearningModel(topic, sensitivity);
  return {
    plainLanguage: base.simple,
    technicalFrame: 'Not generated: no AI provider is configured for this deployment.',
    analogy: base.analogy,
    analogyLimits: 'Not generated: no AI provider is configured for this deployment.',
    visualModel: base.visual,
    scenario: base.scenario,
    memoryHook: base.memoryHook,
    retrievalQuestions: base.retrievalQuestions,
    commonMisconceptions: [],
    instructorPrompt: base.instructorPrompt,
    claimsRequiringVerification: [],
  };
}

function assessSafety(topic: string, model: GeneratedLearningModel): Safety {
  // The whole package is scanned, not just the prose fields: a scenario or an
  // instructor prompt can carry an operational claim as readily as the
  // explanation can.
  const corpus = [
    topic,
    model.plainLanguage,
    model.technicalFrame,
    model.analogy,
    model.analogyLimits,
    model.visualModel,
    model.scenario,
    model.memoryHook,
    model.instructorPrompt,
    ...model.retrievalQuestions,
    ...model.commonMisconceptions,
  ].join('\n');

  const qa = qaContent(corpus);
  const riskFlags = detectRisk(corpus);
  const claims = model.claimsRequiringVerification;

  const requiresHumanReview = !qa.pass || riskFlags.length > 0 || claims.length > 0;

  return {
    requiresHumanReview,
    qa,
    riskFlags,
    claimsRequiringVerification: claims,
    notice: requiresHumanReview ? REVIEW_NOTICE : BASE_NOTICE,
  };
}

export async function explain(
  input: ExplainInput,
): Promise<{ ok: true; result: ExplainResult } | { ok: false; error: ExplainFailure }> {
  const startedAt = Date.now();
  const provider = input.forceScaffold ? null : getGenerationProvider();

  let model: GeneratedLearningModel;
  let mode: ExplainMode;
  let providerName: string | null = null;
  let modelId: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let costUsd: number | null = null;

  if (provider) {
    const outcome = await provider.generate({
      systemPrompt: buildSystemPrompt(input.sensitivity),
      userPrompt: buildUserPrompt({
        topic: input.topic,
        sensitivity: input.sensitivity,
        ...(input.audience ? { audience: input.audience } : {}),
      }),
    });

    if (!outcome.ok) {
      // A generation failure is recorded before returning: an unlogged failed
      // run makes cost and reliability impossible to reason about later.
      await recordAgentRun({
        agentName: 'aviation-translator',
        topicId: input.topicId ?? null,
        status: 'failed',
        input: {
          topic: input.topic,
          sensitivity: input.sensitivity,
          mode: 'ai',
          promptVersion: PROMPT_VERSION,
          provider: provider.name,
          modelId: provider.modelId,
        },
        error: `${outcome.code}: ${outcome.message}`,
        durationMs: outcome.durationMs,
      });

      return { ok: false, error: { code: outcome.code === 'not_configured' ? 'upstream' : outcome.code, message: outcome.message } };
    }

    model = outcome.value;
    mode = 'ai';
    providerName = outcome.providerName;
    modelId = outcome.modelId;
    inputTokens = outcome.usage.inputTokens;
    outputTokens = outcome.usage.outputTokens;
    costUsd = outcome.costUsd;
  } else {
    model = scaffoldModel(input.topic, input.sensitivity);
    mode = 'scaffold';
  }

  const safety = assessSafety(input.topic, model);

  // Only real generated content is persisted. Storing the scaffold would fill
  // the knowledge base with briefs that look like lessons.
  let persistence: ExplainResult['persistence'] = {
    stored: false,
    reason: mode === 'scaffold' ? 'Scaffold output is not persisted.' : undefined,
  };

  if (mode === 'ai') {
    const stored = await createKnowledgeUnit({
      summary: model.plainLanguage.slice(0, 500),
      learningModel: model as unknown as Record<string, never>,
      topicId: input.topicId ?? null,
      status: safety.requiresHumanReview ? 'review' : 'draft',
    });

    persistence = stored.ok
      ? { stored: true, knowledgeUnitId: stored.data.id }
      : { stored: false, reason: stored.error.message };
  }

  const audit = await recordAgentRun({
    agentName: 'aviation-translator',
    topicId: input.topicId ?? null,
    status: safety.requiresHumanReview ? 'blocked' : 'complete',
    input: {
      topic: input.topic,
      sensitivity: input.sensitivity,
      mode,
      promptVersion: PROMPT_VERSION,
      provider: providerName,
      modelId,
    },
    output: model as unknown as Record<string, never>,
    safetyFlags: [
      ...safety.qa.findings.map((f) => f.code),
      ...safety.riskFlags,
      ...(safety.claimsRequiringVerification.length > 0 ? ['MODEL_FLAGGED_CLAIMS'] : []),
    ],
    durationMs: Date.now() - startedAt,
  });

  return {
    ok: true,
    result: {
      topic: input.topic,
      sensitivity: input.sensitivity,
      mode,
      model,
      safety,
      generation: {
        provider: providerName,
        modelId,
        promptVersion: PROMPT_VERSION,
        inputTokens,
        outputTokens,
        costUsd,
        durationMs: Date.now() - startedAt,
      },
      persistence,
      audit: audit.ok
        ? { recorded: true, runId: audit.data.id }
        : { recorded: false, reason: audit.error.message },
      generatedAt: new Date().toISOString(),
    },
  };
}
