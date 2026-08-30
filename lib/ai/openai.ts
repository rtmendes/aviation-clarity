import 'server-only';

import { LEARNING_MODEL_JSON_SCHEMA, validateLearningModel } from './schema';
import type { GenerationOutcome, GenerationProvider, GenerationRequest } from './provider';

/**
 * OpenAI implementation of the generation boundary.
 *
 * This is the only file in the tree that knows OpenAI's request shape. It is
 * written against the HTTP API rather than the vendor SDK: the surface used
 * here is one endpoint, and avoiding the SDK keeps the dependency count — and
 * the lockfile — small, which is what broke this project's builds before.
 */

const DEFAULT_MODEL = 'gpt-4o-2024-08-06';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 60_000;

function numberFromEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Cost is computed only when per-million-token prices are configured, so the
 * figure recorded against a run is either accurate or absent. Guessing at
 * prices that change would put wrong numbers into the audit trail.
 */
function computeCostUsd(inputTokens: number | null, outputTokens: number | null): number | null {
  const inputPrice = numberFromEnv('OPENAI_INPUT_COST_PER_MTOK');
  const outputPrice = numberFromEnv('OPENAI_OUTPUT_COST_PER_MTOK');
  if (inputPrice === null || outputPrice === null) return null;
  if (inputTokens === null || outputTokens === null) return null;
  const cost = (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export class OpenAIProvider implements GenerationProvider {
  readonly name = 'openai';
  readonly modelId: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.modelId = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
    // Overridable so the pipeline can be pointed at a compatible gateway, a
    // self-hosted proxy, or the stub used by the verification suite.
    this.baseUrl = (process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  async generate(request: GenerationRequest): Promise<GenerationOutcome> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelId,
          max_completion_tokens: request.maxOutputTokens ?? 2000,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          // Structured output: the model is constrained to the contract rather
          // than asked politely to follow it.
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'aviation_learning_model',
              strict: true,
              schema: LEARNING_MODEL_JSON_SCHEMA,
            },
          },
        }),
      });

      if (!response.ok) {
        // The body can echo request content; only the status is forwarded.
        return {
          ok: false,
          code: 'upstream',
          message: `Provider returned HTTP ${response.status}.`,
          providerName: this.name,
          durationMs: Date.now() - startedAt,
        };
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string; refusal?: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const choice = payload.choices?.[0]?.message;

      if (choice?.refusal) {
        return {
          ok: false,
          code: 'refused',
          message: 'The model declined to generate this content.',
          providerName: this.name,
          durationMs: Date.now() - startedAt,
        };
      }

      if (!choice?.content) {
        return {
          ok: false,
          code: 'malformed',
          message: 'Provider returned no content.',
          providerName: this.name,
          durationMs: Date.now() - startedAt,
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(choice.content);
      } catch {
        return {
          ok: false,
          code: 'malformed',
          message: 'Provider returned content that was not valid JSON.',
          providerName: this.name,
          durationMs: Date.now() - startedAt,
        };
      }

      const validated = validateLearningModel(parsed);
      if (!validated.ok) {
        return {
          ok: false,
          code: 'malformed',
          message: `Response did not match the content contract: ${validated.problems.join(' ')}`,
          providerName: this.name,
          durationMs: Date.now() - startedAt,
        };
      }

      const inputTokens = payload.usage?.prompt_tokens ?? null;
      const outputTokens = payload.usage?.completion_tokens ?? null;

      return {
        ok: true,
        value: validated.value,
        providerName: this.name,
        modelId: this.modelId,
        usage: { inputTokens, outputTokens },
        costUsd: computeCostUsd(inputTokens, outputTokens),
        durationMs: Date.now() - startedAt,
      };
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === 'AbortError';
      return {
        ok: false,
        code: 'upstream',
        message: aborted
          ? `Provider did not respond within ${DEFAULT_TIMEOUT_MS / 1000}s.`
          : `Could not reach the provider: ${cause instanceof Error ? cause.message : 'unknown error'}`,
        providerName: this.name,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
